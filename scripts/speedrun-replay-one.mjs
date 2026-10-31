#!/usr/bin/env node
// Replays ONE solo game with the vendored engine and prints `RESULT:<json>` with what a speedrun needs: the in-game clock
// when the engine's own win check fired and every player's land share at the 3:00 checkpoint. One fresh process per game
// (the vendored engine cannot replay a second game in the same JS realm, see compute-tile-stats-one.mjs).
//
//   node scripts/speedrun-replay-one.mjs <gameId>
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gameId = process.argv[2]
if (!gameId) {
  console.error('usage: node scripts/speedrun-replay-one.mjs <gameId>')
  process.exit(2)
}

const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 }, logLevel: 'error' })
await server.listen()
const origin = `http://localhost:${server.httpServer.address().port}`
const realFetch = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const res = await realFetch(origin + url, opts)
    // GitHub runners get OpenFront's bot challenge (403) through the dev proxy; our Worker proxy reaches OpenFront from elsewhere.
    if (res.status === 403) return realFetch(`https://cynclan.com${url}`, opts)
    return res
  }
  return realFetch(url, opts)
}

let exitCode = 0
try {
  const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')
  const of = await server.ssrLoadModule('/src/lib/openfront.ts')
  const tilesAtTick = 3 * 60 * 10 + of.SINGLEPLAYER_SPAWN_PHASE_TURNS
  const commit = await core.resolveEngineCommit(gameId).catch(() => null)
  if (!commit) console.log('RESULT:' + JSON.stringify({ error: 'no_commit' }))
  else {
    const metrics = await core.computeSpeedrunMetrics(gameId, tilesAtTick).catch(() => null)
    console.log('RESULT:' + JSON.stringify(metrics ? { commit, ...metrics } : { error: 'replay_failed' }))
  }
} catch (err) {
  console.error('speedrun-replay-one failed:', err)
  exitCode = 1
} finally {
  await server.close()
}
process.exit(exitCode)
