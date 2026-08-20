#!/usr/bin/env node
// Backfills cyn_game_detail_cache (see supabase/schema.sql) so visitors read
// pre-computed game details instead of every browser re-fetching the same
// ~hundreds of lookups a full roster build needs from OpenFront's own
// rate-limited API. Modeled directly on how community OpenFront Discord bots
// do this (e.g. github.com/deshack/openfront-discord-bot's scheduled
// worker) - a background job scans for games on a timer and writes results
// to a shared store, so the site itself never has to do that work live.
//
// Runs as a plain Node script driven by .github/workflows/refresh-details-cron.yml
// every ~5 minutes (matches the cadence of scripts/backfill-tile-stats.mjs's
// own workflow). Used to run as a Vercel serverless function
// (api/cron/refresh-details.js) instead - moved here because Cloudflare
// Workers/Pages Functions (the replacement hosting) cap outbound fetch()
// calls at 50 per invocation on the free tier, and a single member's
// paginated game-history scan alone can issue 30-40+ sequential fetches -
// with more than one or two registered members this would blow straight
// through that cap. A GitHub Actions runner has no such limit.
//
// Deliberately processes a bounded batch per run rather than trying to do
// everything at once: whatever it doesn't get to this run, it picks up next
// run, and the client's own fetchGameDetail (src/lib/openfront.ts) still
// falls back to a live fetch (and writes back to this same shared table) for
// anything this job hasn't caught yet - so nothing is ever permanently stuck
// behind this job's own pace.

import { createClient } from '@supabase/supabase-js'

const CLAN_TAG = 'CYN'
const MAX_GAMES_PER_RUN = 60
const TIME_BUDGET_MS = 50_000
// Leaves headroom under TIME_BUDGET_MS for the detail-fetch loop and the
// summary log itself - both share the same startedAt clock, so this isn't
// "35s on top of" the detail budget, it's a checkpoint partway through it.
const SCAN_TIME_BUDGET_MS = 35_000

// Confirmed directly (this job's own logs, before this fix): a plain
// unretried 429 anywhere in a member's game-list scan makes that whole
// member silently contribute zero games for the run - not "nothing new to
// do", just a rate-limited request masquerading as one. Same retry-with-
// backoff the main app's getJson uses (src/lib/openfront.ts) - this script
// runs standalone and can't import that module, so it's duplicated here
// rather than shared.
const RATE_LIMIT_RETRIES = 4
const RATE_LIMIT_BASE_DELAY_MS = 500

async function fetchJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 429) {
      if (attempt >= RATE_LIMIT_RETRIES) throw new Error(`rate-limited: ${url}`)
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`OpenFront API ${res.status} for ${url}`)
    return res.json()
  }
}

async function fetchPlayerGames(publicId) {
  const all = []
  for (const filter of [null, 'ranked']) {
    let cursor = null
    for (let page = 0; page < (filter ? 13 : 25); page++) {
      const url = new URL(`https://api.openfront.io/public/player/${encodeURIComponent(publicId)}/games`)
      if (filter) url.searchParams.set('filter', filter)
      if (cursor) url.searchParams.set('cursor', cursor)
      let json
      try {
        json = await fetchJson(url.toString())
      } catch {
        break
      }
      all.push(...(json.results ?? []))
      cursor = json.nextCursor ?? null
      if (!cursor) break
    }
  }
  const byId = new Map()
  for (const g of all) byId.set(g.gameId, g)
  return [...byId.values()]
}

function currentMonthKey() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthKeyOf(iso) {
  return iso.slice(0, 7)
}

// Small, duplicated-on-purpose copy of fetchRankedMap (src/lib/openfront.ts) -
// same reasoning as fetchPlayerGames/fetchGameDetail above: this script
// can't import from src/. Only 3 pages (LEADERBOARD_SCAN_PAGES in
// src/config.ts), run once per invocation, not once per member.
const LEADERBOARD_SCAN_PAGES = 3

async function fetchRankedMap() {
  const byId = new Map()
  const byId2v2 = new Map()
  for (let page = 1; page <= LEADERBOARD_SCAN_PAGES; page++) {
    let json
    try {
      json = await fetchJson(`https://api.openfront.io/leaderboard/ranked?page=${page}`)
    } catch {
      break
    }
    const entries = json?.['1v1'] ?? []
    const entries2v2 = json?.['2v2'] ?? []
    if (entries.length === 0 && entries2v2.length === 0) break
    for (const e of entries) byId.set(e.public_id, e.elo)
    for (const e of entries2v2) byId2v2.set(e.public_id, e.elo)
  }
  return { byId, byId2v2 }
}

async function fetchGameDetail(gameId) {
  const json = await fetchJson(`https://api.openfront.io/public/game/${encodeURIComponent(gameId)}?turns=false`)
  const info = json.info
  if (!info) return null
  return {
    gameId: info.gameID ?? gameId,
    map: info.config?.gameMap ?? '?',
    gameType: info.config?.gameType ?? '?',
    nations: info.config?.nations ?? '?',
    bots: info.config?.bots ?? 0,
    durationSeconds: info.duration ?? 0,
    numTurns: info.num_turns ?? 0,
    winnerClientId: Array.isArray(info.winner) ? info.winner[1] ?? null : null,
    start: info.start ?? 0,
    players: info.players ?? [],
  }
}

async function main() {
  const startedAt = Date.now()

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error(JSON.stringify({ error: 'supabase_not_configured' }))
    process.exitCode = 1
    return
  }
  const supabase = createClient(url, key)

  const { data: registeredRaw, error: regError } = await supabase.from('cyn_members').select('openfront_id')
  if (regError) throw regError

  // Trend-graph data (elo/wins/XP over time - see src/lib/trends.ts): both
  // fetched once per invocation, not once per member, and cheap either way
  // (a 3-page leaderboard scan, one table read). A member outside the
  // ranked top 100 just gets `elo: null` for today, same as the rest of
  // the site already treats "no live elo" everywhere else.
  const { byId: rankedMap, byId2v2: rankedMap2v2 } = await fetchRankedMap().catch(() => ({ byId: new Map(), byId2v2: new Map() }))
  const { data: xpRows } = await supabase.from('cyn_xp').select('openfront_id, xp')
  const xpByMember = new Map((xpRows ?? []).map((r) => [r.openfront_id, r.xp]))
  const snapshotDate = new Date().toISOString().slice(0, 10)

  // Confirmed live: the member scan runs sequentially (one full paginated
  // fetch per member, not in parallel), so whoever Supabase happens to
  // return last consistently faces the worst rate-limit pressure - by
  // then every earlier member's own requests this same run have already
  // been fired. A stable select order (Supabase's default) meant the same
  // member got starved every single run - not bad luck, a standing bias.
  // Shuffling here spreads that pressure across a different member each
  // run instead of parking it permanently on one.
  const registered = [...(registeredRaw ?? [])]
  for (let i = registered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[registered[i], registered[j]] = [registered[j], registered[i]]
  }

  // Not a stateless invocation the way the old Vercel function was, but the
  // reasoning still applies (unlike the browser's own permanent "last known
  // good" games list - see mergeAndCacheGames in src/lib/openfront.ts, a
  // fresh process here has none of its own): reading what's already cached
  // first and unioning by gameId before every upsert makes this cache
  // monotonic - a bad pass under rate limiting can only fail to add new
  // games, it can never make previously-cached ones disappear for everyone.
  const { data: existingGamesRows } = await supabase.from('cyn_member_games_cache').select('openfront_id, games')
  const existingGamesByMember = new Map((existingGamesRows ?? []).map((r) => [r.openfront_id, r.games]))

  // Historical high-water mark per member, so a snapshot's own all_wins can
  // never regress below what's already on record even if this run's
  // mergedGames is somehow thinner than a past run's (e.g. a shared-cache
  // write from elsewhere lost games before the fix in src/lib/openfront.ts's
  // saveSharedPlayerGames - this is the persisted-history-side half of that
  // same guarantee, confirmed necessary against real data: the clan-wide
  // all_wins trend had visible drops day to day, including one with the
  // exact same member count both days). A handful of hundred rows total, so
  // fetching everything and reducing client-side is simpler than a
  // per-member query loop.
  const { data: allSnapshotRows } = await supabase.from('cyn_member_snapshots').select('openfront_id, all_wins')
  const priorMaxWinsByMember = new Map()
  for (const row of allSnapshotRows ?? []) {
    const prev = priorMaxWinsByMember.get(row.openfront_id) ?? 0
    if (row.all_wins > prev) priorMaxWinsByMember.set(row.openfront_id, row.all_wins)
  }

  const mk = currentMonthKey()
  const wantDetail = new Set()
  let membersScanFailed = 0
  let scanTimedOut = false
  const members = registered
  for (let i = 0; i < members.length; i++) {
    // The scan loop below had no time budget of its own on Vercel - only
    // the detail-fetch loop further down did. Under heavy rate-limiting
    // this let the scan alone run past the function's own maxDuration,
    // killing the whole invocation before it ever returned a response
    // instead of degrading to a partial result like every other failure
    // mode here does. Kept here even though a GitHub Actions job has a far
    // longer default budget - still a sane self-throttle.
    if (Date.now() - startedAt > SCAN_TIME_BUDGET_MS) {
      membersScanFailed += members.length - i
      scanTimedOut = true
      break
    }
    const r = members[i]
    let games
    try {
      games = await fetchPlayerGames(r.openfront_id)
    } catch (err) {
      console.error(`Failed to fetch games for ${r.openfront_id}:`, err)
      membersScanFailed++
      continue
    }
    // Shared with the client's own fetchPlayerGamesBatch (src/lib/openfront.ts)
    // via cyn_member_games_cache - this scan is the same rate-limited,
    // paginated OpenFront fetch every visitor's browser would otherwise have
    // to repeat itself, which profiling found to be the actual dominant cost
    // of a cold page load (not game-detail lookups). Writing it here once
    // every ~5 minutes means a visitor's browser can read it back in one
    // query instead. Unioned against whatever's already cached (see above)
    // so this write can only grow the list, never shrink it.
    const existingGames = existingGamesByMember.get(r.openfront_id) ?? []
    const byGameId = new Map(existingGames.map((g) => [g.gameId, g]))
    for (const g of games) byGameId.set(g.gameId, g)
    const mergedGames = [...byGameId.values()]
    await supabase
      .from('cyn_member_games_cache')
      .upsert(
        { openfront_id: r.openfront_id, games: mergedGames, updated_at: new Date().toISOString() },
        { onConflict: 'openfront_id' },
      )
      .then(() => {}, () => {})

    // One row per member per day (upsert on conflict), refined every time
    // this job touches that member - by end of day it holds the last
    // values seen, which is all a daily-granularity trend graph needs.
    // Uses mergedGames too, so a truncated live fetch this run can't make
    // the win count regress for the day. Clamped against this member's own
    // historical max as a second, independent floor (see
    // priorMaxWinsByMember above) - belt and suspenders against the win
    // count ever visibly dropping in the trend chart.
    let allWins = 0
    for (const g of mergedGames) {
      if (g.clanTag === CLAN_TAG && g.type !== 'Singleplayer' && g.result === 'victory') allWins++
    }
    allWins = Math.max(allWins, priorMaxWinsByMember.get(r.openfront_id) ?? 0)
    await supabase
      .from('cyn_member_snapshots')
      .upsert(
        {
          openfront_id: r.openfront_id,
          snapshot_date: snapshotDate,
          elo: rankedMap.get(r.openfront_id) ?? null,
          elo_2v2: rankedMap2v2.get(r.openfront_id) ?? null,
          all_wins: allWins,
          xp: xpByMember.get(r.openfront_id) ?? 0,
        },
        { onConflict: 'openfront_id,snapshot_date' },
      )
      .then(() => {}, () => {})

    // Uses mergedGames (not the possibly-truncated fresh fetch) so a bad
    // pass here can't also make wantDetail miss a team win or this
    // month's game that a previous run already knew about.
    for (const g of mergedGames) {
      if (g.clanTag !== CLAN_TAG || g.type === 'Singleplayer') continue
      const isTeam = g.mode === 'Team'
      const isFfa = g.mode === 'Free For All'
      if (isTeam && g.result === 'victory') wantDetail.add(g.gameId)
      if (monthKeyOf(g.start) === mk && (isFfa || isTeam)) wantDetail.add(g.gameId)
    }
  }
  // A member scan failing (still-rate-limited despite the retries above)
  // silently shrinks wantDetail, not "nothing to do" - surfaced explicitly
  // below instead of a confusing/negative remaining count.
  const scanIncomplete = membersScanFailed > 0

  const { data: existing, error: existingError } = await supabase.from('cyn_game_detail_cache').select('game_id')
  if (existingError) throw existingError
  const alreadyCached = new Set((existing ?? []).map((r) => r.game_id))

  const missing = [...wantDetail].filter((id) => !alreadyCached.has(id)).slice(0, MAX_GAMES_PER_RUN)

  let fetched = 0
  let failed = 0
  let processed = 0
  for (const gameId of missing) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
    processed++
    try {
      const detail = await fetchGameDetail(gameId)
      if (detail) {
        await supabase.from('cyn_game_detail_cache').upsert({ game_id: gameId, detail }, { onConflict: 'game_id' })
        fetched++
      }
    } catch (err) {
      console.error(`Failed to fetch/cache detail for ${gameId}:`, err)
      failed++
    }
  }

  const remaining = [...wantDetail].filter((id) => !alreadyCached.has(id)).length - fetched
  console.log(
    JSON.stringify(
      {
        scanIncomplete,
        scanTimedOut,
        membersScanFailed,
        totalNeeded: wantDetail.size,
        alreadyCached: alreadyCached.size,
        queuedThisRun: missing.length,
        processed,
        fetched,
        failed,
        remaining,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('refresh-details failed:', err)
  process.exitCode = 1
})
