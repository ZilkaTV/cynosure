// Cloudflare D1 read side for the two big tables the cron scripts write (see scripts/lib/hotstore.mjs):
//   member_games (one row per member, `games` = JSON array as TEXT)
//   game_detail  (one row per game, `detail` = JSON object as TEXT)
// Used when the HOT_DB binding exists AND the USE_D1 var is "1" (flipped on only after the scripts
// write to D1). The TEXT values are passed through as strings, never parsed: the Worker's free CPU
// budget (10 ms) is far too small for JSON.parse on megabytes.
//
// D1 limits: 100 bound parameters per query, hence the id chunking.

export const useD1 = (env) => Boolean(env.HOT_DB) && env.USE_D1 === '1'

const MAX_PARAMS = 90
// A D1 query silently returns only part of a result once it grows past roughly 1.5 MB (seen live:
// 114 member rows came back as 20), so rows are fetched in batches of at most ~1 MB, sized from a
// cheap length() query first.
const MAX_BATCH_BYTES = 1_000_000

async function selectByIds(db, table, idColumn, valueColumn, ids) {
  const sizes = new Map()
  for (let i = 0; i < ids.length; i += MAX_PARAMS) {
    const part = ids.slice(i, i + MAX_PARAMS)
    const { results } = await db
      .prepare(`SELECT ${idColumn} AS id, length(${valueColumn}) AS len FROM ${table} WHERE ${idColumn} IN (${part.map(() => '?').join(',')})`)
      .bind(...part)
      .all()
    for (const r of results ?? []) sizes.set(r.id, r.len)
  }

  const batches = []
  let batch = []
  let bytes = 0
  for (const [id, len] of sizes) {
    if (batch.length > 0 && (bytes + len > MAX_BATCH_BYTES || batch.length >= MAX_PARAMS)) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(id)
    bytes += len
  }
  if (batch.length > 0) batches.push(batch)

  const out = new Map()
  for (const part of batches) {
    const { results } = await db
      .prepare(`SELECT ${idColumn} AS id, ${valueColumn} AS value FROM ${table} WHERE ${idColumn} IN (${part.map(() => '?').join(',')})`)
      .bind(...part)
      .all()
    for (const r of results ?? []) out.set(r.id, r.value)
  }
  return out
}

export const d1MemberGames = (env, ids) => selectByIds(env.HOT_DB, 'member_games', 'openfront_id', 'games', ids)
export const d1GameDetails = (env, ids) => selectByIds(env.HOT_DB, 'game_detail', 'game_id', 'detail', ids)

/** {"id": <json text>, ...} without parsing the values. */
export function joinJsonObject(map) {
  let out = '{'
  let first = true
  for (const [id, text] of map) {
    out += `${first ? '' : ','}${JSON.stringify(id)}:${text}`
    first = false
  }
  return `${out}}`
}

/** A small cached document (roster / ledger) as JSON text, or null. */
export async function d1Blob(env, key) {
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(key).first()
  return row?.value ?? null
}
