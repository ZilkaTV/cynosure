#!/usr/bin/env node
// Prints, for a game id, the time OpenFront's own win check decided the match (see computeWinSeconds in
// src/lib/replaySimCore.ts) next to the time of the last real player action. Debug helper for speedruns.
//   node scripts/probe-win-time.mjs dgQoXSbY
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gameId = process.argv[2]
if (!gameId) {
  console.error('usage: node scripts/probe-win-time.mjs <gameId>')
  process.exit(1)
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 } })
await server.listen()
const origin = `http://localhost:${server.httpServer.address().port}`
const realFetch = globalThis.fetch
globalThis.fetch = (url, opts) => realFetch(typeof url === 'string' && url.startsWith('/api/') ? origin + url : url, opts)
try {
  const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')
  const win = await core.computeWinSeconds(gameId)
  console.log(win == null ? 'win time: not computable' : `win time (engine win check): ${fmt(win)} (${win}s)`)
} finally {
  await server.close()
}
