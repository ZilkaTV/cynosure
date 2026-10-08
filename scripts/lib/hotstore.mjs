// Cloudflare D1 store for the two big, script-written tables (per-member game lists and per-game
// details). They used to live in Supabase (cyn_member_games_cache / cyn_game_detail_cache), where
// every full read counted against the free 5.5 GB monthly egress - which got the project locked.
// D1 has no egress charge and resets its (generous) daily limits every day.
//
// Two transports, picked by env vars:
//   Worker  HOT_API_SECRET (+ optional HOT_API_BASE) - the scripts call the site's own Worker
//           (worker/hotApi.js), which owns the D1 binding. No Cloudflare API token needed.
//   REST    CLOUDFLARE_API_TOKEN (D1 Edit) + CLOUDFLARE_ACCOUNT_ID + D1_DATABASE_ID - Cloudflare's
//           D1 REST API directly (used for the one-off migration from a laptop).
// With neither set hotEnabled() is false and callers keep using Supabase.

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID
const DB = process.env.D1_DATABASE_ID
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const SECRET = process.env.HOT_API_SECRET
const BASE = process.env.HOT_API_BASE || 'https://cynosure.xa9087dwbu5631opu09x357q2.workers.dev'

const viaWorker = () => Boolean(SECRET)
export const hotEnabled = () => viaWorker() || Boolean(ACCOUNT && DB && TOKEN)

async function api(method, path, { query: q, body } = {}) {
  const url = new URL(`${BASE}/api/internal/hot/${path}`)
  for (const [k, v] of Object.entries(q ?? {})) url.searchParams.set(k, String(v))
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', 'User-Agent': 'CynosureCron/1.0' },
        body,
        signal: AbortSignal.timeout(120000),
      })
      if (!res.ok) throw new Error(`hot api ${method} ${path} -> ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  throw lastErr
}

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
  if (viaWorker()) return await api('GET', 'digests')
  const rows = await query('SELECT openfront_id, game_count, updated_at, digest FROM member_games')
  return rows.map((r) => ({ ...r, digest: r.digest ? JSON.parse(r.digest) : null }))
}

export async function hotGetMemberGames(openfrontId) {
  if (viaWorker()) return (await api('GET', 'games', { query: { ids: openfrontId } }))[openfrontId] ?? null
  const rows = await query('SELECT games FROM member_games WHERE openfront_id = ?', [openfrontId])
  return rows[0] ? JSON.parse(rows[0].games) : null
}

/** [{ openfront_id, games }] for every member (hourly jobs: ledger, role sync). */
export async function hotGetAllMemberGames() {
  const ids = viaWorker()
    ? (await api('GET', 'digests')).map((r) => r.openfront_id).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)).sort()
    : (await query('SELECT openfront_id FROM member_games ORDER BY openfront_id')).map((r) => r.openfront_id)
  const out = []
  if (viaWorker()) {
    for (const part of chunk(ids, 10)) {
      const got = await api('GET', 'games', { query: { ids: part.join(',') } })
      for (const [openfront_id, games] of Object.entries(got)) out.push({ openfront_id, games })
    }
    return out
  }
  for (const part of chunk(ids, 10)) {
    const rows = await query(`SELECT openfront_id, games FROM member_games WHERE openfront_id IN (${part.map(() => '?').join(',')})`, part)
    for (const r of rows) out.push({ openfront_id: r.openfront_id, games: JSON.parse(r.games) })
  }
  return out
}

export async function hotNewestMemberUpdate() {
  if (viaWorker()) return (await api('GET', 'newest')).newest
  const rows = await query('SELECT MAX(updated_at) AS newest FROM member_games')
  return rows[0]?.newest ?? null
}

export async function hotPutMemberGames(openfrontId, games, digest) {
  if (viaWorker()) {
    // body = digest json, newline, games json (the Worker stores both as text, no parsing)
    await api('PUT', 'games', { query: { id: openfrontId, count: games.length }, body: `${JSON.stringify(digest)}
${JSON.stringify(games)}` })
    return
  }
  await query(
    'INSERT INTO member_games (openfront_id, games, game_count, updated_at, digest) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(openfront_id) DO UPDATE SET games = excluded.games, game_count = excluded.game_count, updated_at = excluded.updated_at, digest = excluded.digest',
    [openfrontId, JSON.stringify(games), games.length, new Date().toISOString(), JSON.stringify(digest)],
  )
}

// ── game details ─────────────────────────────────────────────────────────────

export async function hotListDetailIds() {
  if (viaWorker()) return await api('GET', 'detail-ids')
  return (await query('SELECT game_id FROM game_detail')).map((r) => r.game_id)
}

/** Map of gameId -> detail for the requested ids. */
export async function hotGetDetails(ids) {
  const out = new Map()
  if (viaWorker()) {
    for (const part of chunk(ids, 50)) {
      const got = await api('GET', 'details', { query: { ids: part.join(',') } })
      for (const [id, detail] of Object.entries(got)) out.set(id, detail)
    }
    return out
  }
  for (const part of chunk(ids, 50)) {
    const rows = await query(`SELECT game_id, detail FROM game_detail WHERE game_id IN (${part.map(() => '?').join(',')})`, part)
    for (const r of rows) out.set(r.game_id, JSON.parse(r.detail))
  }
  return out
}

/** Ids of cached details still in the old shape (no winnerClientIds), see refresh-details.mjs. */
export async function hotListOldShapeDetailIds(limit) {
  if (viaWorker()) return await api('GET', 'old-shape', { query: { limit } })
  return (await query("SELECT game_id FROM game_detail WHERE json_extract(detail, '$.winnerClientIds') IS NULL LIMIT ?", [limit])).map((r) => r.game_id)
}

export async function hotPutDetail(gameId, detail) {
  if (viaWorker()) {
    await api('PUT', 'detail', { query: { id: gameId }, body: JSON.stringify(detail) })
    return
  }
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

// ── small cached documents (roster, ledger) ──────────────────────────────────

export async function hotPutBlob(key, text) {
  if (viaWorker()) {
    await api('PUT', 'blob', { query: { key }, body: text })
    return
  }
  await query(
    'INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, text, new Date().toISOString()],
  )
}

export async function hotGetBlob(key) {
  if (viaWorker()) return await api('GET', 'blob', { query: { key } })
  const rows = await query('SELECT value FROM blobs WHERE key = ?', [key])
  return rows[0] ? JSON.parse(rows[0].value) : null
}
