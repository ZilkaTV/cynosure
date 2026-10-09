// GET /api/member-games?ids=a,b,c: the cached game lists of the requested members, straight from Cloudflare D1.
// The lists are passed through as text, never parsed: they are megabytes and the Worker's free CPU budget is 10 ms.
import { d1MemberGames, joinJsonObject } from './hotStore.js'

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function handleMemberGames(request, env) {
  const ids = [...new Set((new URL(request.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) return jsonResponse({})
  if (ids.length > 150) return jsonResponse({ error: 'too_many_ids', max: 150 }, 413)
  try {
    const rows = await d1MemberGames(env, ids)
    return new Response(joinJsonObject(rows), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'd1' } })
  } catch (err) {
    console.error('D1 member-games read failed:', err?.message ?? err)
    return jsonResponse({ error: 'member_games_unavailable' }, 502)
  }
}
