// GET /api/roster: the roster document (ranked/FFA leaderboards, clan leaderboard) from Cloudflare D1.
// scripts/refresh-details.mjs writes it every 10 minutes (blob "roster"); worker/ranked.js keeps the ranked Elo
// boards fresher because GitHub's runners get OpenFront's bot challenge on that endpoint.
import { d1Blob } from './hotStore.js'

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function handleRoster(request, env) {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405)
  try {
    const doc = await d1Blob(env, 'roster')
    if (!doc) return jsonResponse({ error: 'roster_unavailable' }, 502)
    const rankedText = await d1Blob(env, 'ranked').catch(() => null)
    if (rankedText) {
      const ranked = JSON.parse(rankedText)
      if (Date.now() - Date.parse(ranked.scanned_at) < 6 * 60 * 60 * 1000) {
        const merged = JSON.parse(doc)
        merged.ranked_1v1 = ranked.ranked_1v1
        merged.ranked_2v2 = ranked.ranked_2v2
        return new Response(JSON.stringify(merged), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'd1+ranked' } })
      }
    }
    return new Response(doc, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'd1' } })
  } catch (err) {
    console.error('D1 roster read failed:', err?.message ?? err)
    return jsonResponse({ error: 'roster_unavailable' }, 502)
  }
}
