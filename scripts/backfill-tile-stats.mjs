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
import fs from 'node:fs'
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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

async function fetchRegisteredMembers() {
  return fetchJson(`${SUPABASE_URL}/rest/v1/cyn_members?select=openfront_id,in_game_name`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
}

async function fetchRecentGameIds() {
  const members = await fetchRegisteredMembers()
  const cutoff = Date.now() - daysBack * 86_400_000
  const ids = new Set()
  for (const m of members) {
    const [main, ranked] = await Promise.all([
      fetchJson(`https://api.openfront.io/public/player/${encodeURIComponent(m.openfront_id)}/games`),
      fetchJson(`https://api.openfront.io/public/player/${encodeURIComponent(m.openfront_id)}/games?filter=ranked`),
    ]).catch(() => [{ results: [] }, { results: [] }])
    const byId = new Map()
    for (const g of [...(main.results ?? []), ...(ranked.results ?? [])]) byId.set(g.gameId, g)
    for (const g of byId.values()) {
      if (g.clanTag !== CLAN_TAG || g.type === 'Singleplayer' || g.type === 'Private') continue
      if (new Date(g.start).getTime() < cutoff) continue
      ids.add(g.gameId)
    }
  }
  return [...ids]
}

async function fetchCoveredGameIds(ids) {
  const covered = new Set()
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    const filter = chunk.map((id) => `"${id}"`).join(',')
    const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/cyn_game_tile_stats?select=game_id&game_id=in.(${filter})`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    for (const r of rows) covered.add(r.game_id)
  }
  return covered
}

async function main() {
  console.log(`Finding recent (last ${daysBack}d) real CYN games missing from cyn_game_tile_stats...`)
  const recentIds = await fetchRecentGameIds()
  const covered = await fetchCoveredGameIds(recentIds)
  const missing = recentIds.filter((id) => !covered.has(id))
  console.log(`${recentIds.length} recent game(s), ${missing.length} missing.\n`)
  if (missing.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  const server = await createServer({ root: ROOT, server: { middlewareMode: false, port: 0 } })
  await server.listen()
  const origin = `http://localhost:${server.httpServer.address().port}`

  // replaySimCore.ts's API_BASE ('/api/of') is a relative path meant for a
  // same-origin browser fetch through the Vite/Vercel proxy - rewrite it to
  // this throwaway dev server's own origin so Node's fetch (which needs an
  // absolute URL) reaches OpenFront through the exact same proxy config the
  // real site uses.
  const realFetch = globalThis.fetch
  globalThis.fetch = (url, opts) => {
    const rewritten = typeof url === 'string' && url.startsWith('/api/') ? origin + url : url
    return realFetch(rewritten, opts)
  }

  const core = await server.ssrLoadModule('/src/lib/replaySimCore.ts')

  let succeeded = 0
  let noVendoredCommit = 0
  let failed = []

  for (const gameId of missing) {
    const commit = await core.resolveEngineCommit(gameId)
    if (!commit) {
      noVendoredCommit++
      continue
    }
    let ok = false
    for (let attempt = 1; attempt <= maxRetries && !ok; attempt++) {
      const stats = await core.computeGameTileStats(gameId, { yieldEveryTicks: 500, onProgress: () => {} }).catch(() => null)
      if (!stats) continue
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cyn_game_tile_stats`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          game_id: gameId,
          vendored_commit: commit,
          compute_logic_version: core.COMPUTE_LOGIC_VERSION,
          max_tiles: stats.maxTiles,
          max_percent: stats.maxPercent,
          final_tiles: stats.finalTiles,
        }),
      })
      ok = res.ok
    }
    if (ok) {
      succeeded++
      console.log(`  ${gameId}: done`)
    } else {
      failed.push(gameId)
      console.log(`  ${gameId}: failed after ${maxRetries} attempt(s)`)
    }
  }

  await server.close()

  console.log(`\nDone: ${succeeded} computed, ${noVendoredCommit} need a newer engine commit, ${failed.length} failed after retries.`)
  if (noVendoredCommit > 0) {
    console.log('Run scripts/auto-vendor-missing.mjs (or detect-engine-commits.mjs manually) to check for a missing engine commit.')
  }
}

main()
