// Edge read-cache for cyn_game_detail_cache in front of Supabase - built in
// direct response to a real Supabase egress-quota overage (9.3GB/5GB in one
// billing cycle, confirmed live via the Supabase usage dashboard). Each row
// here is a full post-game report (~60KB, confirmed directly) and
// buildRoster's own comment (src/lib/stats.ts) documents a real roster
// needing 292 of these in ONE call - multiplied across every visitor whose
// browser doesn't already have a given game in its own permanent
// localStorage cache (a first visit, a cleared cache, a different device),
// this is almost certainly the dominant cause of the overage.
//
// Per-game KV key (same shape as memberGames.js, not one blob like
// clanLedger.js/roster.js) - this table is already multi-hundred-MB and
// only grows, same reasoning as memberGames.js's own comment. No scheduled()
// sync needed: unlike the other cached tables, a finished game's detail
// never changes once written (confirmed by openfront.ts's own
// fetchSharedGameDetail comment: "once a row exists, it's simply correct
// forever"), so lazy warm-on-first-read is sufficient - there's nothing to
// keep in sync.
import { createClient } from '@supabase/supabase-js'
import { kvGet, kvPut } from './kvSafe.js'

const KV_PREFIX = 'game-detail:v1:'
// Generous and somewhat arbitrary, since the DATA itself never goes stale -
// this is purely a storage-footprint bound, not a correctness one. An
// eviction after 60 days just means the next visitor who asks for that
// specific old game re-triggers one lazy Supabase fetch, same as a cold
// cache today - never wrong, only occasionally not-yet-warm.
const KV_TTL_SECONDS = 60 * 24 * 60 * 60

// Workers KV's free tier caps writes at 1000/day ACCOUNT-WIDE, shared with
// roster.js/clanLedger.js/memberGames.js's own (much smaller) scheduled
// writes. Confirmed live: deploying this file uncapped blew through that
// limit within 2-3 page loads right after deploy, when the cache was
// entirely cold and buildRoster's own "292 lookups in one call" (see this
// file's top comment) meant a single visitor's first request could try to
// warm close to 300 keys at once. Capping how many a single request ever
// warms spreads that cost across many requests/visitors over time instead -
// a few still-cold games on any one response is harmless (they're served
// correctly from Supabase either way, just not cached YET), so this never
// affects correctness, only how fast the cache fills in.
const MAX_WARM_PER_REQUEST = 20

// Hard cap on ids per request. Unbounded, one request could ask for
// thousands of games: every one not yet warmed in KV falls through to a
// single Supabase .in() query at ~60KB per row, i.e. a cheap, repeatable way
// to burn the Supabase egress quota (already exceeded once - see the
// 187% overage this endpoint was built to fix). The client chunks its
// batches under this (src/lib/openfront.ts), so legitimate use never hits it.
const MAX_IDS_PER_REQUEST = 200

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

function supabaseClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
}

/**
 * GET /api/game-detail?ids=a,b,c - per-game KV reads, with one batched
 * Supabase query for whatever's missing, each result warmed into KV
 * afterward (ctx.waitUntil'd - a response ending before an un-awaited KV
 * write completes was a real, already-fixed bug in roster.js earlier this
 * session) so the NEXT visitor asking for that same game - any visitor, any
 * browser, forever - gets it from the edge instead of hitting Supabase at
 * all.
 */
export async function handleGameDetail(request, env, ctx) {
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids') ?? ''
  const ids = [...new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) return jsonResponse({})
  if (ids.length > MAX_IDS_PER_REQUEST) return jsonResponse({ error: 'too_many_ids', max: MAX_IDS_PER_REQUEST }, 413)

  const result = {}
  const missing = []
  if (env.ROSTER_KV) {
    const values = await Promise.all(ids.map((id) => kvGet(env.ROSTER_KV, `${KV_PREFIX}${id}`)))
    ids.forEach((id, i) => {
      if (values[i]) result[id] = JSON.parse(values[i])
      else missing.push(id)
    })
  } else {
    missing.push(...ids)
  }

  if (missing.length > 0) {
    const { data, error } = await supabaseClient(env).from('cyn_game_detail_cache').select('game_id, detail').in('game_id', missing)
    if (!error) {
      const rows = data ?? []
      for (const row of rows) result[row.game_id] = row.detail
      if (env.ROSTER_KV && rows.length > 0) {
        // Best-effort per key - a single still-rate-limited PUT (e.g. during
        // today's KV quota block) must never reject the whole batch and
        // spam the Worker's error log; it just means that one game stays
        // cold for another request to pick up later.
        const warm = Promise.all(
          rows.slice(0, MAX_WARM_PER_REQUEST).map((row) =>
            kvPut(env.ROSTER_KV, `${KV_PREFIX}${row.game_id}`, JSON.stringify(row.detail), { expirationTtl: KV_TTL_SECONDS }),
          ),
        )
        if (ctx) ctx.waitUntil(warm)
        else await warm
      }
    }
  }

  return jsonResponse(result)
}
