// The clan's top donors (caps and plutonium), as OpenFront shows them on the clan's Donations tab.
//
//   GET  /api/clan-donors   signed-in members of the site: the stored ranking (or { boards: null } before the first upload)
//   POST /api/clan-donors   admins only: stores a new ranking
//
// OpenFront only gives the list to members of the clan who are logged in (GET /clans/CYN/donations/leaderboard answers 401 to everybody
// else), so the site cannot fetch it on its own. The userscript addons/cynosure-donors.user.js reads it in the admin's own browser, with the
// admin's own OpenFront login (nothing of that login ever reaches this site), and hands it to the import panel on the Clan page; the
// panel shows what it got and the admin saves it. This file checks every field again: whatever arrives here is treated as untrusted.
//
// Stored as one small document in the hot database's `blobs` table (key "clan-donors").
import { readSession } from './session.js'

const KEY = 'clan-donors'
const MAX_BODY = 200_000
const MAX_ROWS = 100
const MAX_RECENT = 400
const CURRENCIES = ['soft', 'hard'] // soft = caps, hard = plutonium
const PERIODS = ['all', 'month', 'week']
const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

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

export async function handleClanDonors(request, env) {
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })

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
  const admin = await env.DB.prepare('SELECT 1 AS x FROM cyn_event_admins WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!admin) return json(403, { error: 'admins_only' })
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return json(413, { error: 'too_large' })
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad_json' })
  }
  const cleaned = cleanBoards(body?.boards)
  if (cleaned.error) return json(400, { error: 'bad_boards', message: cleaned.error })
  const cleanedRecent = cleanRecent(body?.recent)
  if (cleanedRecent.error) return json(400, { error: 'bad_recent', message: cleanedRecent.error })
  const member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  const doc = { boards: cleaned.boards, recent: cleanedRecent.recent, updated_at: new Date().toISOString(), by: member?.openfront_id ?? null }
  const text = JSON.stringify(doc)
  if (text.length > MAX_BODY) return json(413, { error: 'too_large' })
  await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(KEY, text, doc.updated_at).run()
  return json(200, { ok: true, updated_at: doc.updated_at })
}
