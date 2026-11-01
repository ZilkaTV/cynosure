// The clan's top donors (caps and plutonium), as OpenFront shows them on the clan's Donations tab.
//
//   GET  /api/clan-donors          signed-in members of the site: the stored ranking (or { boards: null } before the first upload)
//   POST /api/clan-donors          admins and the inner circle: stores a new ranking (the import panel)
//   POST /api/clan-donors/ingest   the userscript, with a sync key (Authorization: Bearer cdk_...): stores a new ranking by itself, no click needed
//   GET / POST / DELETE /api/clan-donors/key   status / new key / revoke of the own sync key (admins and the inner circle)
//
// OpenFront only gives the list to members of the clan who are logged in (GET /clans/CYN/donations/leaderboard answers 401 to everybody
// else), so the site cannot fetch it on its own. The userscript addons/cynosure-donors.user.js reads it in the admin's own browser, with the
// admin's own OpenFront login (nothing of that login ever reaches this site), and hands it to the import panel on the Clan page; the
// panel shows what it got and the admin saves it. This file checks every field again: whatever arrives here is treated as untrusted.
//
// Stored as one small document in the hot database's `blobs` table (key "clan-donors").
import { readSession } from './session.js'
import { syncClanDonors } from './donorBot.js'

const KEYS = 'donor-keys'
const KEY_FORMAT = /^cdk_[0-9a-f]{64}$/
const INGEST_GAP_MS = 4 * 60_000
const OPENFRONT = 'https://openfront.io'

const KEY = 'clan-donors'
export const BOT_STATUS_KEY = 'donor-bot-status'
const MAX_BODY = 200_000
const MAX_ROWS = 100
const MAX_RECENT = 400
const CURRENCIES = ['soft', 'hard'] // soft = caps, hard = plutonium
const PERIODS = ['all', 'month', 'week']
const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...extra } })

/** One row of a board, rebuilt field by field; null when it does not look like a row. */
function cleanRow(r) {
  if (!r || typeof r !== 'object') return null
  const total = typeof r.total === 'number' ? String(Math.trunc(r.total)) : r.total
  if (typeof r.playerId !== 'string' || !PLAYER_ID.test(r.playerId)) return null
  if (typeof total !== 'string' || !/^\d{1,18}$/.test(total)) return null
  const donations = Number(r.donations)
  if (!Number.isInteger(donations) || donations < 0 || donations > 1_000_000) return null
  const username = typeof r.username === 'string' ? r.username.slice(0, 60) : null
  return { playerId: r.playerId, username, total, donations }
}

/** The newest single donations (for the daily / weekly / monthly quests): { playerId, currency, amount, at }. Empty list when the sender has none. */
export function cleanRecent(input) {
  if (input == null) return { recent: [] }
  if (!Array.isArray(input) || input.length > MAX_RECENT) return { error: 'bad recent list' }
  const recent = []
  for (const r of input) {
    if (!r || typeof r.playerId !== 'string' || !PLAYER_ID.test(r.playerId)) return { error: 'bad recent row' }
    const currency = r.currency === 'soft' || r.currency === 'hard' ? r.currency : null
    const amount = typeof r.amount === 'number' ? String(Math.trunc(r.amount)) : r.amount
    const at = typeof r.at === 'string' ? Date.parse(r.at) : NaN
    if (!currency || typeof amount !== 'string' || !/^\d{1,18}$/.test(amount) || !Number.isFinite(at)) return { error: 'bad recent row' }
    recent.push({ playerId: r.playerId, currency, amount, at: new Date(at).toISOString() })
  }
  return { recent: recent.sort((a, b) => (a.at < b.at ? 1 : -1)) }
}

/** The submitted ranking as a clean document, or a message saying what is wrong. */
export function cleanBoards(input) {
  const boards = {}
  for (const currency of CURRENCIES) {
    boards[currency] = {}
    for (const period of PERIODS) {
      const list = input?.[currency]?.[period]
      if (!Array.isArray(list)) return { error: `missing list ${currency}/${period}` }
      if (list.length > MAX_ROWS) return { error: `too many rows in ${currency}/${period}` }
      const rows = []
      for (const raw of list) {
        const row = cleanRow(raw)
        if (!row) return { error: `bad row in ${currency}/${period}` }
        rows.push(row)
      }
      boards[currency][period] = rows.sort((a, b) => (BigInt(b.total) > BigInt(a.total) ? 1 : BigInt(b.total) < BigInt(a.total) ? -1 : 0)).map((row, i) => ({ rank: i + 1, ...row }))
    }
  }
  return { boards }
}

async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** { "<OpenFront id>": { hash, at, used } }: one sync key per member, only its hash is stored. */
async function readKeys(env) {
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(KEYS).first()
  try {
    const v = JSON.parse(row?.value ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
async function writeKeys(env, keys) {
  await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(KEYS, JSON.stringify(keys), new Date().toISOString()).run()
}

/** May this signed-in account import donors? Admins and the inner circle. */
async function trusted(env, user) {
  if (await env.DB.prepare('SELECT 1 AS x FROM cyn_event_admins WHERE user_id = ? LIMIT 1').bind(user.id).first()) return true
  return !!(await env.DB.prepare('SELECT 1 AS x FROM cyn_members m JOIN cyn_inner_circle ic ON ic.openfront_id = m.openfront_id WHERE m.user_id = ? LIMIT 1').bind(user.id).first())
}

function siteOriginAllowed(request, env) {
  const origin = request.headers.get('Origin')
  const own = env.SITE_ENV === 'dev' && origin === new URL(request.url).origin
  return !origin || own || /^https:\/\/(www\.)?cynclan\.com$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

/** Cleans a submitted ranking and writes it; returns a Response when something is wrong, otherwise the stored document. */
export async function storeDonors(env, body, by) {
  const cleaned = cleanBoards(body?.boards)
  if (cleaned.error) return { response: json(400, { error: 'bad_boards', message: cleaned.error }) }
  const cleanedRecent = cleanRecent(body?.recent)
  if (cleanedRecent.error) return { response: json(400, { error: 'bad_recent', message: cleanedRecent.error }) }
  const doc = { boards: cleaned.boards, recent: cleanedRecent.recent, updated_at: new Date().toISOString(), by }
  const text = JSON.stringify(doc)
  if (text.length > MAX_BODY) return { response: json(413, { error: 'too_large' }) }
  await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(KEY, text, doc.updated_at).run()
  return { doc }
}

/** The userscript calls this from openfront.io with its sync key: CORS for that one origin only. */
async function ingest(request, env) {
  const cors = { 'Access-Control-Allow-Origin': OPENFRONT, Vary: 'Origin' }
  const reply = (status, body) => json(status, body, cors)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } })
  }
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  const origin = request.headers.get('Origin')
  if (origin && origin !== OPENFRONT) return reply(403, { error: 'bad_origin' })
  const key = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  if (!KEY_FORMAT.test(key)) return reply(401, { error: 'bad_key' })
  const hash = await sha256Hex(key)
  const keys = await readKeys(env)
  const found = Object.entries(keys).find(([, e]) => e?.hash === hash)
  if (!found) return reply(401, { error: 'bad_key' })
  const [id, entry] = found
  if (entry.used && Date.now() - Date.parse(entry.used) < INGEST_GAP_MS) return reply(429, { error: 'too_soon' })
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return reply(413, { error: 'too_large' })
  let body
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: 'bad_json' })
  }
  const stored = await storeDonors(env, body, id)
  if (stored.response) {
    // the same answer with the CORS headers the browser needs to read it
    const text = await stored.response.text()
    return new Response(text, { status: stored.response.status, headers: { ...Object.fromEntries(stored.response.headers), ...cors } })
  }
  keys[id] = { ...entry, used: stored.doc.updated_at }
  await writeKeys(env, keys)
  return reply(200, { ok: true, updated_at: stored.doc.updated_at })
}

export async function handleClanDonors(request, env) {
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const { pathname } = new URL(request.url)
  if (pathname === '/api/clan-donors/ingest') return ingest(request, env)
  const TRACKED = { '/api/clan-donors/members': 'clan-members', '/api/clan-donors/games': 'clan-games' }
  if (pathname !== '/api/clan-donors' && pathname !== '/api/clan-donors/key' && pathname !== '/api/clan-donors/bot' && !TRACKED[pathname]) return json(404, { error: 'not_found' })
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })

  // the member list and the games of the clan, as the bot stored them (members of the site only)
  if (TRACKED[pathname]) {
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
    const member = await env.DB.prepare('SELECT 1 AS x FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
    if (!member) return json(403, { error: 'members_only' })
    const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(TRACKED[pathname]).first()
    try {
      return json(200, row?.value ? JSON.parse(row.value) : { empty: true })
    } catch {
      return json(200, { empty: true })
    }
  }

  // what the bot (worker/donorBot.js) did last, for admins and the inner circle
  if (pathname === '/api/clan-donors/bot') {
    if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
    if (!(await trusted(env, user))) return json(403, { error: 'not_allowed' })
    const readLast = async () => {
      const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(BOT_STATUS_KEY).first()
      try {
        return row?.value ? JSON.parse(row.value) : null
      } catch {
        return null // unreadable: treated as never run
      }
    }
    if (request.method === 'GET') return json(200, { configured: !!env.OPENFRONT_BOT_COOKIE, last: await readLast() })
    // POST: run the bot right now (the test button), at most once a minute
    if (!siteOriginAllowed(request, env)) return json(403, { error: 'bad_origin' })
    if (!env.OPENFRONT_BOT_COOKIE) return json(200, { configured: false, last: null })
    const before = await readLast()
    if (before?.at && Date.now() - Date.parse(before.at) < 60_000) return json(429, { error: 'too_soon' })
    await syncClanDonors(env)
    return json(200, { configured: true, last: await readLast() })
  }

  // the sync key of this member (shown once when it is made; only its hash is kept)
  if (pathname === '/api/clan-donors/key') {
    if (!siteOriginAllowed(request, env)) return json(403, { error: 'bad_origin' })
    if (!(await trusted(env, user))) return json(403, { error: 'not_allowed' })
    const me = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
    if (!me) return json(403, { error: 'members_only' })
    const keys = await readKeys(env)
    if (request.method === 'GET') return json(200, { hasKey: !!keys[me.openfront_id], created_at: keys[me.openfront_id]?.at ?? null, last_used: keys[me.openfront_id]?.used ?? null })
    if (request.method === 'DELETE') {
      delete keys[me.openfront_id]
      await writeKeys(env, keys)
      return json(200, { ok: true })
    }
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const key = 'cdk_' + [...raw].map((b) => b.toString(16).padStart(2, '0')).join('')
    keys[me.openfront_id] = { hash: await sha256Hex(key), at: new Date().toISOString(), used: null }
    await writeKeys(env, keys)
    return json(200, { key })
  }

  if (request.method === 'GET') {
    const member = await env.DB.prepare('SELECT 1 AS x FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
    if (!member) return json(403, { error: 'members_only' })
    const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(KEY).first()
    try {
      return json(200, row?.value ? JSON.parse(row.value) : { boards: null })
    } catch {
      return json(200, { boards: null })
    }
  }

  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  // Same lock as the data API: browser calls only come from this site.
  const origin = request.headers.get('Origin')
  const own = env.SITE_ENV === 'dev' && origin === new URL(request.url).origin
  if (origin && !own && !/^https:\/\/(www\.)?cynclan\.com$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json(403, { error: 'bad_origin' })
  if (!(await trusted(env, user))) return json(403, { error: 'admins_only' })
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return json(413, { error: 'too_large' })
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad_json' })
  }
  const member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  const stored = await storeDonors(env, body, member?.openfront_id ?? null)
  if (stored.response) return stored.response
  return json(200, { ok: true, updated_at: stored.doc.updated_at })
}
