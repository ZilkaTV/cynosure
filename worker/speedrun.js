// Speedrun submissions, checked on the server.
//
//   POST /api/speedrun/submit   { gameId }  -> the signed-in member submits a solo game for the speedrun board
//   GET  /api/speedrun/pending               -> submissions waiting for (or refused after) the engine check
//
// Before: the member's browser checked the game, replayed it and wrote the row itself - everything it wrote (time,
// verified flag) could be forged by calling the database API directly. Now:
//   1. This Worker reads the game record from OpenFront itself (not from the browser) and checks the rules, the
//      settings, that the winner IS the member (OpenFront's public account id, not a name), that the game is not
//      someone else's submission and that it is not older than the member's registration window.
//   2. A passing game goes into the queue (blob "speedrun-pending") and the check workflow is started.
//   3. scripts/verify-speedruns.mjs replays the game with the vendored engine, reads the win time and the land share
//      at 3:00 and is the ONLY writer of cyn_speedruns (service access). A row on the board is therefore always verified.
import { readSession } from './session.js'

const GITHUB_REPO = 'ZilkaTV/cynosure'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const CLAN_TAG = 'CYN'
const MAX_AGE_DAYS = 45
const QUEUE_KEY = 'speedrun-pending'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

/** The rules of the category, mirrored from src/lib/speedruns.ts (checkSpeedrunConfig / verifySpeedrun). Null = fine. */
export function checkSpeedrunRecord(info) {
  const c = info?.config
  if (!c) return 'The game record has no settings to verify.'
  const bad = (cond, msg) => (cond ? msg : null)
  const players = info.players ?? []
  const winnerId = Array.isArray(info.winner) && info.winner[0] === 'player' ? info.winner[1] : null
  return (
    bad(c.gameType !== 'Singleplayer', 'Must be a solo (singleplayer) game.') ??
    bad(c.gameMap !== 'Australia', `Map must be Australia (this game was ${c.gameMap}).`) ??
    bad(c.nations !== 'disabled', 'Nations must be disabled ("No Nations").') ??
    bad(c.gameMode !== undefined && c.gameMode !== 'Free For All', 'The game mode must be Free For All.') ??
    bad(c.gameMapSize !== undefined && c.gameMapSize !== 'Normal', 'The map size must be Normal (no compact map).') ??
    bad(c.bots !== 400, 'The run must use 400 bots (the default).') ??
    bad(c.infiniteGold === true, 'Infinite gold is not allowed.') ??
    bad(c.infiniteTroops === true, 'Infinite troops are not allowed.') ??
    bad(c.instantBuild === true, 'Instant build is not allowed.') ??
    bad(c.randomSpawn === true, 'Random spawn is not allowed.') ??
    bad(Array.isArray(c.disabledUnits) && c.disabledUnits.length > 0, 'All units must be enabled.') ??
    bad(c.waterNukes === true, 'Water nukes must be off.') ??
    bad(c.goldMultiplier !== undefined || c.startingGold !== undefined, 'Gold multiplier and starting gold must stay at the defaults.') ??
    bad(c.maxTimerValue != null, 'A game timer is not allowed.') ??
    bad(c.customAllianceDuration !== undefined || c.doomsdayClock !== undefined || c.overtime !== undefined, 'No extra game modifiers are allowed.') ??
    bad(!winnerId, 'The game has no recorded winner - it was not completed.') ??
    bad(!(info.duration > 0), 'No duration recorded for this game.') ??
    bad(!players.some((p) => p.clientID === winnerId), 'The winner is not in the player list of the record.')
  )
}

async function readQueue(env) {
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(QUEUE_KEY).first()
  try {
    const doc = JSON.parse(row?.value ?? '{}')
    return Array.isArray(doc.items) ? doc.items : []
  } catch {
    return []
  }
}

async function writeQueue(env, items) {
  const iso = new Date().toISOString()
  await env.HOT_DB.prepare(
    'INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  )
    .bind(QUEUE_KEY, JSON.stringify({ items }), iso)
    .run()
}

/** True while at least one submission waits for the engine check (used by the cron tick to start the workflow). */
export async function hasPendingSpeedruns(env) {
  try {
    return (await readQueue(env)).some((i) => i.status === 'pending')
  } catch {
    return false
  }
}

export async function startVerifyWorkflow(env) {
  if (!env.GITHUB_PAT || env.SITE_ENV === 'dev') return
  await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_PAT}`, Accept: 'application/vnd.github+json', 'User-Agent': 'cynosure-speedrun' },
    body: JSON.stringify({ event_type: 'verify-speedruns' }),
  }).catch(() => {})
}

export async function handleSpeedrunSubmit(request, env, ctx) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in', message: 'Sign in with Discord to submit a run.' })
  const member = await env.DB.prepare('SELECT openfront_id, in_game_name FROM cyn_members WHERE user_id = ? OR discord_user_id = ? LIMIT 1').bind(user.id, user.id).first()
  if (!member) return json(403, { error: 'no_member', message: 'Register your OpenFront id first.' })

  let body = {}
  try {
    body = await request.json()
  } catch {
    /* handled below */
  }
  const gameId = String(body?.gameId ?? '')
  if (!/^[A-Za-z0-9]{6,16}$/.test(gameId)) return json(400, { error: 'bad_game_id', message: 'That is not a game id.' })

  const res = await fetch(`https://api.openfront.io/public/game/${gameId}?turns=false`, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
  if (res.status === 404) return json(200, { ok: false, message: 'OpenFront has no game with this id (yet).' })
  if (!res.ok) return json(502, { error: 'openfront_unavailable', message: 'OpenFront did not answer, try again in a minute.' })
  const info = (await res.json()).info
  const problem = checkSpeedrunRecord(info)
  if (problem) return json(200, { ok: false, message: problem })

  const winner = info.players.find((p) => p.clientID === info.winner[1])
  // The winner has to be the member's own account (public id), playing under the clan tag.
  if (winner.publicID !== member.openfront_id) return json(200, { ok: false, message: 'The winner of this game is not your OpenFront account - you can only submit your own runs.' })
  if (winner.clanTag !== CLAN_TAG) return json(200, { ok: false, message: `You must be playing with the [${CLAN_TAG}] tag for the run to count.` })
  const startMs = Number(info.start) || Date.parse(info.start)
  if (startMs && Date.now() - startMs > MAX_AGE_DAYS * 86_400_000) return json(200, { ok: false, message: `The game is older than ${MAX_AGE_DAYS} days.` })

  // Somebody else's run: one game, one member.
  const taken = await env.DB.prepare('SELECT openfront_id FROM cyn_speedruns WHERE game_id = ? AND openfront_id != ? LIMIT 1').bind(gameId, member.openfront_id).first()
  if (taken) return json(200, { ok: false, message: 'This game was already submitted by another member.' })

  const items = (await readQueue(env)).filter((i) => !(i.openfront_id === member.openfront_id && i.game_id === gameId))
  if (items.some((i) => i.status === 'pending' && i.openfront_id !== member.openfront_id && i.game_id === gameId)) return json(200, { ok: false, message: 'This game is already waiting for a check from another member.' })
  items.push({ openfront_id: member.openfront_id, game_id: gameId, at: new Date().toISOString(), status: 'pending', recorded_seconds: Math.round(info.duration) })
  // Keep the list short: refused/finished entries stay a day for the member to read.
  const keep = items.filter((i) => i.status === 'pending' || Date.now() - Date.parse(i.done_at ?? i.at) < 86_400_000)
  await writeQueue(env, keep)
  ctx?.waitUntil?.(startVerifyWorkflow(env))
  return json(200, { ok: true, status: 'pending', message: 'Run received. The engine check takes a few minutes - the time appears on the board once it passed.' })
}

export async function handleSpeedrunPending(request, env) {
  if (!env.HOT_DB) return json(503, { error: 'not_configured' })
  const items = await readQueue(env)
  // Public: ids, game ids and outcomes only.
  return json(200, { items: items.map((i) => ({ openfront_id: i.openfront_id, game_id: i.game_id, at: i.at, status: i.status, message: i.message ?? null, seconds: i.seconds ?? null })) })
}
