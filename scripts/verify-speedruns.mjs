#!/usr/bin/env node
// The ONLY writer of cyn_speedruns. Takes the submissions the Worker accepted (blob "speedrun-pending", see
// worker/speedrun.js), replays every game with the vendored engine and puts a run on the board only with the time the
// engine's own win check gives - a run on the board is therefore always verified.
//
// Per submission: the record is read from OpenFront again (the winner has to be the member's own account), the game is
// replayed in a fresh process (scripts/speedrun-replay-one.mjs), the time is floor(winSeconds), the land share at 3:00 is
// the winner's. A replay that cannot be run (engine version, fetch problems) is tried three times and then refused with a
// reason the member can read on the Speedrun page.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hotEnabled, hotGetBlob, hotPutBlob } from './lib/hotstore.mjs'
import { usersDb } from './lib/usersdb.mjs'
import { checkGameSpeed } from '../worker/speedCheck.mjs'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const QUEUE_KEY = 'speedrun-pending'
const MAX_PER_RUN = 6
const BUDGET_MS = 30 * 60_000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

if (!hotEnabled()) {
  console.error('Missing HOT_API_SECRET')
  process.exit(1)
}

async function fetchRecord(gameId) {
  for (const base of ['https://api.openfront.io', 'https://cynclan.com/api/of']) {
    const res = await fetch(`${base}/public/game/${gameId}?turns=false`, { headers: { Accept: 'application/json', 'User-Agent': UA } }).catch(() => null)
    if (res?.ok) return (await res.json()).info ?? null
  }
  return null
}

async function replay(gameId) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(__dirname, 'speedrun-replay-one.mjs'), gameId], { maxBuffer: 200 * 1024 * 1024, timeout: 10 * 60_000, env: process.env })
    const line = stdout.split(/\r?\n/).reverse().find((l) => l.startsWith('RESULT:'))
    return line ? JSON.parse(line.slice('RESULT:'.length)) : null
  } catch (err) {
    console.error(`  ${gameId}: replay process failed: ${String(err.message ?? err).split(/\r?\n/)[0].slice(0, 160)}`)
    return null
  }
}

async function handle(item) {
  const refuse = (message) => Object.assign(item, { status: 'refused', message, done_at: new Date().toISOString() })
  const info = await fetchRecord(item.game_id)
  if (!info) {
    item.tries = (item.tries ?? 0) + 1
    if (item.tries >= 3) refuse('The game record could not be read from OpenFront.')
    return
  }
  const winner = info.players?.find((p) => p.clientID === info.winner?.[1])
  if (!winner || winner.publicID !== item.openfront_id) return void refuse('The winner of this game is not your OpenFront account.')

  const out = await replay(item.game_id)
  if (!out || out.error || out.winSeconds == null) {
    item.tries = (item.tries ?? 0) + 1
    if (item.tries >= 3) refuse(out?.error === 'no_commit' ? 'This game was played on an engine version we cannot replay yet.' : 'The replay could not be checked (no winner found in the game log).')
    return
  }
  // The engine's exact win time against the real time of the record: a run played in fast-forward is refused.
  const speedProblem = checkGameSpeed(info, out.winSeconds)
  if (speedProblem) return void refuse(speedProblem)
  const seconds = Math.floor(out.winSeconds)
  const tiles = out.tilePercentByClientId?.[winner.clientID] ?? null

  const { data: existing } = await usersDb.from('cyn_speedruns').select('seconds, attempts, tiles3min_percent').eq('openfront_id', item.openfront_id).maybeSingle()
  const attempts = (existing?.attempts ?? 0) + 1
  const bestTiles = tiles != null && (existing?.tiles3min_percent == null || tiles > existing.tiles3min_percent) ? tiles : (existing?.tiles3min_percent ?? null)
  const now = new Date().toISOString()
  if (existing && existing.seconds <= seconds) {
    await usersDb.from('cyn_speedruns').update({ attempts, submitted_at: now, tiles3min_percent: bestTiles }).eq('openfront_id', item.openfront_id)
    Object.assign(item, { status: 'done', seconds, message: `Verified (${seconds} s), but your current best (${existing.seconds} s) is faster.`, done_at: now })
    return
  }
  const { error } = await usersDb.from('cyn_speedruns').upsert(
    { openfront_id: item.openfront_id, game_id: item.game_id, seconds, attempts, submitted_at: now, tiles3min_percent: bestTiles, verified: true },
    { onConflict: 'openfront_id' },
  )
  if (error) {
    console.error(`  ${item.game_id}: saving failed:`, error.message)
    return // stays pending, tried again next run
  }
  Object.assign(item, { status: 'done', seconds, message: `New best time: ${seconds} s - verified by the engine.`, done_at: now })
}

const startedAt = Date.now()
const doc = (await hotGetBlob(QUEUE_KEY).catch(() => null)) ?? {}
const items = Array.isArray(doc.items) ? doc.items : []
const todo = items.filter((i) => i.status === 'pending').slice(0, MAX_PER_RUN)
console.log(`${todo.length} speedrun submission(s) to check (${items.length} in the list)`)
for (const item of todo) {
  if (Date.now() - startedAt > BUDGET_MS) break
  console.log(`checking ${item.game_id} (${item.openfront_id})...`)
  await handle(item)
  console.log(`  -> ${item.status}${item.message ? ': ' + item.message : ''}`)
}
// Re-read before writing: submissions that arrived meanwhile must not be lost.
const fresh = (await hotGetBlob(QUEUE_KEY).catch(() => null)) ?? {}
const byKey = new Map((Array.isArray(fresh.items) ? fresh.items : []).map((i) => [`${i.openfront_id}|${i.game_id}`, i]))
for (const i of todo) byKey.set(`${i.openfront_id}|${i.game_id}`, i)
await hotPutBlob(QUEUE_KEY, JSON.stringify({ items: [...byKey.values()] }))
