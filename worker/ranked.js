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
export async function refreshRankedBlob(env) {
  if (!useD1(env)) return null
  const byMode = { ranked_1v1: {}, ranked_2v2: {} }
  for (let page = 1; page <= PAGES; page++) {
    const res = await fetch(`https://api.openfront.io/leaderboard/ranked?page=${page}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 400) break
    if (!res.ok) {
      console.error(`ranked leaderboard page ${page}: HTTP ${res.status} - keeping the previous Elo`)
      return null
    }
    const json = await res.json()
    for (const e of json['1v1'] ?? []) byMode.ranked_1v1[e.public_id] = e
    for (const e of json['2v2'] ?? []) byMode.ranked_2v2[e.public_id] = e
  }
  if (Object.keys(byMode.ranked_1v1).length === 0 || Object.keys(byMode.ranked_2v2).length === 0) {
    console.error('ranked leaderboard came back empty - keeping the previous Elo')
    return null
  }
  const doc = { ...byMode, scanned_at: new Date().toISOString() }
  await env.HOT_DB.prepare(
    'INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  )
    .bind('ranked', JSON.stringify(doc), new Date().toISOString())
    .run()
  return doc
}
