// Vercel Cron: proactively backfills cyn_game_detail_cache (see
// supabase/schema.sql) so visitors read pre-computed game details instead of
// every browser re-fetching the same ~hundreds of lookups a full roster
// build needs from OpenFront's own rate-limited API. Modeled directly on
// how community OpenFront Discord bots do this (e.g.
// github.com/deshack/openfront-discord-bot's scheduled worker) - a
// background job scans for games on a timer and writes results to a shared
// store, so the site itself never has to do that work live.
//
// Runs on Vercel's free Hobby plan, which caps Cron Jobs at once/day - see
// vercel.json. Deliberately processes a bounded batch per run rather than
// trying to do everything at once (Vercel Functions have a execution time
// ceiling): whatever it doesn't get to this run, it picks up next run, and
// the client's own fetchGameDetail (src/lib/openfront.ts) still falls back
// to a live fetch (and writes back to this same shared table) for anything
// this job hasn't caught yet - so nothing is ever permanently stuck behind
// this job's own pace.

import { createClient } from '@supabase/supabase-js'

// Hobby plan's Node.js Serverless Functions default to a much shorter
// duration than this unless raised explicitly - the retry-with-backoff
// below means the member-game-list scan phase alone can now take a real
// chunk of a minute under load, confirmed directly (a run that hit repeated
// 429s spent its whole default budget just discovering games, leaving zero
// time for the actual detail-fetch loop below despite having work queued).
export const config = { maxDuration: 60 }

const CLAN_TAG = 'CYN'
const MAX_GAMES_PER_RUN = 60
const TIME_BUDGET_MS = 50_000 // stay under the 60s maxDuration above
// Leaves headroom under TIME_BUDGET_MS/maxDuration for the detail-fetch loop
// and the response itself - both share the same startedAt clock, so this
// isn't "35s on top of" the detail budget, it's a checkpoint partway through it.
const SCAN_TIME_BUDGET_MS = 35_000

// Confirmed directly (this cron's own logs, before this fix): a plain
// unretried 429 anywhere in a member's game-list scan makes that whole
// member silently contribute zero games for the run - not "nothing new to
// do", just a rate-limited request masquerading as one. Same retry-with-
// backoff the main app's getJson uses (src/lib/openfront.ts) - this file
// runs standalone as a Vercel Function and can't import that module, so
// it's duplicated here rather than shared.
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

export default async function handler(req, res) {
  const startedAt = Date.now()
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    res.status(500).json({ error: 'supabase_not_configured' })
    return
  }
  const supabase = createClient(url, key)

  try {
    const { data: registeredRaw, error: regError } = await supabase.from('cyn_members').select('openfront_id')
    if (regError) throw regError

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

    // This cron is a stateless serverless function - unlike the browser
    // (which keeps its own permanent "last known good" games list, see
    // mergeAndCacheGames in src/lib/openfront.ts), it has no history of its
    // own to fall back on. Confirmed live: without reading what's already
    // cached first, a live re-fetch that has a bad pass under rate limiting
    // (partial/empty result) directly overwrites cyn_member_games_cache with
    // that worse result - a member whose real game count was in the
    // hundreds briefly showed 0 games site-wide the moment this shipped,
    // since every visitor reads the same shared row. Reading the existing
    // rows up front and unioning by gameId before every upsert below makes
    // this cache monotonic too: a bad pass can only fail to add new games,
    // it can never make previously-cached ones disappear for everyone.
    const { data: existingGamesRows } = await supabase.from('cyn_member_games_cache').select('openfront_id, games')
    const existingGamesByMember = new Map((existingGamesRows ?? []).map((r) => [r.openfront_id, r.games]))

    const mk = currentMonthKey()
    const wantDetail = new Set()
    let membersScanFailed = 0
    let scanTimedOut = false
    const members = registered
    for (let i = 0; i < members.length; i++) {
      // The scan loop below had no time budget of its own - only the
      // detail-fetch loop further down did. Under heavy rate-limiting this
      // let the scan alone run past Vercel's own maxDuration, killing the
      // whole invocation before it ever returned a response (a hard
      // FUNCTION_INVOCATION_TIMEOUT, confirmed live) instead of degrading to
      // a partial result like every other failure mode here does.
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
    res.status(200).json({
      scanIncomplete, // true means membersScanFailed > 0 below - totalNeeded is a lower bound, not exact
      scanTimedOut, // true means SCAN_TIME_BUDGET_MS cut the member-list scan itself short
      membersScanFailed,
      totalNeeded: wantDetail.size,
      alreadyCached: alreadyCached.size,
      queuedThisRun: missing.length, // capped at MAX_GAMES_PER_RUN, not all necessarily reached (see processed)
      processed, // how many actually ran before the time budget cut it off - may be less than queuedThisRun
      fetched,
      failed,
      remaining,
    })
  } catch (err) {
    console.error('refresh-details cron failed:', err)
    res.status(500).json({ error: 'cron_failed', message: String(err) })
  }
}
