// A member's most recent solo (Singleplayer) games straight from OpenFront
// (GET /public/player/:id/games?type=singleplayer). Used by the Speedrun page
// to pick up a finished run on its own, so nobody has to paste a game link.
// Read-only and public data; the router puts a 15 s edge cache in front, which
// bounds OpenFront to about four requests a minute per watching player.
const PLAYER_ID = /^[A-Za-z0-9_-]{4,40}$/

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleSoloLatest(request) {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!PLAYER_ID.test(id)) return json(400, { error: 'bad_id' })
  try {
    const res = await fetch(`https://api.openfront.io/public/player/${id}/games?type=singleplayer`, {
      headers: { Accept: 'application/json', 'User-Agent': 'CynosureClanSite (cynclan.com)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`openfront ${res.status}`)
    const body = await res.json()
    const games = (body.results ?? []).slice(0, 5).map((g) => ({ gameId: g.gameId, start: g.start, map: g.map, result: g.result }))
    return json(200, { games })
  } catch (err) {
    console.error('solo games unavailable:', err?.message ?? err)
    return json(502, { error: 'solo_unavailable' })
  }
}
