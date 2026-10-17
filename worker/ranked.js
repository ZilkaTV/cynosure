// Ranked Elo (top-100 leaderboards for 1v1 and 2v2), fetched by the Worker itself on every cron tick.
//
// GitHub's runners get OpenFront's Cloudflare bot challenge ("Just a moment...") on
// /leaderboard/ranked (plain fetch and curl alike), so the cron scripts could not refresh the Elo
// for hours at a time and members who entered the top 100 showed no Elo on the site. Requests from
// our Worker's own egress go through, so the Worker does the scan: result goes to the D1 blob
// `ranked`, /api/roster overlays it on the roster document (worker/roster.js) and refresh-details
// reads it for its daily snapshots.
import { useD1 } from './hotStore.js'

const PAGES = 3 // the board is 2 pages (100 entries) today; a 400 ends the scan early

/** Fetches both top-100 boards, stores them in the D1 blob `ranked` and returns them (null if the scan failed). */
export async function refreshRankedBlob(env, info = {}) {
  if (!useD1(env)) return null
  const byMode = { ranked_1v1: {}, ranked_2v2: {}, ranked_ffa: {} }
  for (let page = 1; page <= PAGES; page++) {
    const res = await fetch(`https://api.openfront.io/public/leaderboard/ranked?page=${page}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 400) break
    if (!res.ok) {
      console.error(`ranked leaderboard page ${page}: HTTP ${res.status} - keeping the previous Elo`)
      info.reason = `page ${page}: HTTP ${res.status}`
      return null
    }
    const json = await res.json()
    for (const e of json['1v1'] ?? []) byMode.ranked_1v1[e.public_id] = e
    for (const e of json['2v2'] ?? []) byMode.ranked_2v2[e.public_id] = e
    for (const e of json['ffa'] ?? []) byMode.ranked_ffa[e.public_id] = e // absent on APIs from before ranked FFA
  }
  if (Object.keys(byMode.ranked_1v1).length === 0 || Object.keys(byMode.ranked_2v2).length === 0) {
    console.error('ranked leaderboard came back empty - keeping the previous Elo')
    info.reason = 'empty boards'
    return null
  }
  const doc = { ...byMode, scanned_at: new Date().toISOString() }
  await env.HOT_DB.prepare(
    'INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  )
    .bind('ranked', JSON.stringify(doc), new Date().toISOString())
    .run()
  await updateFfaMonth(env, byMode.ranked_ffa).catch((err) => console.error('ffa month update failed:', err?.message ?? err))
  return doc
}

// ── Monthly FFA ranking ─────────────────────────────────────────────────────
// The Monthly FFA page ranks by OpenFront's FFA board. The board only shows "now", so every scan also updates one small
// row per month (blob "ffa-month:YYYY-MM", UTC month): each player's latest rank and Elo, the highest Elo of the month and
// the first Elo seen that month (for the monthly change). When the month is over the row simply stops being written -
// it is the final standing of that month. Players who dropped off the board keep their last Elo and lose the rank.
async function updateFfaMonth(env, board) {
  if (!board || Object.keys(board).length === 0) return
  const now = new Date()
  const iso = now.toISOString()
  const key = `ffa-month:${iso.slice(0, 7)}`
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(key).first()
  let doc = { month: iso.slice(0, 7), entries: {} }
  try {
    if (row?.value) doc = JSON.parse(row.value)
  } catch {
    /* start over */
  }
  for (const e of Object.values(doc.entries)) e.rank = null // only the latest scan's players have a rank
  for (const [id, e] of Object.entries(board)) {
    const prev = doc.entries[id]
    doc.entries[id] = { rank: e.rank, elo: e.elo, peak: Math.max(prev?.peak ?? e.elo, e.elo), first: prev?.first ?? e.elo, last: iso }
  }
  doc.updated_at = iso
  await env.HOT_DB.prepare(
    'INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  )
    .bind(key, JSON.stringify(doc), iso)
    .run()
}

/** GET /api/ffa-month?month=YYYY-MM -> the stored standing of that month ({ entries: {} } when nothing was stored). */
export async function handleFfaMonth(request, env) {
  const month = new URL(request.url).searchParams.get('month') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response(JSON.stringify({ error: 'bad_month' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(`ffa-month:${month}`).first()
  return new Response(row?.value ?? JSON.stringify({ month, entries: {} }), { headers: { 'Content-Type': 'application/json' } })
}
