// Edge read-cache for cyn_clan_score_ledger in front of Supabase - same
// reasoning as roster.js, applied here: this table is rebuilt wholesale by
// scripts/compute-clan-score-ledger.mjs every ~10 minutes and never written
// to by any client, so it's safe to mirror in full. Small enough (a few
// hundred KB for ~1000 games, confirmed directly) to keep as ONE blob and
// filter server-side per request - unlike cyn_member_games_cache (see
// memberGames.js), which is multiple MB and growing, this one comfortably
// fits a single Worker invocation's CPU budget to JSON.parse on every read.
// Reuses the ROSTER_KV namespace (a plain key-value bucket, nothing about
// it is roster-specific) under its own key prefix rather than provisioning
// a separate namespace for every cached table.
import { createClient } from '@supabase/supabase-js'
import { kvGet, kvPut, kvPutIfChanged } from './kvSafe.js'

const KV_KEY = 'cyn_clan_score_ledger:v1'
// The ledger is recomputed hourly and refreshRosterKv-style writes only happen on change, so keep it long.
const KV_TTL_SECONDS = 6 * 60 * 60

const LEDGER_COLUMNS = 'game_id, won, score, ratio_before, ratio_after'

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

function supabaseClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
}

// PostgREST caps an unpaginated select at 1000 rows by default - confirmed
// live: the table already holds 1346+ rows and a plain .select() silently
// came back with an arbitrary 1000 of them (no .order() to make "which
// 1000" predictable), so real games - including ones used to verify this
// exact migration - went missing from the API response with no error.
// Paging through with .range() until a page comes back short is the
// correct fix, not raising a higher assumed cap that will just be wrong
// again once the table grows past it.
const PAGE_SIZE = 1000

async function fetchWholeLedger(env) {
  const supabase = supabaseClient(env)
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cyn_clan_score_ledger')
      .select(LEDGER_COLUMNS)
      .order('game_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('clanLedger: Supabase read failed', error)
      return null
    }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

/** Called from scheduled() every ~10 minutes. */
export async function refreshClanLedgerKv(env) {
  if (!env.ROSTER_KV) return
  const rows = await fetchWholeLedger(env)
  if (rows === null) return
  await kvPutIfChanged(env.ROSTER_KV, KV_KEY, JSON.stringify(rows), { expirationTtl: KV_TTL_SECONDS })
}

/**
 * GET /api/clan-ledger?gameIds=a,b,c - every requested game's row, keyed by
 * gameId (a gameId missing from the response just isn't in the ledger -
 * same "no clan score to show" meaning as a missing row from the old direct
 * Supabase query). Reads the whole cached table from KV (small - see this
 * file's own comment) and filters to the requested ids server-side, so the
 * amount of data actually sent to the client matches what the old
 * `.in('game_id', gameIds)` query sent, not the full table every time.
 */
export async function handleClanLedger(request, env, ctx) {
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('gameIds') ?? ''
  const gameIds = new Set(
    idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  if (gameIds.size === 0) return jsonResponse({})

  let rows = null
  if (env.ROSTER_KV) {
    const cached = await kvGet(env.ROSTER_KV, KV_KEY)
    if (cached) rows = JSON.parse(cached)
  }
  if (rows === null) {
    rows = await fetchWholeLedger(env)
    if (rows === null) return jsonResponse({ error: 'ledger_unavailable' }, 502)
    if (env.ROSTER_KV) {
      const warm = kvPut(env.ROSTER_KV, KV_KEY, JSON.stringify(rows), { expirationTtl: KV_TTL_SECONDS })
      if (ctx) ctx.waitUntil(warm)
      else await warm
    }
  }

  const result = {}
  for (const row of rows) {
    if (gameIds.has(row.game_id)) result[row.game_id] = row
  }
  return jsonResponse(result)
}
