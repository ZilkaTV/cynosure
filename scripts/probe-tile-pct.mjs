#!/usr/bin/env node
// Debug helper: prints every player's land share at a tick (default 1900 = the speedrun "Tiles @ 3:00" mark).
//   node scripts/probe-tile-pct.mjs <gameId> [tick]
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gameId = process.argv[2]
const tick = Number(process.argv[3]) || 1900
if (!gameId) {
  console.error('usage: node scripts/probe-tile-pct.mjs <gameId> [tick]')
  process.exit(1)
}
globalThis.__REPLAY_DEBUG = true
const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 } })
await server.listen()
const origin = `http://localhost:${server.httpServer.address().port}`
const realFetch = globalThis.fetch
globalThis.fetch = (url, opts) => realFetch(typeof url === 'string' && url.startsWith('/api/') ? origin + url : url, opts)
try {
  const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')
  console.log(JSON.stringify(await core.computeTilePercentAtTick(gameId, tick)))
} finally {
  await server.close()
}
