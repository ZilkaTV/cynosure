#!/usr/bin/env node
// Re-times every stored speedrun with the engine's own win check (computeWinSeconds in
// src/lib/replaySimCore.ts) instead of "time of the last real action", which over-counted any run
// where the player kept clicking after the win (reported: 5:34 stored vs 5:21 shown in game).
// Safe to re-run; only rows whose time changes are written. Run via the manual workflow
// .github/workflows/recompute-speedruns.yml (needs the service role key: members only
// have RLS access to their own row).
import { createServer } from 'vite'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key)
  const { data: rows, error } = await supabase.from('cyn_speedruns').select('openfront_id, game_id, seconds')
  if (error) throw error

  const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 } })
  await server.listen()
  const origin = `http://localhost:${server.httpServer.address().port}`
  const realFetch = globalThis.fetch
  globalThis.fetch = (u, opts) => realFetch(typeof u === 'string' && u.startsWith('/api/') ? origin + u : u, opts)

  let changed = 0
  let skipped = 0
  try {
    const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')
    for (const row of rows) {
      const win = await core.computeWinSeconds(row.game_id)
      if (win == null) {
        console.log(`${row.openfront_id} ${row.game_id}: not replayable, kept ${fmt(row.seconds)}`)
        skipped++
        continue
      }
      const seconds = Math.floor(win)
      if (seconds === row.seconds) continue
      const { error: upErr } = await supabase.from('cyn_speedruns').update({ seconds }).eq('openfront_id', row.openfront_id).eq('game_id', row.game_id)
      if (upErr) throw upErr
      console.log(`${row.openfront_id} ${row.game_id}: ${fmt(row.seconds)} -> ${fmt(seconds)}`)
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
