// The player survey (src/pages/Poll.tsx). Until an admin releases it, only admins can see it, fill it in and read the results.
//
//   GET  /api/poll          { visible, admin, open, id, mine }     what the page needs to show (mine = the caller's saved answers)
//   POST /api/poll          { answers }                            a member saves (or changes) their answers; blocked while the survey is not visible to them
//   POST /api/poll/config   { open: boolean }                      admin only: release the survey to every member / hide it again
//   GET  /api/poll/results  { count, answers: [{ answers, at }] }  admin only; no names or ids in the answer
//
// Stored in the hot database's `blobs` table: "pollcfg:<poll>" = { open }, "poll:<poll>:<openfront id>" = { answers, at }.
// One row per member, so answering again replaces the earlier answers. To start a new survey, change POLL_ID here and the questions in src/lib/poll.ts.
import { readSession } from './session.js'

const POLL_ID = 'p1'
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
const KEY = /^[a-z0-9_]{1,24}$/
const upsert = (db, key, value, iso) =>
  db.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, JSON.stringify(value), iso).run()

async function isOpen(env) {
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(`pollcfg:${POLL_ID}`).first()
  try {
    return !!(row?.value && JSON.parse(row.value).open)
  } catch {
    return false
  }
}

/** The answers of the request, cleaned: choice ids, a 1-5 rating or a short text per question. null when the shape is wrong. */
export function cleanAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  const entries = Object.entries(raw)
  if (entries.length > 20) return null
  for (const [k, v] of entries) {
    if (!KEY.test(k)) return null
    if (typeof v === 'number') {
      const n = Math.round(v)
      if (n >= 1 && n <= 5) out[k] = n
    } else if (typeof v === 'string') {
      const t = v.trim().slice(0, 600)
      if (t) out[k] = t
    } else if (Array.isArray(v)) {
      const list = v.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 40).slice(0, 12)
      if (list.length) out[k] = [...new Set(list)]
    }
  }
  return out
}

export async function handlePoll(request, env, pathname) {
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  const admin = !!(await env.DB.prepare('SELECT 1 AS x FROM cyn_event_admins WHERE user_id = ? LIMIT 1').bind(user.id).first())
  const member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? OR discord_user_id = ? LIMIT 1').bind(user.id, user.id).first()
  const open = await isOpen(env)
  const visible = admin || open

  if (pathname === '/api/poll/config') {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
    if (!admin) return json(403, { error: 'admin_only' })
    let body = null
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'bad_json' })
    }
    await upsert(env.HOT_DB, `pollcfg:${POLL_ID}`, { open: body?.open === true }, new Date().toISOString())
    return json(200, { ok: true, open: body?.open === true })
  }

  if (pathname === '/api/poll/results') {
    if (!admin) return json(403, { error: 'admin_only' })
    const { results } = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key >= ? AND key < ? LIMIT 2000').bind(`poll:${POLL_ID}:`, `poll:${POLL_ID};`).all()
    const answers = []
    for (const r of results ?? []) {
      try {
        const doc = JSON.parse(r.value)
        if (doc?.answers) answers.push({ answers: doc.answers, at: doc.at ?? null })
      } catch {
        /* skip a broken row */
      }
    }
    return json(200, { count: answers.length, answers })
  }

  if (request.method === 'GET') {
    let mine = null
    if (visible && member) {
      const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(`poll:${POLL_ID}:${member.openfront_id}`).first()
      try {
        mine = row?.value ? (JSON.parse(row.value).answers ?? null) : null
      } catch {
        mine = null
      }
    }
    return json(200, { visible, admin, open, id: POLL_ID, member: !!member, mine })
  }

  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!visible) return json(403, { error: 'not_open' })
  if (!member) return json(403, { error: 'members_only' })
  let body = null
  try {
    const text = await request.text()
    if (text.length > 8000) return json(413, { error: 'too_large' })
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'bad_json' })
  }
  const answers = cleanAnswers(body?.answers)
  if (!answers || Object.keys(answers).length === 0) return json(400, { error: 'bad_answers' })
  await upsert(env.HOT_DB, `poll:${POLL_ID}:${member.openfront_id}`, { answers, at: new Date().toISOString() }, new Date().toISOString())
  return json(200, { ok: true })
}
