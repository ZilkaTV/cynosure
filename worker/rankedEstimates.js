// Estimated ranked ELO for our members who are NOT on OpenFront's official top-100
// ladders. OpenFront publishes real ELO for the top 100 only; TeamStats.pro
// (https://teamstats.pro/ranked.html) crawls every public ranked game and
// estimates the rest (their stated error: about +-94 ELO for 1v1, +-120 for 2v2).
// We read just the rows of our own clan from the same public JSON their page
// uses, one small request per ladder, and the router caches the answer at the
// edge for 10 minutes. Failure is harmless: the caller treats a missing answer
// as "no estimates" and the site shows exactly what it showed before.
// Same value as CLAN_TAG in src/config.ts (the worker is a separate build boundary).
const CLAN_TAG = 'CYN'

const SOURCE = 'https://teamstats.pro/api/ranked-ladder'
const MAX_PAGES = 5

async function fetchLadder(type) {
  const out = {}
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${SOURCE}?type=${type}&page=${page}&clan=1&clans=${encodeURIComponent(CLAN_TAG)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'CynosureClanSite (cynclan.com)', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`teamstats ${res.status}`)
    const body = await res.json()
    // row: [rank, publicId, name, shownElo, peak, wins, losses, isOfficial(1/0), rawEstimate, lastGameTs]
    for (const row of body.rows ?? []) {
      if (!Array.isArray(row) || row[7] === 1 || typeof row[1] !== 'string' || typeof row[3] !== 'number') continue
      out[row[1]] = { elo: row[3], rank: row[0] }
    }
    if (page >= (body.pages ?? 1)) break
  }
  return out
}

export async function handleRankedEstimates(request) {
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  try {
    const [oneVOne, twoVTwo] = await Promise.all([fetchLadder('1v1'), fetchLadder('2v2')])
    return new Response(JSON.stringify({ source: 'teamstats.pro', '1v1': oneVOne, '2v2': twoVTwo }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('ranked estimates unavailable:', err?.message ?? err)
    return new Response(JSON.stringify({ error: 'estimates_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}
