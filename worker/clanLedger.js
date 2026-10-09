// GET /api/clan-ledger?gameIds=a,b,c: the clan-score ledger rows (won, score, ratio before/after) of the requested
// games, keyed by game id. The ledger document is written whole every run by scripts/compute-clan-score-ledger.mjs
// (blob "ledger" in Cloudflare D1); a game that is not in it simply has no clan score.
import { d1Blob } from './hotStore.js'

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function handleClanLedger(request, env) {
  const gameIds = new Set((new URL(request.url).searchParams.get('gameIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  if (gameIds.size === 0) return jsonResponse({})
  try {
    const doc = await d1Blob(env, 'ledger')
    if (!doc) return jsonResponse({ error: 'ledger_unavailable' }, 502)
    const result = {}
    for (const row of JSON.parse(doc)) if (gameIds.has(row.game_id)) result[row.game_id] = row
    return jsonResponse(result)
  } catch (err) {
    console.error('D1 ledger read failed:', err?.message ?? err)
    return jsonResponse({ error: 'ledger_unavailable' }, 502)
  }
}
