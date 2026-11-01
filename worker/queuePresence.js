// Who of the clan is in the ranked queue right now (Live Ranked Queue page).
//   GET  /api/queue-presence               the members who said in the last 20 minutes that they are in the queue
//   POST /api/queue-presence               { ladder: '1v1' | '2v2' | 'ffa' | null }: the own state (null = not in the queue any more)
import { readSession } from './session.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
export const PRESENCE_MS = 20 * 60_000
const LADDERS = ['1v1', '2v2', 'ffa']

export async function handleQueuePresence(request, env) {
  if (!env.DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  const me = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!me) return json(403, { error: 'members_only' })
  const cutoff = new Date(Date.now() - PRESENCE_MS).toISOString()

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT p.openfront_id AS id, m.in_game_name AS name, p.ladder, p.since FROM cyn_queue_presence p LEFT JOIN cyn_members m ON m.openfront_id = p.openfront_id WHERE p.since > ? ORDER BY p.since').bind(cutoff).all()
    return json(200, { me: me.openfront_id, members: results ?? [] })
  }
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  // same-site only (the Origin of a browser request is the site itself)
  const origin = request.headers.get('Origin')
  if (origin && new URL(request.url).origin !== origin && !/^https:\/\/(www\.)?cynclan\.com$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json(403, { error: 'bad_origin' })
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad_json' })
  }
  if (body?.ladder === null || body?.ladder === undefined) {
    await env.DB.prepare('DELETE FROM cyn_queue_presence WHERE openfront_id = ?').bind(me.openfront_id).run()
    return json(200, { ok: true })
  }
  if (!LADDERS.includes(body.ladder)) return json(400, { error: 'bad_ladder' })
  await env.DB.prepare('INSERT INTO cyn_queue_presence (openfront_id, ladder, since) VALUES (?, ?, ?) ON CONFLICT(openfront_id) DO UPDATE SET ladder = excluded.ladder, since = excluded.since').bind(me.openfront_id, body.ladder, new Date().toISOString()).run()
  // old rows of everybody are cleaned up on the way
  await env.DB.prepare('DELETE FROM cyn_queue_presence WHERE since < ?').bind(cutoff).run()
  return json(200, { ok: true })
}
