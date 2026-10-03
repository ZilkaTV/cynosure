// The complete member list of our clan straight from OpenFront
// (GET /public/clan/:tag/members, at most 50 per page). The site only knows the
// members who registered here; this shows everyone who is in the clan, with role,
// join date and win/loss records. Read-only and public data. The router puts the
// Cache API in front (1 hour), so OpenFront sees about three requests per hour.
// Same value as CLAN_TAG in src/config.ts (the worker is a separate build boundary).
const CLAN_TAG = 'CYN'
const PAGE_SIZE = 50
const MAX_PAGES = 6

const wl = (s) => (s && typeof s === 'object' ? { w: Number(s.wins) || 0, l: Number(s.losses) || 0 } : { w: 0, l: 0 })

function compact(m) {
  const s = m.stats ?? {}
  return {
    id: m.publicId,
    name: m.username ?? null,
    role: m.role,
    joinedAt: m.joinedAt,
    total: wl(s.total),
    ffa: wl(s.ffa),
    team: wl(s.team),
    ranked: wl(s.ranked),
    r1v1: wl(s['1v1']),
  }
}

export async function handleClanMembers(request) {
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  try {
    const members = []
    let total = 0
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`https://api.openfront.io/public/clan/${CLAN_TAG}/members?limit=${PAGE_SIZE}&page=${page}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'CynosureClanSite (cynclan.com)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`openfront ${res.status}`)
      const body = await res.json()
      total = Number(body.total) || total
      for (const m of body.results ?? []) if (m?.publicId) members.push(compact(m))
      if ((body.results ?? []).length < PAGE_SIZE || members.length >= total) break
    }
    return new Response(JSON.stringify({ total: members.length, members }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('clan members unavailable:', err?.message ?? err)
    return new Response(JSON.stringify({ error: 'clan_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}
