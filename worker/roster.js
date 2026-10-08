// Edge read-cache for cyn_roster_cache in front of Supabase - see
// cynosure-overnight-research.md's "Workers KV" finding. cyn_roster_cache is
// read by every visitor on nearly every page load (ranked/FFA leaderboards,
// clan leaderboard, win-score forecast) but only changes once per cron run
// (~every 10 minutes, see scripts/refresh-details.mjs and
// scripts/compute-clan-score-ledger.mjs). Supabase stays the source of
// truth and the only thing any script writes to; this Worker mirrors the
// same row into Cloudflare KV (globally edge-replicated, single-digit-ms
// reads) right after every scheduled() tick, using the native KV binding -
// no extra Cloudflare API token/secret needed, unlike a GitHub-Actions-side
// write would require. GET /api/roster serves from KV and falls back to a
// direct Supabase read only on a genuine KV miss (first deploy, or the
// namespace was cleared) so a cold cache never means a broken page.
import { createClient } from '@supabase/supabase-js'
import { kvGet, kvPut, kvPutIfChanged } from './kvSafe.js'
import { useD1, d1Blob } from './hotStore.js'

const KV_KEY = 'cyn_roster_cache:v1'
// Comfortably longer than the 10-minute refresh cycle: an occasional missed
// scheduled() tick (a Cloudflare hiccup, not the GitHub-dispatch issue this
// same deploy also fixes) should still serve the last-good snapshot rather
// than fall through to Supabase on every request.
// Long on purpose: refreshRosterKv only writes when the roster changed, so an unchanged value is
// not re-written (and its TTL not renewed) every tick; a visitor miss just falls back to Supabase.
const KV_TTL_SECONDS = 7 * 24 * 60 * 60

const ROSTER_COLUMNS = 'ranked_1v1, ranked_2v2, ffa_leaderboard, clan_leaderboard, clan_leaderboard_top'

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

function supabaseClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
}

/** Called from scheduled() every ~10 minutes - refreshes the KV mirror from Supabase. */
export async function refreshRosterKv(env) {
  if (!env.ROSTER_KV || useD1(env)) return
  const { data, error } = await supabaseClient(env).from('cyn_roster_cache').select(ROSTER_COLUMNS).eq('id', 1).maybeSingle()
  if (error || !data) {
    console.error('refreshRosterKv: Supabase read failed', error)
    return
  }
  await kvPutIfChanged(env.ROSTER_KV, KV_KEY, JSON.stringify(data), { expirationTtl: KV_TTL_SECONDS })
}

/**
 * GET /api/roster - KV first, direct Supabase fallback on a miss.
 * `ctx` is required for the fallback path's warm-write: a Worker invocation
 * can be torn down the moment the response is returned, so a fire-and-forget
 * `.put()` not wrapped in `ctx.waitUntil()` is liable to never actually
 * finish (confirmed live: without this, every request kept missing KV and
 * falling back to Supabase, forever, even seconds apart).
 */
export async function handleRoster(request, env, ctx) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405)

  if (useD1(env)) {
    try {
      const doc = await d1Blob(env, 'roster')
      if (doc) {
        // The Worker refreshes the ranked Elo itself (worker/ranked.js) because GitHub's runners get
        // OpenFront's bot challenge on that endpoint: overlay the fresher boards on the roster document.
        const rankedText = await d1Blob(env, 'ranked').catch(() => null)
        if (rankedText) {
          const ranked = JSON.parse(rankedText)
          if (Date.now() - Date.parse(ranked.scanned_at) < 6 * 60 * 60 * 1000) {
            const merged = JSON.parse(doc)
            merged.ranked_1v1 = ranked.ranked_1v1
            merged.ranked_2v2 = ranked.ranked_2v2
            return new Response(JSON.stringify(merged), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'd1+ranked' } })
          }
        }
        return new Response(doc, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'd1' } })
      }
    } catch (err) {
      console.error('D1 roster read failed, falling back:', err?.message ?? err)
    }
  }

  if (env.ROSTER_KV) {
    const cached = await kvGet(env.ROSTER_KV, KV_KEY)
    if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'kv' } })
  }

  const { data, error } = await supabaseClient(env).from('cyn_roster_cache').select(ROSTER_COLUMNS).eq('id', 1).maybeSingle()
  if (error || !data) return jsonResponse({ error: 'roster_unavailable' }, 502)
  if (env.ROSTER_KV) {
    const warm = kvPut(env.ROSTER_KV, KV_KEY, JSON.stringify(data), { expirationTtl: KV_TTL_SECONDS })
    if (ctx) ctx.waitUntil(warm)
    else await warm
  }
  return jsonResponse(data, 200)
}
