// Which registered members were on the site today / yesterday (for the admin Metrics page).
//
//   POST /api/seen              the signed-in member's browser says "I am here" (once per tab session)
//   GET  /api/metrics/visitors  { today: [...], yesterday: [...] } - inner circle only
//
// Stored as one small row per member and day in the hot database's `blobs` table (key "seen:<day>:<openfront id>",
// value {first, last}), so no schema change is needed and rows older than three days are dropped. Days follow
// Europe/Berlin, the time zone of the clan.
import { readSession } from './session.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
const dayKey = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d)
const DAY_MS = 86_400_000

export async function handleSeen(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  let body = {}
  try {
    body = await request.json()
  } catch {
    /* no body */
  }
  // Who is it: the signed-in account first (by account link, or by the Discord id stored with the member); a browser
  // whose sign-in expired but still holds the member's profile reports that profile's id (it has to be a registered one).
  const user = await readSession(request, env)
  let member = null
  if (user) member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? OR discord_user_id = ? LIMIT 1').bind(user.id, user.id).first()
  if (!member && typeof body?.openfront_id === 'string' && /^[A-Za-z0-9_-]{4,16}$/.test(body.openfront_id)) {
    member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE openfront_id = ? LIMIT 1').bind(body.openfront_id).first()
  }
  if (!member) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
  const now = new Date()
  const iso = now.toISOString()
  const key = `seen:${dayKey(now)}:${member.openfront_id}`
  // At most one write per member every 10 minutes: this call also answers browsers that are not signed in, so without a limit anybody could
  // loop it with the (public) member ids and use up the account's daily D1 write budget.
  const row = await env.HOT_DB.prepare('SELECT updated_at FROM blobs WHERE key = ?').bind(key).first()
  if (row && now.getTime() - Date.parse(row.updated_at) < 10 * 60_000) return json(200, { ok: true })
  await env.HOT_DB.prepare(
    "INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = json_set(blobs.value, '$.last', ?), updated_at = excluded.updated_at",
  )
    .bind(key, JSON.stringify({ first: iso, last: iso }), iso, iso)
    .run()
  // Housekeeping now and then: rows of days before yesterday are not needed any more.
  if (Math.random() < 0.05) {
    await env.HOT_DB.prepare('DELETE FROM blobs WHERE key >= ? AND key < ?').bind('seen:', `seen:${dayKey(new Date(now.getTime() - 3 * DAY_MS))}`).run()
  }
  return json(200, { ok: true })
}

export async function handleVisitors(request, env) {
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const inner = await env.DB.prepare('SELECT 1 AS x FROM cyn_members m JOIN cyn_inner_circle ic ON ic.openfront_id = m.openfront_id WHERE m.user_id = ? LIMIT 1').bind(user.id).first()
  if (!inner) return json(403, { error: 'inner_circle_only' })

  const now = new Date()
  const days = { today: dayKey(now), yesterday: dayKey(new Date(now.getTime() - DAY_MS)) }
  const out = {}
  const allIds = new Set()
  for (const [label, day] of Object.entries(days)) {
    const { results } = await env.HOT_DB.prepare('SELECT key, value FROM blobs WHERE key >= ? AND key < ?').bind(`seen:${day}:`, `seen:${day};`).all()
    out[label] = (results ?? []).map((r) => {
      let v = {}
      try {
        v = JSON.parse(r.value)
      } catch {
        /* ignore */
      }
      const id = r.key.slice(`seen:${day}:`.length)
      allIds.add(id)
      return { id, first: v.first ?? null, last: v.last ?? null }
    })
  }
  const names = new Map()
  const ids = [...allIds]
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80)
    const { results } = await env.DB.prepare(`SELECT openfront_id, in_game_name FROM cyn_members WHERE openfront_id IN (${slice.map(() => '?').join(',')})`).bind(...slice).all()
    for (const r of results ?? []) names.set(r.openfront_id, r.in_game_name)
  }
  for (const label of Object.keys(out)) {
    out[label] = out[label].map((v) => ({ ...v, name: names.get(v.id) ?? v.id })).sort((a, b) => String(b.last).localeCompare(String(a.last)))
  }
  return json(200, { ...out, days })
}
