// GET /api/queue/me: the signed-in visitor's own account for the Live Ranked Queue page. The stored games only carry
// an opaque key per top-100 player (an HMAC of the public id, see scripts/collect-ranked-feed.mjs); this hands the
// visitor the key of THEIR OWN account plus their name and current board position, so a game they played under another
// name can be marked as theirs on their own screen. It never returns anything about other players.
import { readSession } from './session.js'

const enc = new TextEncoder()
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

async function ownKey(secret, openfrontId) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`ranked-feed:${openfrontId}`)))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10)
}

export async function handleQueueMe(request, env) {
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  if (!env.DB || !env.HOT_DB || !env.HOT_API_SECRET) return json(503, { error: 'not_configured' })
  const member = await env.DB.prepare('SELECT openfront_id, in_game_name FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!member) return json(404, { error: 'no_member' })
  const row = await env.HOT_DB.prepare("SELECT value FROM blobs WHERE key = 'ranked'").first()
  let doc = {}
  try {
    doc = JSON.parse(row?.value ?? '{}')
  } catch {
    /* no board stored yet */
  }
  const boards = {}
  for (const [ladder, field] of [
    ['1v1', 'ranked_1v1'],
    ['2v2', 'ranked_2v2'],
  ]) {
    const e = doc[field]?.[member.openfront_id]
    if (e) boards[ladder] = { rank: e.rank, elo: e.elo }
  }
  return json(200, { k: await ownKey(env.HOT_API_SECRET, member.openfront_id), name: member.in_game_name, boards })
}
