#!/usr/bin/env node
// Copies the real data into the DEV databases (cynosure-dev, cynosure-hot-dev) so the dev site shows what the real one shows.
// It only READS the real databases (wrangler d1 export / SELECT) and only WRITES the dev databases. Uses your wrangler login,
// no secrets. Run it whenever the dev data should be refreshed:   npm run sync:dev
//
// Copied: all user tables except the private ones (help chat, survey answers, visit log), the member game lists, the small
// cached documents (roster, ranked boards, ledger, monthly FFA standings) and the game reports of the newest games
// (reports above 400 KB are skipped).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = path.join(os.tmpdir(), 'cyn-dev-sync')
fs.mkdirSync(TMP, { recursive: true })

const PROD_USERS = 'cynosure'
const PROD_HOT = 'cynosure-hot'
const DEV_USERS = 'cynosure-dev'
const DEV_HOT = 'cynosure-hot-dev'
const PRIVATE_TABLES = new Set(['cyn_help_conversations', 'cyn_help_messages', 'cyn_help_rate_limit', 'cyn_survey_responses', 'cyn_site_visits'])
const DETAIL_COUNT = Number(process.env.DEV_SYNC_DETAILS || 600)

// wrangler comes through npx; every argument is quoted for the shell (the SQL has spaces and single quotes, never double quotes).
const wrangler = (args) =>
  execSync(`npx wrangler ${args.map((a) => (/[\s'"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`, { cwd: ROOT, maxBuffer: 1 << 30, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const query = (db, sql) => {
  const out = wrangler(['d1', 'execute', db, '--remote', '--command', sql, '--json'])
  return JSON.parse(out.slice(out.indexOf('[')))[0].results
}
const quote = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'")

function importFile(db, file) {
  console.log(`  importing ${path.basename(file)} (${Math.round(fs.statSync(file).size / 1024)} KB) into ${db}...`)
  wrangler(['d1', 'execute', db, '--remote', '--file', file])
}

// ── 1. user tables ──────────────────────────────────────────────────────────
console.log('[1/3] user tables')
if (!process.env.DEV_SYNC_SKIP_USERS) {
const usersSql = path.join(TMP, 'users-export.sql')
wrangler(['d1', 'export', PROD_USERS, '--remote', '--no-schema', '--output', usersSql])
const tables = query(DEV_USERS, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").map((r) => r.name)
const keep = tables.filter((t) => !PRIVATE_TABLES.has(t))
const lines = fs.readFileSync(usersSql, 'utf8').split('\n').filter((l) => {
  const m = l.match(/^INSERT INTO "?([A-Za-z0-9_]+)"?/)
  return m ? keep.includes(m[1]) : false
})
const usersOut = path.join(TMP, 'users-import.sql')
fs.writeFileSync(usersOut, keep.map((t) => `DELETE FROM ${t};`).join('\n') + '\n' + lines.join('\n') + '\n')
console.log(`  ${lines.length} rows of ${keep.length} tables`)
importFile(DEV_USERS, usersOut)
}

// ── 2. member game lists, cached documents and game reports ────────────────
// D1 takes SQL statements up to 100 KB, but a member's game list is megabytes: such a row is written as a short INSERT plus
// UPDATE ... SET col = col || '<next part>' statements, and read back in parts of 800 KB (one query result is cut near 1.5 MB).
const PART = 20_000 // characters; quotes double and some characters take 3 bytes, the statement has to stay below 100 KB
const READ_PART = 800_000

function bigText(db, table, idCol, id, col, len) {
  let out = ''
  for (let off = 1; off <= len; off += READ_PART) out += query(db, `SELECT substr(${col}, ${off}, ${READ_PART}) AS p FROM ${table} WHERE ${idCol} = ${quote(id)}`)[0].p
  return out
}

/** SQL statements that recreate one row whose big column may exceed the statement limit. */
function rowStatements(table, idCol, id, bigCol, text, others) {
  const parts = []
  for (let i = 0; i < text.length; i += PART) parts.push(text.slice(i, i + PART))
  if (parts.length === 0) parts.push('')
  const cols = [idCol, bigCol, ...Object.keys(others)]
  const vals = [quote(id), quote(parts[0]), ...Object.values(others).map(quote)]
  const out = [`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`]
  for (const p of parts.slice(1)) out.push(`UPDATE ${table} SET ${bigCol} = ${bigCol} || ${quote(p)} WHERE ${idCol} = ${quote(id)};`)
  return out
}

console.log('[2/3] member game lists and cached documents')
const hotOut = path.join(TMP, 'hot-import.sql')
fs.writeFileSync(hotOut, 'DELETE FROM member_games;\nDELETE FROM blobs;\n')
let n = 0
for (const m of query(PROD_HOT, 'SELECT openfront_id, game_count, updated_at, digest, length(games) AS len FROM member_games')) {
  const text = bigText(PROD_HOT, 'member_games', 'openfront_id', m.openfront_id, 'games', m.len)
  fs.appendFileSync(hotOut, rowStatements('member_games', 'openfront_id', m.openfront_id, 'games', text, { game_count: m.game_count, updated_at: m.updated_at, digest: m.digest }).join('\n') + '\n')
  process.stdout.write(`  member ${++n}\r`)
}
for (const b of query(PROD_HOT, "SELECT key, updated_at, length(value) AS len FROM blobs WHERE key NOT LIKE 'seen:%' AND key NOT IN ('speedrun-pending', 'details-have', 'tilestats-skip')")) {
  const text = bigText(PROD_HOT, 'blobs', 'key', b.key, 'value', b.len)
  fs.appendFileSync(hotOut, rowStatements('blobs', 'key', b.key, 'value', text, { updated_at: b.updated_at }).join('\n') + '\n')
}
console.log(`\n  ${n} member lists, documents copied`)
importFile(DEV_HOT, hotOut)

console.log(`[3/3] game reports (newest ${DETAIL_COUNT})`)
const ids = query(PROD_HOT, `SELECT game_id FROM game_detail WHERE length(detail) < 400000 ORDER BY rowid DESC LIMIT ${DETAIL_COUNT}`).map((r) => r.game_id)
let count = 0
const BATCH = 10
const detailOut = path.join(TMP, 'detail-import.sql')
fs.writeFileSync(detailOut, 'DELETE FROM game_detail;\n')
for (let i = 0; i < ids.length; i += BATCH) {
  const slice = ids.slice(i, i + BATCH)
  const rows = query(PROD_HOT, `SELECT game_id, detail FROM game_detail WHERE game_id IN (${slice.map(quote).join(',')})`)
  for (const r of rows) fs.appendFileSync(detailOut, rowStatements('game_detail', 'game_id', r.game_id, 'detail', r.detail, {}).join('\n') + '\n')
  count += rows.length
  process.stdout.write(`  ${count}/${ids.length}\r`)
}
console.log(`\n  ${count} reports`)
importFile(DEV_HOT, detailOut)
console.log('\nDone. The dev site now has a copy of the real data (as of now).')
