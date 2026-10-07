// Cloudflare D1 store for the two big, script-written tables (per-member game lists and per-game
// details). They used to live in Supabase (cyn_member_games_cache / cyn_game_detail_cache), where
// every full read counted against the free 5.5 GB monthly egress - which got the project locked.
// D1 has no egress charge and resets its (generous) daily limits every day.
//
// The scripts talk to D1 through Cloudflare's REST API. Enabled when these env vars are set:
//   CLOUDFLARE_API_TOKEN   token with "D1 Edit"
//   CLOUDFLARE_ACCOUNT_ID
//   D1_DATABASE_ID
// Without them every function reports hotEnabled() === false and callers keep using Supabase.

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID
const DB = process.env.D1_DATABASE_ID
const TOKEN = process.env.CLOUDFLARE_API_TOKEN

export const hotEnabled = () => Boolean(ACCOUNT && DB && TOKEN)

async function query(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(60000),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body?.errors ?? body)?.slice(0, 300)}`)
  return body.result?.[0]?.results ?? []
}

// A D1 query takes at most 100 bound parameters.
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

// ── member game lists ────────────────────────────────────────────────────────

/** Digest for every member: { openfront_id, game_count, updated_at, digest } (digest is parsed JSON or null). */
export async function hotListMemberDigests() {
  const rows = await query('SELECT openfront_id, game_count, updated_at, digest FROM member_games')
  return rows.map((r) => ({ ...r, digest: r.digest ? JSON.parse(r.digest) : null }))
}

export async function hotGetMemberGames(openfrontId) {
  const rows = await query('SELECT games FROM member_games WHERE openfront_id = ?', [openfrontId])
  return rows[0] ? JSON.parse(rows[0].games) : null
}

/** [{ openfront_id, games }] for every member (hourly jobs: ledger, role sync). */
export async function hotGetAllMemberGames() {
  const ids = (await query('SELECT openfront_id FROM member_games ORDER BY openfront_id')).map((r) => r.openfront_id)
  const out = []
  for (const part of chunk(ids, 10)) {
    const rows = await query(`SELECT openfront_id, games FROM member_games WHERE openfront_id IN (${part.map(() => '?').join(',')})`, part)
    for (const r of rows) out.push({ openfront_id: r.openfront_id, games: JSON.parse(r.games) })
  }
  return out
}

export async function hotNewestMemberUpdate() {
  const rows = await query('SELECT MAX(updated_at) AS newest FROM member_games')
  return rows[0]?.newest ?? null
}

export async function hotPutMemberGames(openfrontId, games, digest) {
  await query(
    'INSERT INTO member_games (openfront_id, games, game_count, updated_at, digest) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(openfront_id) DO UPDATE SET games = excluded.games, game_count = excluded.game_count, updated_at = excluded.updated_at, digest = excluded.digest',
    [openfrontId, JSON.stringify(games), games.length, new Date().toISOString(), JSON.stringify(digest)],
  )
}

// ── game details ─────────────────────────────────────────────────────────────

export async function hotListDetailIds() {
  return (await query('SELECT game_id FROM game_detail')).map((r) => r.game_id)
}

/** Map of gameId -> detail for the requested ids. */
export async function hotGetDetails(ids) {
  const out = new Map()
  for (const part of chunk(ids, 50)) {
    const rows = await query(`SELECT game_id, detail FROM game_detail WHERE game_id IN (${part.map(() => '?').join(',')})`, part)
    for (const r of rows) out.set(r.game_id, JSON.parse(r.detail))
  }
  return out
}

/** Ids of cached details still in the old shape (no winnerClientIds), see refresh-details.mjs. */
export async function hotListOldShapeDetailIds(limit) {
  return (await query("SELECT game_id FROM game_detail WHERE json_extract(detail, '$.winnerClientIds') IS NULL LIMIT ?", [limit])).map((r) => r.game_id)
}

export async function hotPutDetail(gameId, detail) {
  await query('INSERT INTO game_detail (game_id, detail) VALUES (?, ?) ON CONFLICT(game_id) DO UPDATE SET detail = excluded.detail', [gameId, JSON.stringify(detail)])
}

// ── digest (mirrors the Supabase view cyn_member_games_digest, SQL block L) ──

/**
 * What refresh-details needs per member, so it never has to read the whole list:
 * recent (newest 300 + newest 100 ranked, "gameId:result"), all_wins, and want_games
 * (CYN non-Singleplayer games that decide which details get cached).
 */
export function computeDigest(games, clanTag) {
  const byStartDesc = (a, b) => String(b.start).localeCompare(String(a.start))
  const sig = (g) => `${g.gameId}:${g.result ?? ''}`
  const sorted = [...games].sort(byStartDesc)
  const recent = new Set(sorted.slice(0, 300).map(sig))
  for (const g of sorted.filter((x) => x.rankedType !== 'unranked').slice(0, 100)) recent.add(sig(g))
  const cyn = sorted.filter((g) => g.clanTag === clanTag && g.type !== 'Singleplayer')
  const month = new Date().toISOString().slice(0, 7)
  const want = cyn
    .filter((g, i) => i < 20 || (g.mode === 'Team' && g.result === 'victory') || String(g.start).slice(0, 7) === month)
    .map((g) => ({ gameId: g.gameId, mode: g.mode, result: g.result, start: g.start }))
  return { recent: [...recent], all_wins: cyn.filter((g) => g.result === 'victory').length, want_games: want }
}
