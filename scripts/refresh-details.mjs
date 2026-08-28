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
// run. The roster page's bulk fetchGameDetailsBatch (src/lib/openfront.ts)
// deliberately does NOT fall back to a live fetch for whatever this job
// hasn't caught yet (see that function's own comment) - that's the point,
// it's what makes page load time bounded. Only the single-game
// fetchGameDetail (used when a visitor clicks one specific game) still has a
// live fallback, and writes back to this same shared table when it does.

import { createClient } from '@supabase/supabase-js'

const CLAN_TAG = 'CYN'
const MAX_GAMES_PER_RUN = 60
// Matches RECENT_DETAIL_COUNT in src/lib/stats.ts's buildRoster.
const RECENT_DETAIL_COUNT = 20
// Both budgets were sized around Vercel's old serverless maxDuration (60s) -
// a constraint that hasn't applied since this moved to GitHub Actions (jobs
// default to a 6-hour timeout). Confirmed directly this was actively
// harmful: with 30 registered members and a scan that only got through a
// handful before hitting the old 35s cutoff, most members went un-scanned
// for hours at a time (real games missing from the roster/history pages
// that a member's own browser could see fine on OpenFront directly).
// Widened substantially now that there's no real ceiling to respect other
// than "don't run forever" - still finite, just no longer the bottleneck.
const TIME_BUDGET_MS = 300_000
// Leaves headroom under TIME_BUDGET_MS for the detail-fetch loop and the
// summary log itself - both share the same startedAt clock, so this isn't
// "on top of" the detail budget, it's a checkpoint partway through it.
const SCAN_TIME_BUDGET_MS = 240_000
// How many members are scanned concurrently (see the worker-pool loop
// below) - previously fully sequential, one full paginated fetch at a time,
// which meant the SAME budget only ever covered a fraction of the roster.
// Matches the spirit of MAX_CONCURRENT_REQUESTS in src/lib/openfront.ts
// (kept slightly lower since each member here already fires multiple
// sequential page-requests of its own, so the real concurrent request count
// is higher than this number alone suggests).
const SCAN_CONCURRENCY = 5

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
      } catch (err) {
        // Losing page 0 (the newest page of this feed) is far costlier than
        // losing a later one - it's exactly the page most likely to hold a
        // game not yet in the shared cache. Confirmed directly in
        // production: silently breaking on ANY page failure let one
        // member's data sit 5 days stale while every other member refreshed
        // fine each run, because a rate-limit hit on their page 0
        // specifically kept recurring under the parallel scan pool below -
        // and the caller couldn't tell "genuinely no more pages" apart from
        // "the one page that mattered just failed". Re-thrown instead, so
        // scanOneMember's own catch (and its suspicious-empty-fetch guard)
        // treats this member as failed-this-run rather than accepting a
        // falsely-quiet result.
        if (page === 0) throw err
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

// Keeps the FULL entry object per member (rank/elo/peakElo/username/
// accountUsername/clanTag), not just elo - this is now also written whole to
// cyn_roster_cache (see below) so the browser's fetchRankedMap
// (src/lib/openfront.ts) never has to scan the leaderboard live itself; elo
// alone used to be enough here when this only fed cyn_member_snapshots.
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
    for (const e of entries) byId.set(e.public_id, e)
    for (const e of entries2v2) byId2v2.set(e.public_id, e)
  }
  return { byId, byId2v2 }
}

// Small, duplicated-on-purpose copy of fetchFfaLeaderboard (src/lib/openfront.ts) -
// calls trackerfront's API directly (this script bypasses worker/tf.js the
// same way it bypasses worker/of.js for OpenFront calls above).
async function fetchFfaLeaderboard() {
  const byName = {}
  try {
    const json = await fetchJson('https://trackerfront.com/api/public/leaderboard')
    for (const e of json ?? []) if (e.display_name) byName[e.display_name] = e.position
  } catch {
    // leave empty - ship badges just stay unearned until the next run
  }
  return byName
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

  // Trend-graph data (elo/wins/XP over time - see src/lib/trends.ts) plus the
  // roster page's own leaderboard needs: both fetched once per invocation,
  // not once per member, and cheap either way (a 3-page leaderboard scan +
  // one trackerfront call, one table read). A member outside the ranked top
  // 100 just gets `elo: null` for today, same as the rest of the site
  // already treats "no live elo" everywhere else.
  const { byId: rankedMap, byId2v2: rankedMap2v2 } = await fetchRankedMap().catch(() => ({ byId: new Map(), byId2v2: new Map() }))
  const ffaLeaderboard = await fetchFfaLeaderboard()

  // Written whole to cyn_roster_cache (see supabase/schema.sql) so browsers
  // building the roster (src/lib/openfront.ts's fetchRankedMap/
  // fetchFfaLeaderboard) read this back instead of ever scanning
  // OpenFront/trackerfront live themselves - the permanent fix for page
  // loads blocking on a live external fetch.
  await supabase
    .from('cyn_roster_cache')
    .upsert(
      {
        id: 1,
        ranked_1v1: Object.fromEntries(rankedMap),
        ranked_2v2: Object.fromEntries(rankedMap2v2),
        ffa_leaderboard: ffaLeaderboard,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .then(() => {}, () => {})

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

  // One member's full scan (fetch + 2 upserts + wantDetail bookkeeping) -
  // pulled out so the worker pool below can run several of these
  // concurrently instead of one full paginated fetch at a time.
  async function scanOneMember(r) {
    let games
    try {
      games = await fetchPlayerGames(r.openfront_id)
    } catch (err) {
      console.error(`Failed to fetch games for ${r.openfront_id}:`, err)
      membersScanFailed++
      return
    }
    const existingGames = existingGamesByMember.get(r.openfront_id) ?? []

    // fetchJson's per-page catch{break} means a page-0 fetch that exhausts
    // all its own retries (heavy rate-limiting under the parallel scan pool
    // below) silently returns an EMPTY list rather than throwing - games=[]
    // for a member who already has real history is virtually always that,
    // not "genuinely zero games since last run". Upserting anyway used to
    // stamp a fresh updated_at despite fetching nothing new, which made a
    // silently-failed member look up to date instead of stale - confirmed
    // directly in production: a member's cache sat 5 days behind their real
    // history while updated_at kept refreshing every run. Skipping the
    // write here (existing row, including its updated_at, is left exactly
    // as-is) means the next run's shuffle just retries this member normally
    // instead of a false "already current" reading.
    if (games.length === 0 && existingGames.length > 0) {
      console.warn(`Suspicious empty fetch for ${r.openfront_id} (has ${existingGames.length} cached games) - likely a transient failure, skipping this run's write`)
      membersScanFailed++
      return
    }

    // Shared with the client's own fetchPlayerGamesBatch (src/lib/openfront.ts)
    // via cyn_member_games_cache - this scan is the same rate-limited,
    // paginated OpenFront fetch every visitor's browser would otherwise have
    // to repeat itself, which profiling found to be the actual dominant cost
    // of a cold page load (not game-detail lookups). Writing it here once
    // every run means a visitor's browser can read it back in one query
    // instead. Unioned against whatever's already cached (see above) so
    // this write can only grow the list, never shrink it.
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
          elo: rankedMap.get(r.openfront_id)?.elo ?? null,
          elo_2v2: rankedMap2v2.get(r.openfront_id)?.elo ?? null,
          all_wins: allWins,
          xp: xpByMember.get(r.openfront_id) ?? 0,
        },
        { onConflict: 'openfront_id,snapshot_date' },
      )
      .then(() => {}, () => {})

    // Uses mergedGames (not the possibly-truncated fresh fetch) so a bad
    // pass here can't also make wantDetail miss a team win or this
    // month's game that a previous run already knew about.
    const cynGames = mergedGames.filter((g) => g.clanTag === CLAN_TAG && g.type !== 'Singleplayer')
    for (const g of cynGames) {
      const isTeam = g.mode === 'Team'
      const isFfa = g.mode === 'Free For All'
      if (isTeam && g.result === 'victory') wantDetail.add(g.gameId)
      if (monthKeyOf(g.start) === mk && (isFfa || isTeam)) wantDetail.add(g.gameId)
    }
    // Mirrors buildRoster's own RECENT_DETAIL_COUNT selection (src/lib/stats.ts)
    // exactly: each member's most recent 20 CYN games of ANY mode/result, not
    // just team-wins/this-month - the profile page's last-N-games stats card
    // needs kills/gold/troops across FFA/Team/1v1 alike. Without this, that
    // detail wasn't pre-cached anywhere, forcing a live OpenFront fetch on
    // every cold roster load just to fill it in.
    const recentSorted = [...cynGames].sort((a, b) => new Date(b.start) - new Date(a.start))
    for (const g of recentSorted.slice(0, RECENT_DETAIL_COUNT)) wantDetail.add(g.gameId)
  }

  // Bounded-concurrency worker pool (same shared-index pattern as
  // prefetchGameTileStats in src/lib/replaySim.ts): SCAN_CONCURRENCY workers
  // pull the next member off `members` until either the queue is empty or
  // the time budget runs out. `nextIndex` is only ever read+incremented in
  // a synchronous stretch (no `await` in between), so this is race-free
  // without a real mutex despite running several workers concurrently.
  let nextIndex = 0
  async function scanWorker() {
    for (;;) {
      if (Date.now() - startedAt > SCAN_TIME_BUDGET_MS) {
        scanTimedOut = true
        return
      }
      if (nextIndex >= members.length) return
      const r = members[nextIndex++]
      await scanOneMember(r)
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, members.length) }, scanWorker))
  // Whatever never even got claimed by a worker before time ran out -
  // computed once here (not inside a worker) so concurrent workers hitting
  // the timeout at nearly the same moment can't double-count the remainder.
  if (scanTimedOut) membersScanFailed += members.length - nextIndex

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
