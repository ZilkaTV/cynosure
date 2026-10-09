// Internal API for the user-data D1 database (binding DB, database "cynosure"), used by the migration script and
// later by the GitHub Actions scripts. Same shared secret as the hot API (HOT_API_SECRET).
//
//   GET  /api/internal/users/counts                row count per table
//   POST /api/internal/users/import?table=X       body: JSON array of rows (<= 200) -> INSERT OR REPLACE
//
// Columns are checked against the table's real columns, so a typo or an unknown table can't create anything.

import { handleServiceQuery } from './dbApi.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const TABLE = /^[a-z_][a-z0-9_]{0,63}$/
const MAX_ROWS = 200

function authorized(request, env) {
  const secret = env.HOT_API_SECRET
  if (!secret || secret.length < 24) return false
  const given = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  if (given.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}

async function tableNames(db) {
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()
  return (results ?? []).map((r) => r.name)
}

const toSql = (v) => (v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' ? JSON.stringify(v) : v)

export async function handleUsersApi(request, env, pathname) {
  if (!env.DB) return json(503, { error: 'no_db' })
  if (!authorized(request, env)) return json(401, { error: 'unauthorized' })
  const op = pathname.replace(/^\/api\/internal\/users\//, '')
  const url = new URL(request.url)
  const db = env.DB
  try {
    if (request.method === 'GET' && op === 'counts') {
      const out = {}
      for (const name of await tableNames(db)) {
        const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).first()
        out[name] = row?.n ?? 0
      }
      return json(200, out)
    }
    if (request.method === 'POST' && op === 'query') {
      return json(200, await handleServiceQuery(env, await request.json()))
    }
    if (request.method === 'POST' && op === 'import') {
      const table = url.searchParams.get('table') ?? ''
      if (!TABLE.test(table) || !(await tableNames(db)).includes(table)) return json(400, { error: 'bad_table' })
      const rows = await request.json()
      if (!Array.isArray(rows) || rows.length > MAX_ROWS) return json(400, { error: 'bad_rows' })
      if (rows.length === 0) return json(200, { written: 0 })
      const { results: info } = await db.prepare(`PRAGMA table_info(${table})`).all()
      const known = new Set((info ?? []).map((c) => c.name))
      const statements = []
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => known.has(c))
        if (cols.length === 0) continue
        statements.push(
          db
            .prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
            .bind(...cols.map((c) => toSql(row[c]))),
        )
      }
      if (statements.length) await db.batch(statements)
      return json(200, { written: statements.length })
    }
    return json(404, { error: 'not_found' })
  } catch (err) {
    return json(500, { error: 'failed', detail: String(err?.message ?? err).slice(0, 300) })
  }
}
