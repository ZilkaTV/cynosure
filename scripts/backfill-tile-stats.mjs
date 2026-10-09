#!/usr/bin/env node
// Computes Max Tiles for any recent real CYN game missing from the shared
// cyn_game_tile_stats cache, instead of waiting for a real visitor to
// happen to open that exact game (or that member's profile) and trigger
// prefetchGameTileStats organically. Meant to run on a schedule (see
// .github/workflows/engine-maintenance.yml) right after
// scripts/auto-vendor-missing.mjs, so a newly-vendored engine commit gets
// its backlog of games computed immediately instead of trickling in from
// site traffic.
//
// Usage: node scripts/backfill-tile-stats.mjs [daysBack=14] [retries=2]
//
// Runs the exact same computeGameTileStats/resolveEngineCommit used by the
// site itself (via a throwaway Vite dev server, so the vendored TS engine
// trees load the same way they do in the browser, and the /api/of proxy in
// vite.config.ts is reused instead of hand-rolling a second path to
// OpenFront's API). Retries a game a few times before giving up - a failure
// here is almost always transient (a rate-limited fetch, a brief OpenFront
// hiccup), not permanent, confirmed directly: several games that failed on
// a first attempt succeeded cleanly on a second or third. A game whose
// commit genuinely isn't vendored fails fast (no point retrying that) and
// is reported separately so it's obvious whether scripts/auto-vendor-missing.mjs
// needs to run (or didn't manage to vendor everything).

import { createServer } from 'vite'
import { hotEnabled, hotGetAllMemberGames, hotNewestMemberUpdate } from './lib/hotstore.mjs'
import { usersDb } from './lib/usersdb.mjs'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const daysBack = Number(process.argv[2]) || 14
const maxRetries = Number(process.argv[3]) || 2

function loadEnv() {
  // GitHub Actions supplies these as real env vars; a local run falls back
  // to .env.local like the other scripts in this folder.
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    return { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY }
  }
  const envPath = path.join(ROOT, '.env.local')
  const env = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const CLAN_TAG = (() => {
  const content = fs.readFileSync(path.join(ROOT, 'src/config.ts'), 'utf8')
  return content.match(/CLAN_TAG\s*=\s*['"]([^'"]+)['"]/)[1]
})()

if (!hotEnabled()) {
  console.error('Missing HOT_API_SECRET')
  process.exit(1)
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

// Reads each member's game list from our own shared cache
// (cyn_member_games_cache, kept current by refresh-details.mjs) instead of
// paging OpenFront's player-games endpoint directly. The old direct calls
// swallowed every error into an empty list (.catch -> no games), so a
// rate-limited or blocked run from GitHub's IPs silently reported "0 recent
// games, nothing to backfill" - confirmed in the run log while 18 of the 25
// newest CYN games had no Max Tiles row at all.
async function fetchRecentGameIds() {
  const cutoff = Date.now() - daysBack * 86_400_000
  const ids = new Set()
  const collect = (games) => {
    for (const g of games ?? []) {
      if (g.clanTag !== CLAN_TAG || g.type === 'Singleplayer' || g.type === 'Private') continue
      if (g.result === 'incomplete') continue
      if (new Date(g.start).getTime() < cutoff) continue
      ids.add(g.gameId)
    }
  }
  for (const row of await hotGetAllMemberGames()) collect(row.games)
  return [...ids]
}

// Only a row at the CURRENT compute_logic_version counts as covered - a row
// left over from an older version (a since-fixed bug in the math, not the
// vendored engine) is exactly as stale as a missing row, but a plain
// game_id existence check can't tell the difference. This is what the
// client's own read path already does (see fetchShared in replaySim.ts);
// this script just wasn't following the same rule, so games nobody
// happened to reopen in a browser stayed stuck showing numbers from a
// logic version the site itself no longer trusts (confirmed directly: 18
// of 461 sampled rows were still on an older version).
async function fetchCoveredGameIds(ids, computeLogicVersion) {
  const covered = new Set()
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    const { data: rows, error } = await usersDb.from('cyn_game_tile_stats').select('game_id').in('game_id', chunk).eq('compute_logic_version', computeLogicVersion)
    if (error) throw error
    for (const r of rows ?? []) covered.add(r.game_id)
  }
  return covered
}

const execFileAsync = promisify(execFile)

/** Replays one game in a fresh Node process and returns its parsed RESULT line (or null on a crash/timeout). */
async function computeInChild(gameId) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(__dirname, 'compute-tile-stats-one.mjs'), gameId], {
      maxBuffer: 200 * 1024 * 1024,
      timeout: 10 * 60_000,
      env: process.env,
    })
    const line = stdout.split(/\r?\n/).reverse().find((l) => l.startsWith('RESULT:'))
    return line ? JSON.parse(line.slice('RESULT:'.length)) : null
  } catch (err) {
    console.error(`  ${gameId}: child process failed: ${String(err.message ?? err).split(/\r?\n/)[0].slice(0, 160)}`)
    return null
  }
}

async function main() {
  const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 } })
  await server.listen()
  const origin = `http://localhost:${server.httpServer.address().port}`

  // replaySimCore.ts's API_BASE ('/api/of') is a relative path meant for a
  // same-origin browser fetch through the Vite/Vercel proxy - rewrite it to
  // this throwaway dev server's own origin so Node's fetch (which needs an
  // absolute URL) reaches OpenFront through the exact same proxy config the
  // real site uses.
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      const res = await realFetch(origin + url, opts)
      // GitHub's runner IPs are often answered with OpenFront's Cloudflare bot challenge (403) through the dev
      // server's own proxy; that made resolveEngineCommit report "needs a newer engine commit" for games whose
      // commit IS vendored. Our Worker proxy (same allowed paths) reaches OpenFront from a different network.
      if (res.status === 403) return realFetch(`https://cynclan.com${url}`, opts)
      return res
    }
    return realFetch(url, opts)
  }

  let succeeded = 0
  let noVendoredCommit = 0
  let failed = []

  // Wrapped so a genuinely unexpected error (a thrown fetch, a bad response
  // body, anything not already caught below) still closes the dev server
  // instead of leaving the process hanging until CI's own step timeout.
  try {
    const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')

    // Reading every member's game list is ~1.5 MB of Supabase egress (free plan: 5.5 GB a month),
    // so only do it when new games arrived recently, plus a full pass every 6 hours to retry
    // transient failures. FORCE_BACKFILL=1 skips this check (manual runs).
    if (!process.env.FORCE_BACKFILL) {
      const newestAt = await hotNewestMemberUpdate()
      const newestMs = newestAt ? new Date(newestAt).getTime() : 0
      const recentlyChanged = Date.now() - newestMs < 70 * 60_000
      const fullPassSlot = new Date().getUTCHours() % 6 === 0
      if (!recentlyChanged && !fullPassSlot) {
        console.log('No game list changed in the last 70 minutes and this is not a 6-hourly full pass - skipping the backfill check.')
        return
      }
    }

    console.log(`Finding recent (last ${daysBack}d) real CYN games missing from cyn_game_tile_stats at logic version ${core.COMPUTE_LOGIC_VERSION}...`)
    const recentIds = await fetchRecentGameIds()
    const covered = await fetchCoveredGameIds(recentIds, core.COMPUTE_LOGIC_VERSION)
    const missing = recentIds.filter((id) => !covered.has(id))
    console.log(`${recentIds.length} recent game(s), ${missing.length} missing.\n`)
    if (missing.length === 0) {
      console.log('Nothing to backfill.')
      return
    }

    for (const gameId of missing) {
      // Retried the same way computeGameTileStats below already is -
      // confirmed live: resolveEngineCommit's own fetch failing transiently
      // (a rate limit, a brief OpenFront hiccup) was indistinguishable from
      // a genuinely-unvendored commit, both collapsing to null here with no
      // retry at all, so a handful of games got permanently misreported as
      // "needs a newer engine commit" for this run even though
      // scripts/auto-vendor-missing.mjs (run just before this) confirmed
      // every recent game's commit was already vendored.
      // One fresh process per game (scripts/compute-tile-stats-one.mjs): the engine cannot replay a second game in the
      // same JS realm, which used to make everything after the first game of a batch fail.
      let commit = null
      let ok = false
      for (let attempt = 1; attempt <= maxRetries && !ok; attempt++) {
        const out = await computeInChild(gameId)
        if (out?.error === 'no_commit') continue
        if (!out?.stats) continue
        commit = out.commit
        ok = await usersDb
          .from('cyn_game_tile_stats')
          .upsert(
            {
              game_id: gameId,
              vendored_commit: out.commit,
              compute_logic_version: out.version,
              max_tiles: out.stats.maxTiles,
              max_percent: out.stats.maxPercent,
              final_tiles: out.stats.finalTiles,
              computed_at: new Date().toISOString(),
            },
            { onConflict: 'game_id,vendored_commit,compute_logic_version' },
          )
          .then((res) => !res.error)
          .catch(() => false)
      }
      if (!commit && !ok) {
        noVendoredCommit++
        continue
      }
      if (ok) {
        succeeded++
        console.log(`  ${gameId}: done`)
      } else {
        failed.push(gameId)
        console.log(`  ${gameId}: failed after ${maxRetries} attempt(s)`)
      }
    }
  } finally {
    await server.close()
  }

  console.log(`\nDone: ${succeeded} computed, ${noVendoredCommit} need a newer engine commit, ${failed.length} failed after retries.`)
  if (noVendoredCommit > 0) {
    console.log('Run scripts/auto-vendor-missing.mjs (or detect-engine-commits.mjs manually) to check for a missing engine commit.')
  }
}

main()
