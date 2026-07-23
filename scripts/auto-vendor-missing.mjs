#!/usr/bin/env node
// Automates the "check for a new OpenFront engine version" half of the
// self-healing Max Tiles pipeline (see .github/workflows/engine-maintenance.yml):
// finds which engine commits real, recent CYN games actually used (same
// approach as scripts/detect-engine-commits.mjs, duplicated here rather than
// imported since that script is a human-facing CLI report, not a module -
// this one needs machine-usable results, not formatted text), and runs
// scripts/vendor-engine.mjs for every one we don't have a vendored tree for
// yet.
//
// Usage: node scripts/auto-vendor-missing.mjs [daysBack=14]
//
// Deliberately does NOT commit/push anything itself - the calling workflow
// decides that (by checking `git status` after this runs), since whether a
// new vendor tree is safe to ship is really "did vendor-engine.mjs's own
// tsc -b check pass", which its own exit code already reports.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const daysBack = Number(process.argv[2]) || 14

function loadEnv() {
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
const KNOWN_COMMITS = (() => {
  const content = fs.readFileSync(path.join(ROOT, 'src/lib/replaySimCore.ts'), 'utf8')
  const m = content.match(/export const KNOWN_ENGINE_COMMITS = \[([\s\S]*?)\] as const/)
  return [...m[1].matchAll(/'([0-9a-f]{40})'/g)].map((x) => x[1])
})()

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

async function findMissingCommits() {
  const members = await fetchJson(`${SUPABASE_URL}/rest/v1/cyn_members?select=openfront_id,in_game_name`)
  const cutoff = Date.now() - daysBack * 86_400_000
  const recentGameIds = new Map()

  for (const m of members) {
    let main, ranked
    try {
      ;[main, ranked] = await Promise.all([
        fetch(`https://api.openfront.io/public/player/${encodeURIComponent(m.openfront_id)}/games`).then((r) => r.json()),
        fetch(`https://api.openfront.io/public/player/${encodeURIComponent(m.openfront_id)}/games?filter=ranked`).then((r) => r.json()),
      ])
    } catch {
      continue
    }
    const byId = new Map()
    for (const g of [...(main.results ?? []), ...(ranked.results ?? [])]) byId.set(g.gameId, g)
    for (const g of byId.values()) {
      if (g.clanTag !== CLAN_TAG || g.type === 'Singleplayer') continue
      if (new Date(g.start).getTime() < cutoff) continue
      if (!recentGameIds.has(g.gameId)) recentGameIds.set(g.gameId, m.in_game_name)
    }
  }

  const missing = new Map() // commit -> { gameId, member }
  for (const [gameId, member] of recentGameIds) {
    let json
    try {
      json = await fetch(`https://api.openfront.io/public/game/${encodeURIComponent(gameId)}?turns=false`).then((r) => r.json())
    } catch {
      continue
    }
    const commit = json.gitCommit
    if (commit && !KNOWN_COMMITS.includes(commit) && !missing.has(commit)) missing.set(commit, { gameId, member })
  }
  return missing
}

async function main() {
  console.log(`Checking real CYN games from the last ${daysBack} day(s) for engine commits we haven't vendored yet...`)
  const missing = await findMissingCommits()

  if (missing.size === 0) {
    console.log('None - every recent real game matches a vendored commit.')
    return
  }

  console.log(`Found ${missing.size} missing commit(s):`)
  for (const [commit, { gameId, member }] of missing) console.log(`  ${commit} (e.g. game ${gameId}, ${member})`)

  let anyFailed = false
  for (const commit of missing.keys()) {
    console.log(`\n=== Vendoring ${commit} ===`)
    try {
      execSync(`node scripts/vendor-engine.mjs ${commit}`, { cwd: ROOT, stdio: 'inherit' })
    } catch {
      console.error(`Vendoring ${commit} failed - see output above. Left for manual review, not committed.`)
      anyFailed = true
    }
  }

  if (anyFailed) {
    console.error('\nAt least one commit could not be auto-vendored - check the errors above.')
    process.exit(1)
  }
  console.log('\nAll missing commits vendored successfully.')
}

main()
