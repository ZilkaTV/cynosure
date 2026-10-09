#!/usr/bin/env node
// Replays ONE game and prints `RESULT:<json>` with its Max Tiles stats. Used by scripts/backfill-tile-stats.mjs,
// which starts a fresh process per game: the vendored engine keeps module-level state, so a second game replayed in
// the same JS realm fails (tick errors such as "Cannot read properties of undefined (reading '_borderTiles')" or
// "The number NaN cannot be converted to a BigInt") - that is why batches of games used to end with "failed after
// retries" for everything after the first one.
//
//   node scripts/compute-tile-stats-one.mjs <gameId>
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gameId = process.argv[2]
if (!gameId) {
  console.error('usage: node scripts/compute-tile-stats-one.mjs <gameId>')
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
  const commit = await core.resolveEngineCommit(gameId).catch(() => null)
  if (!commit) {
    console.log('RESULT:' + JSON.stringify({ error: 'no_commit' }))
  } else {
    const stats = await core.computeGameTileStats(gameId, { yieldEveryTicks: 500, onProgress: () => {} }).catch(() => null)
    console.log('RESULT:' + JSON.stringify(stats ? { commit, version: core.COMPUTE_LOGIC_VERSION, stats } : { error: 'replay_failed' }))
  }
} catch (err) {
  console.error('compute-tile-stats-one failed:', err)
  exitCode = 1
} finally {
  await server.close()
}
process.exit(exitCode)
