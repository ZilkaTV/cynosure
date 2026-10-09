// A member's most recent solo (Singleplayer) games straight from OpenFront
// (GET /public/player/:id/games?type=singleplayer). Used by the Speedrun page
// to pick up a finished run on its own, so nobody has to paste a game link.
// Read-only and public data; the router puts a 15 s edge cache in front, which
// bounds OpenFront to about four requests a minute per watching player.
import { readSession, signOwnershipProof } from './session.js'

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

// Proof that a registrant owns the OpenFront id they typed: the owner starts one solo game under a one-time
// name (the code); solo games are listed on the player's own public profile with the name used, and nobody
// else can create a game under that account. The Worker asks OpenFront for the player's newest solo games
// and looks for the code in a game started after `since` (minus two minutes of clock difference).
const CODE = /^[a-z0-9]{6,12}$/

export async function handleVerifyOwnership(request, env) {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
  const q = new URL(request.url).searchParams
  const id = q.get('id') ?? ''
  const code = (q.get('code') ?? '').toLowerCase()
  const since = Number(q.get('since'))
  if (!PLAYER_ID.test(id) || !CODE.test(code) || !Number.isFinite(since)) return json(400, { error: 'bad_request' })
  try {
    const res = await fetch(`https://api.openfront.io/public/player/${id}/games?type=singleplayer`, {
      headers: { Accept: 'application/json', 'User-Agent': 'CynosureClanSite (cynclan.com)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) return json(200, { ok: false, reason: 'unknown_player' })
    if (!res.ok) throw new Error(`openfront ${res.status}`)
    const body = await res.json()
    const found = (body.results ?? []).slice(0, 20).some((g) => String(g.username ?? '').toLowerCase().includes(code) && Date.parse(g.start) >= since - 120000)
    // A signed-in visitor who passed the check also gets a short-lived proof the data API requires to claim the id.
    const user = found ? await readSession(request, env) : null
    const proof = user ? await signOwnershipProof(env, user.id, id) : undefined
    const out = json(200, { ok: found, proof })
    out.headers.set('Cache-Control', 'no-store')
    return out
  } catch (err) {
    console.error('ownership check unavailable:', err?.message ?? err)
    return json(502, { error: 'unavailable' })
  }
}
