#!/usr/bin/env node
// Scans real registered members' recent CYN games for which OpenFront
// engine commit they were played on, and compares that against what's
// currently vendored (KNOWN_ENGINE_COMMITS in src/lib/replaySimCore.ts).
//
// Usage: node scripts/detect-engine-commits.mjs [daysBack=14]
//
// Reports two things:
//   - MISSING: commits real games actually used that we have no vendored
//     tree for yet - run `node scripts/vendor-engine.mjs <sha>` for each.
//   - UNUSED (within the checked window): vendored commits that none of the
//     checked games referenced. This is a *candidate list for pruning*, not
//     a verdict - games older than the window (or from members who joined
//     after this ran) may still need them for their own replay. Never
//     deletes anything itself; that's a manual, deliberate call.
//
// Costs one OpenFront API call per distinct recent game (on top of the
// per-member game-list calls) - keep daysBack modest to stay well within
// OpenFront's rate limits, same reasoning as the site's own sequential
// prefetch queue (see src/lib/replaySim.ts).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const daysBack = Number(process.argv[2]) || 14

function loadEnvLocal() {
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

function loadClanTag() {
  const configPath = path.join(ROOT, 'src/config.ts')
  const content = fs.readFileSync(configPath, 'utf8')
  const m = content.match(/CLAN_TAG\s*=\s*['"]([^'"]+)['"]/)
  if (!m) throw new Error('Could not find CLAN_TAG in src/config.ts')
  return m[1]
}

function loadKnownCommits() {
  const content = fs.readFileSync(path.join(ROOT, 'src/lib/replaySimCore.ts'), 'utf8')
  const m = content.match(/export const KNOWN_ENGINE_COMMITS = \[([\s\S]*?)\] as const/)
  if (!m) throw new Error('Could not find KNOWN_ENGINE_COMMITS in src/lib/replaySimCore.ts')
  return [...m[1].matchAll(/'([0-9a-f]{40})'/g)].map((x) => x[1])
}

const env = loadEnvLocal()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const CLAN_TAG = loadClanTag()
const KNOWN_COMMITS = loadKnownCommits()

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

async function fetchRegisteredMembers() {
  const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/cyn_members?select=openfront_id,in_game_name`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  return rows
}

async function fetchPlayerGames(publicId) {
  const [main, ranked] = await Promise.all([
    fetchJson(`https://api.openfront.io/public/player/${encodeURIComponent(publicId)}/games`),
    fetchJson(`https://api.openfront.io/public/player/${encodeURIComponent(publicId)}/games?filter=ranked`),
  ])
  const byId = new Map()
  for (const g of [...(main.results ?? []), ...(ranked.results ?? [])]) byId.set(g.gameId, g)
  return [...byId.values()]
}

async function fetchGitCommit(gameId) {
  const json = await fetchJson(`https://api.openfront.io/public/game/${encodeURIComponent(gameId)}?turns=false`)
  return json.gitCommit ?? null
}

async function main() {
  console.log(`Checking real CYN games from the last ${daysBack} day(s) against ${KNOWN_COMMITS.length} vendored commit(s)...\n`)
  const members = await fetchRegisteredMembers()
  console.log(`${members.length} registered member(s).`)

  const cutoff = Date.now() - daysBack * 86_400_000
  const recentGameIds = new Map() // gameId -> example member name

  for (const m of members) {
    let games
    try {
      games = await fetchPlayerGames(m.openfront_id)
    } catch (err) {
      console.warn(`  could not fetch games for ${m.in_game_name} (${m.openfront_id}): ${err.message}`)
      continue
    }
    for (const g of games) {
      if (g.clanTag !== CLAN_TAG || g.type === 'Singleplayer') continue
      if (new Date(g.start).getTime() < cutoff) continue
      if (!recentGameIds.has(g.gameId)) recentGameIds.set(g.gameId, m.in_game_name)
    }
  }
  console.log(`${recentGameIds.size} distinct recent CYN game(s) to check.\n`)

  const commitToExample = new Map() // commit -> { gameId, member }
  let checked = 0
  for (const [gameId, member] of recentGameIds) {
    let commit
    try {
      commit = await fetchGitCommit(gameId)
    } catch (err) {
      console.warn(`  could not fetch commit for game ${gameId}: ${err.message}`)
      continue
    }
    checked++
    if (commit && !commitToExample.has(commit)) commitToExample.set(commit, { gameId, member })
  }
  console.log(`Checked ${checked} game(s).\n`)

  const missing = [...commitToExample.entries()].filter(([c]) => !KNOWN_COMMITS.includes(c))
  const unused = KNOWN_COMMITS.filter((c) => !commitToExample.has(c))

  console.log('=== MISSING (real games use these, no vendored tree yet) ===')
  if (missing.length === 0) {
    console.log('  none - every recent real game matches a vendored commit.')
  } else {
    for (const [commit, { gameId, member }] of missing) {
      console.log(`  ${commit}  (e.g. game ${gameId}, ${member})`)
      console.log(`    -> node scripts/vendor-engine.mjs ${commit}`)
    }
  }

  console.log('\n=== UNUSED within this window (pruning candidates, NOT deleted) ===')
  if (unused.length === 0) {
    console.log('  none - every vendored commit matched at least one recent game.')
  } else {
    for (const commit of unused) {
      console.log(`  ${commit}`)
    }
    console.log(
      `  (no recent game referenced these - doesn't mean it's safe to delete: older games not\n` +
        `  covered by this ${daysBack}-day window may still need them for their own replay.)`,
    )
  }
}

main()
