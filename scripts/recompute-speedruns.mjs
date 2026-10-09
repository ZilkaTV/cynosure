#!/usr/bin/env node
// Re-times every stored speedrun with the engine's own win check (computeWinSeconds in
// src/lib/replaySimCore.ts) instead of "time of the last real action", which over-counted any run
// where the player kept clicking after the win (reported: 5:34 stored vs 5:21 shown in game).
// Safe to re-run; only rows whose time changes are written. Run via the manual workflow
// .github/workflows/recompute-speedruns.yml (needs HOT_API_SECRET: members can only
// change their own row through the site).
import { createServer } from 'vite'
import { usersDb, usersDbEnabled } from './lib/usersdb.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

async function main() {
  if (!usersDbEnabled()) throw new Error('HOT_API_SECRET missing')
  const supabase = usersDb
  const { data: rows, error } = await supabase.from('cyn_speedruns').select('openfront_id, game_id, seconds, tiles3min_percent')
  if (error) throw error

  const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 } })
  await server.listen()
  const origin = `http://localhost:${server.httpServer.address().port}`
  const realFetch = globalThis.fetch
  globalThis.fetch = async (u, opts) => {
    if (typeof u === 'string' && u.startsWith('/api/')) {
      const res = await realFetch(origin + u, opts)
      return res.status === 403 ? realFetch(`https://cynclan.com${u}`, opts) : res // see backfill-tile-stats.mjs
    }
    return realFetch(u, opts)
  }

  let changed = 0
  let skipped = 0
  try {
    const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')
    const speedruns = await server.ssrLoadModule('/src/lib/speedruns.ts')
    for (const row of rows) {
      // Same pass the site does on submission: win time + land share at the 3:00 mark (tick 1900 = 3 min + 100-tick spawn phase).
      const metrics = await core.computeSpeedrunMetrics(row.game_id, 1900)
      if (!metrics || metrics.winSeconds == null) {
        console.log(`${row.openfront_id} ${row.game_id}: not replayable, kept ${fmt(row.seconds)}`)
        skipped++
        continue
      }
      // Report-only: stored runs that break the standard-settings rules (see checkSpeedrunConfig). Nothing is deleted here.
      const cfgRes = await fetch(`/api/of/public/game/${encodeURIComponent(row.game_id)}?turns=false`)
      const cfg = cfgRes.ok ? (await cfgRes.json()).info?.config : undefined
      const problem = speedruns.checkSpeedrunConfig(cfg)
      if (problem) console.log(`RULE VIOLATION ${row.openfront_id} ${row.game_id}: ${problem}`)
      const seconds = Math.floor(metrics.winSeconds)
      const update = {}
      if (seconds !== row.seconds) update.seconds = seconds
      // Fill in a missing "Tiles @ 3min" (a replay that failed in the browser used to leave it empty). The
      // tile share belongs to the winner of the stored game, i.e. the member's own run.
      const percents = Object.values(metrics.tilePercentByClientId ?? {})
      const winnerShare = percents.length ? Math.max(...percents) : null
      if (row.tiles3min_percent == null && winnerShare != null) update.tiles3min_percent = winnerShare
      if (Object.keys(update).length === 0) continue
      const { error: upErr } = await supabase.from('cyn_speedruns').update(update).eq('openfront_id', row.openfront_id).eq('game_id', row.game_id)
      if (upErr) throw upErr
      console.log(`${row.openfront_id} ${row.game_id}: ${fmt(row.seconds)} -> ${fmt(seconds)}${update.tiles3min_percent != null ? `, tiles@3min ${update.tiles3min_percent.toFixed(1)}%` : ''}`)
      changed++
    }
  } finally {
    await server.close()
  }
  console.log(JSON.stringify({ runs: rows.length, changed, notReplayable: skipped }))
}

main().catch((e) => {
  console.error('recompute-speedruns failed:', e)
  process.exitCode = 1
})
