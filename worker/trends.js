// Trend reads on cyn_member_snapshots (one row per member per day), answered once per few minutes for everybody instead of once per visitor.
// D1's free plan counts every row a query scans: the Home page ("most improved") and the Monthly pages used to page through thousands of
// snapshot rows on every visit (about 1.6 million rows a day). The answers are the same for every visitor, so they sit in the edge cache (index.js).
// The Worker never parses the rows: SQLite builds the JSON text and it goes through as it is (the free CPU budget is 10 ms).

const DAY_MS = 86_400_000
const DATE = /^\d{4}-\d\d-\d\d$/

function jsonResponse(text, status = 200, headers = {}) {
  return new Response(text, { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10)
const validDate = (s) => {
  const ms = Date.parse(`${s}T00:00:00Z`)
  return DATE.test(s) && Number.isFinite(ms) && dayKey(ms) === s
}

/**
 * GET /api/trends/most-improved?days=7&limit=3: the members with the most all-time wins gained in the last `days` days, highest first.
 * Same rule as the old browser code: last snapshot minus first snapshot of the window, members with no gain are left out.
 */
export async function handleMostImproved(request, env) {
  const q = new URL(request.url).searchParams
  const days = Math.min(31, Math.max(1, Math.floor(Number(q.get('days') ?? 7)) || 7))
  const limit = Math.min(10, Math.max(1, Math.floor(Number(q.get('limit') ?? 3)) || 3))
  const since = dayKey(Date.now() - (days + 1) * DAY_MS)
  try {
    const { results } = await env.DB.prepare(
      `SELECT a.openfront_id AS openfrontId, l.all_wins - f.all_wins AS winsDelta
       FROM (SELECT openfront_id, MIN(snapshot_date) AS fd, MAX(snapshot_date) AS ld, COUNT(*) AS n
             FROM cyn_member_snapshots WHERE snapshot_date >= ? GROUP BY openfront_id HAVING n >= 2) a
       JOIN cyn_member_snapshots f ON f.openfront_id = a.openfront_id AND f.snapshot_date = a.fd
       JOIN cyn_member_snapshots l ON l.openfront_id = a.openfront_id AND l.snapshot_date = a.ld
       WHERE l.all_wins - f.all_wins > 0
       ORDER BY winsDelta DESC, a.openfront_id LIMIT ?`,
    )
      .bind(since, limit)
      .all()
    return jsonResponse(JSON.stringify({ list: results ?? [] }))
  } catch (err) {
    console.error('D1 most-improved read failed:', err?.message ?? err)
    return jsonResponse(JSON.stringify({ error: 'trends_unavailable' }), 502)
  }
}

/**
 * GET /api/trends/elo-rows?from=YYYY-MM-DD&to=YYYY-MM-DD: the 1v1 and 2v2 Elo of every member for every tracked day in the range,
 * as { rows: [[openfront_id, date, elo, elo_2v2], ...] } (the order is not promised: the caller sorts). A range that lies fully in the past
 * can no longer change, so it may stay in the edge cache for hours (X-Edge-Ttl, read by edgeCached in kvSafe.js).
 */
export async function handleEloRows(request, env) {
  const q = new URL(request.url).searchParams
  const from = q.get('from') ?? ''
  const to = q.get('to') ?? ''
  if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 130 * DAY_MS) return jsonResponse(JSON.stringify({ error: 'bad_range' }), 400)
  try {
    const { results } = await env.DB.prepare(
      `SELECT json_group_array(json_array(openfront_id, snapshot_date, elo, elo_2v2)) AS rows
       FROM (SELECT openfront_id, snapshot_date, elo, elo_2v2 FROM cyn_member_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? ORDER BY snapshot_date)`,
    )
      .bind(from, to)
      .all()
    const rows = results?.[0]?.rows
    if (typeof rows !== 'string') throw new Error('no rows text')
    return jsonResponse(`{"rows":${rows}}`, 200, to < dayKey(Date.now()) ? { 'X-Edge-Ttl': '21600' } : {})
  } catch (err) {
    console.error('D1 elo-rows read failed:', err?.message ?? err)
    return jsonResponse(JSON.stringify({ error: 'trends_unavailable' }), 502)
  }
}
