// The "@Name" mentions of the signed-in member (the bell reads them; the rows are written together with the comment, see worker/mentions.js).
//   GET /api/mentions    the newest mentions of me: [{ id, author, kind: 'game' | 'profile', ref, at }]
import { readSession } from './session.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

export async function handleMentions(request, env) {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
  if (!env.DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  const me = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!me) return json(403, { error: 'members_only' })
  const { results } = await env.DB.prepare('SELECT id, author_id AS author, kind, ref_id AS ref, created_at AS at FROM cyn_mentions WHERE mentioned_id = ? ORDER BY created_at DESC LIMIT 30').bind(me.openfront_id).all()
  return json(200, { mentions: results ?? [] })
}
