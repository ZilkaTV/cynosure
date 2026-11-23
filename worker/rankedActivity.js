// GET /api/ranked-activity: the ranked activity statistics (games per day / per hour of all OpenFront), written hourly by
// scripts/collect-ranked-activity.mjs into the hot database (blob "ranked-activity"). Only counts, public data; nothing about players.
const KEY = 'ranked-activity'

export async function handleRankedActivity(request, env) {
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'method' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  let value = null
  try {
    const row = env.HOT_DB ? await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(KEY).first() : null
    value = row?.value ?? null
  } catch (err) {
    console.error('ranked-activity read failed:', err?.message ?? err)
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(value ?? 'null', { headers: { 'Content-Type': 'application/json' } })
}
