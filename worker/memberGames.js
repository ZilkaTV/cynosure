// Edge read-cache for cyn_member_games_cache in front of Supabase.
// Deliberately a DIFFERENT shape than roster.js/clanLedger.js's one-blob
// mirror: this table is already 5+ MB (confirmed directly) and only grows
// as members play more games, with no upper bound - well past what's safe
// to JSON.parse inside a single Worker invocation's CPU budget on every
// request, and most of it is irrelevant to any one request anyway (a
// single-member profile page only ever wanted one row; the old direct
// Supabase query was already scoped with `.in('openfront_id', ids)` for
// exactly that reason). So this mirrors one KV key PER MEMBER instead,
// and a request only reads the specific keys it asked for.
//
// It's also the one cache in this file set with a real client write path
// (src/lib/openfront.ts's saveSharedPlayerGames, used when a brand-new
// registration's first live OpenFront fetch backfills their history) - the
// cron isn't the only writer. Mirroring the whole table every scheduled()
// tick regardless of what changed would mean up to 47+ KV writes every 10
// minutes forever, which is unnecessary traffic for data that mostly
// doesn't change cycle to cycle. Diffing by `updated_at` against a
// watermark (stored as its own KV key) keeps write volume proportional to
// how many members actually got new games since the last tick.
import { createClient } from '@supabase/supabase-js'

const KV_PREFIX = 'member-games:v1:'
const SYNC_MARKER_KEY = `${KV_PREFIX}_sync_marker`
// Generous relative to the 10-minute refresh cycle, same reasoning as
// roster.js: an occasional missed scheduled() tick should still serve the
// last-good snapshot. This table "only ever grows" (see
// saveSharedPlayerGames's own comment in openfront.ts), so a stale KV read
// is never wrong, only potentially missing a player's most recent game.
const KV_TTL_SECONDS = 24 * 60 * 60

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

function supabaseClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
}

/**
 * Called from scheduled() every ~10 minutes. Reads only the rows Supabase
 * says changed since the last sync (the watermark is captured BEFORE the
 * query runs, so a write landing mid-query is simply picked up on the
 * NEXT tick instead of being lost - never a race that drops a row).
 */
// PostgREST caps an unpaginated select at 1000 rows by default - confirmed
// live against cyn_clan_score_ledger (see clanLedger.js's own comment on
// this same constant). This table has ~50 members today, nowhere near that,
// but paging defensively here too means it's never a landmine if the
// roster ever grows past it.
const PAGE_SIZE = 1000

export async function refreshMemberGamesKv(env) {
  if (!env.ROSTER_KV) return
  const supabase = supabaseClient(env)
  const since = (await env.ROSTER_KV.get(SYNC_MARKER_KEY)) ?? '1970-01-01T00:00:00Z'
  const nextMarker = new Date().toISOString()

  const changed = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cyn_member_games_cache')
      .select('openfront_id, games, updated_at')
      .gt('updated_at', since)
      .order('openfront_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('refreshMemberGamesKv: Supabase read failed', error)
      return
    }
    changed.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }

  await Promise.all(changed.map((row) => env.ROSTER_KV.put(`${KV_PREFIX}${row.openfront_id}`, JSON.stringify(row.games), { expirationTtl: KV_TTL_SECONDS })))
  await env.ROSTER_KV.put(SYNC_MARKER_KEY, nextMarker, { expirationTtl: KV_TTL_SECONDS * 7 })
}

/**
 * GET /api/member-games?ids=a,b,c - batch per-member KV reads (one per
 * requested id, same shape as the old `.in('openfront_id', ids)` query),
 * with a direct Supabase read for any id that's missing from KV (brand new
 * member the sync hasn't reached yet, or a cold cache on first deploy).
 */
export async function handleMemberGames(request, env) {
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids') ?? ''
  const ids = [...new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) return jsonResponse({})

  const result = {}
  const missing = []
  if (env.ROSTER_KV) {
    const values = await Promise.all(ids.map((id) => env.ROSTER_KV.get(`${KV_PREFIX}${id}`)))
    ids.forEach((id, i) => {
      if (values[i]) result[id] = JSON.parse(values[i])
      else missing.push(id)
    })
  } else {
    missing.push(...ids)
  }

  if (missing.length > 0) {
    const { data, error } = await supabaseClient(env).from('cyn_member_games_cache').select('openfront_id, games').in('openfront_id', missing)
    if (!error) for (const row of data ?? []) result[row.openfront_id] = row.games
  }

  return jsonResponse(result)
}
