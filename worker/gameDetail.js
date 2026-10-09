// GET /api/game-detail?ids=a,b,c: the cached post-game reports of the requested games from Cloudflare D1
// (written by scripts/refresh-details.mjs). A finished game never changes, so complete answers are edge-cached for
// a day; an answer with missing games gets a short edge TTL so the next visitor retries soon.
import { d1GameDetails, joinJsonObject } from './hotStore.js'

const MAX_IDS_PER_REQUEST = 200

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function handleGameDetail(request, env) {
  const ids = [...new Set((new URL(request.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) return jsonResponse({})
  if (ids.length > MAX_IDS_PER_REQUEST) return jsonResponse({ error: 'too_many_ids', max: MAX_IDS_PER_REQUEST }, 413)
  try {
    const rows = await d1GameDetails(env, ids)
    const res = new Response(joinJsonObject(rows), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'd1' } })
    if (ids.some((id) => !rows.has(id))) res.headers.set('X-Edge-Ttl', '300')
    return res
  } catch (err) {
    console.error('D1 game-detail read failed:', err?.message ?? err)
    return new Response(JSON.stringify({ error: 'game_detail_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json', 'X-Edge-Ttl': '30' } })
  }
}
