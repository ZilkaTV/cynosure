// Upvotes for the Skin Shop page.
//   GET  /api/skin-votes            { counts: { "pattern:cyn_stars": 3, ... }, mine: [keys] }  (the counts are public, "mine" is filled when signed in)
//   POST /api/skin-votes            { key, on }  a member upvotes (on = true) or takes the vote back
import { readSession } from './session.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
const KEY = /^(pattern|flag|crown):[A-Za-z0-9_.-]{1,60}$/
const MAX_VOTES_PER_MEMBER = 40

async function memberOf(request, env) {
  const user = await readSession(request, env)
  if (!user) return null
  return env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
}

export async function handleSkinVotes(request, env) {
  if (!env.DB) return json(503, { error: 'not_configured' })
  const me = await memberOf(request, env)

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT item_key, COUNT(*) AS n FROM cyn_skin_votes GROUP BY item_key').all()
    const counts = {}
    for (const r of results ?? []) counts[r.item_key] = Number(r.n)
    let mine = []
    if (me) mine = ((await env.DB.prepare('SELECT item_key FROM cyn_skin_votes WHERE voter_id = ?').bind(me.openfront_id).all()).results ?? []).map((r) => r.item_key)
    return json(200, { counts, mine, signedIn: !!me })
  }
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!me) return json(401, { error: 'members_only' })
  const origin = request.headers.get('Origin')
  if (origin && new URL(request.url).origin !== origin && !/^https:\/\/(www\.)?cynclan\.com$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json(403, { error: 'bad_origin' })
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad_json' })
  }
  const key = typeof body?.key === 'string' ? body.key : ''
  if (!KEY.test(key)) return json(400, { error: 'bad_key' })
  if (!body.on) {
    await env.DB.prepare('DELETE FROM cyn_skin_votes WHERE voter_id = ? AND item_key = ?').bind(me.openfront_id, key).run()
    return json(200, { ok: true })
  }
  const have = await env.DB.prepare('SELECT COUNT(*) AS n FROM cyn_skin_votes WHERE voter_id = ?').bind(me.openfront_id).first()
  if (Number(have?.n ?? 0) >= MAX_VOTES_PER_MEMBER) return json(409, { error: 'too_many', max: MAX_VOTES_PER_MEMBER })
  await env.DB.prepare('INSERT OR IGNORE INTO cyn_skin_votes (voter_id, item_key, created_at) VALUES (?, ?, ?)').bind(me.openfront_id, key, new Date().toISOString()).run()
  return json(200, { ok: true })
}
