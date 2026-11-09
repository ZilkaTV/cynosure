#!/usr/bin/env node
// Rebuilds cyn_clan_score_ledger (see supabase/schema.sql) in full every
// run: OpenFront's own official clan-leaderboard weighting formula (from
// openfrontio/OpenFrontIO's docs/API.md), applied to every eligible Team
// game any registered [CYN] member has ever played, walked chronologically
// so each game also gets the clan's own cumulative weighted win/loss ratio
// immediately before and after it - not just that one game's own score.
// The cumulative ratio uses the same 30-day-half-life decay OpenFront's own
// live leaderboard uses (relative to "now" at each run), so it tracks a
// clan's current form the same way OpenFront's own number does.
//
// Reads only cyn_member_games_cache (already maintained by
// refresh-details.mjs) - no OpenFront API calls of its own. Duplicates the
// pure formula functions from src/lib/clanScore.ts (this script can't
// import from src/, same reasoning as every other duplicated helper in this
// repo's scripts/).
//
// Full recompute rather than incremental: this clan's total Team-game count
// is small enough (low thousands at most) that recomputing from scratch
// every run is cheap and avoids an entire class of incremental-update bugs
// (a partial write leaving stale cumulative sums behind, etc).
//
// Runs on a schedule via .github/workflows/clan-score-ledger.yml.

import { hotEnabled, hotGetAllMemberGames, hotGetBlob, hotGetDetails, hotPutBlob } from './lib/hotstore.mjs'

const CLAN_TAG = 'CYN'

// ── Duplicated from src/lib/clanScore.ts - keep both in sync by hand if the
// formula ever changes. See that file's own comments for the full
// reasoning behind each piece. ──────────────────────────────────────────────

const TEAM_SIZE_PRESETS = { Duos: 2, Trios: 3, Quads: 4 }
const EXCLUDED_PLAYER_TEAMS = 'Humans Vs Nations'

function deriveNumTeams(playerTeams, totalPlayerCount) {
  if (!playerTeams || playerTeams === EXCLUDED_PLAYER_TEAMS) return null
  if (/^\d+$/.test(playerTeams)) return Number(playerTeams)
  const presetSize = TEAM_SIZE_PRESETS[playerTeams]
  if (presetSize && totalPlayerCount) return Math.max(1, Math.round(totalPlayerCount / presetSize))
  return null
}

function clanSessionScore({ totalPlayerCount, numTeams, clanPlayerCount, won }) {
  const avgTeamSize = totalPlayerCount / numTeams
  const clanMemberRatio = clanPlayerCount / avgTeamSize
  const difficulty = Math.max(1, Math.sqrt(numTeams - 1))
  return won ? clanMemberRatio * difficulty : clanMemberRatio / difficulty
}

// OpenFront's own docs.md: "A clan session is created any time a player
// with that clan tag is in a public team game" - one tagged player is
// enough. See src/lib/clanScore.ts's own comment on this constant for the
// full reasoning (confirmed directly against the live sessions endpoint,
// and against the live decayed leaderboard ratio once decay is modeled).
const MIN_CLAN_PLAYERS_PER_SESSION = 1

// Same 30-day half-life OpenFront's own live leaderboard decays by - see
// src/lib/clanScore.ts's own comment on this constant for the full
// reasoning. Applied to the running cumulative win/loss totals below (not
// to each game's own standalone `score`, which stays undecayed, matching
// how OpenFront's own "Clan stats" endpoint reports one session - "No
// decay is used" there).
const DECAY_HALF_LIFE_DAYS = 30
// The rolling window of OpenFront's clan leaderboard (its start and end are 90 days apart).
const WINDOW_DAYS = 90

function buildClanScoreLedger(games, now) {
  const sorted = [...games].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let cumWins = 0
  let cumLosses = 0
  const ledger = []
  for (const g of sorted) {
    const numTeams = g.numTeams ?? deriveNumTeams(g.playerTeams, g.totalPlayers)
    if (numTeams == null || g.clanPlayerCount < MIN_CLAN_PLAYERS_PER_SESSION) continue
    const score = clanSessionScore({ totalPlayerCount: g.totalPlayers, numTeams, clanPlayerCount: g.clanPlayerCount, won: g.won })
    const ageDays = (now.getTime() - new Date(g.start).getTime()) / 86_400_000
    const decayedScore = score * Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)
    // OpenFront's leaderboard only looks at its last 90 days: an older game is not part of the totals, so it has no ratio either.
    const inWindow = ageDays <= WINDOW_DAYS
    const ratioBefore = inWindow && cumLosses > 0 ? cumWins / cumLosses : null
    if (inWindow) {
      if (g.won) cumWins += decayedScore
      else cumLosses += decayedScore
    }
    const ratioAfter = inWindow && cumLosses > 0 ? cumWins / cumLosses : null
    ledger.push({
      gameId: g.gameId,
      playedAt: g.start,
      won: g.won,
      clanPlayerCount: g.clanPlayerCount,
      totalPlayerCount: g.totalPlayers,
      numTeams,
      score,
      cumWeightedWins: cumWins,
      cumWeightedLosses: cumLosses,
      ratioBefore,
      ratioAfter,
    })
  }
  return ledger
}

// ── end duplicated section ──────────────────────────────────────────────────



// ── OpenFront's clan sessions (GET /public/clan/:tag/sessions, one day per request) ─────────────────────────────────────────────────────
const SESSIONS_FROM = Date.parse('2026-07-01T00:00:00Z') // before the first [CYN] session on record
const DAY_MS = 86_400_000

async function fetchSessionsOfDay(dayStart) {
  const start = new Date(dayStart).toISOString()
  const end = new Date(dayStart + DAY_MS - 1).toISOString()
  const out = []
  for (let page = 1; ; page++) {
    let json = null
    for (let attempt = 1; attempt <= 3 && !json; attempt++) {
      const res = await fetch(`https://api.openfront.io/public/clan/${CLAN_TAG}/sessions?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=50&page=${page}`)
      if (res.ok) json = await res.json()
      else if (attempt === 3) throw new Error(`clan sessions ${start}: HTTP ${res.status}`)
      else await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
    for (const s of json.results ?? []) {
      if (s.clanTag !== CLAN_TAG || !s.gameId || !s.numTeams || !s.totalPlayerCount) continue
      out.push({ gameId: s.gameId, start: s.gameStart, clanPlayerCount: s.clanPlayerCount, numTeams: s.numTeams, totalPlayers: s.totalPlayerCount, won: !!s.hasWon })
    }
    if (page * 50 >= (json.total ?? 0)) return out
  }
}

// The sessions are kept in a document of their own: the first run reads every day since SESSIONS_FROM, every later run only the last
// two days on top of what is stored (any failed day aborts the run, so the stored copy is never half-updated).
async function loadClanSessions() {
  let stored = []
  try {
    const doc = await hotGetBlob('clan-sessions')
    const parsed = typeof doc === 'string' ? JSON.parse(doc) : doc
    if (Array.isArray(parsed)) stored = parsed
  } catch {
    stored = []
  }
  const byId = new Map(stored.map((s) => [s.gameId, s]))
  const newest = stored.reduce((m, s) => Math.max(m, Date.parse(s.start) || 0), 0)
  const firstDay = newest ? Math.floor((newest - 2 * DAY_MS) / DAY_MS) * DAY_MS : SESSIONS_FROM
  const days = []
  for (let t = Math.max(firstDay, SESSIONS_FROM); t <= Date.now(); t += DAY_MS) days.push(t)
  for (let i = 0; i < days.length; i += 5) {
    for (const list of await Promise.all(days.slice(i, i + 5).map(fetchSessionsOfDay))) for (const s of list) byId.set(s.gameId, s)
  }
  const all = [...byId.values()]
  await hotPutBlob('clan-sessions', JSON.stringify(all))
  return all
}

async function main() {
  if (!hotEnabled()) {
    console.error(JSON.stringify({ error: 'hot_store_not_configured', need: 'HOT_API_SECRET' }))
    process.exitCode = 1
    return
  }
  // All member game lists come from Cloudflare D1 (see scripts/lib/hotstore.mjs).
  const gamesRows = await hotGetAllMemberGames()

  // One entry per gameId (not per member) - clanPlayerCount is how many
  // DIFFERENT registered members' own cache includes this same gameId under
  // the CYN tag in Team mode, i.e. how many of them actually played it
  // together. `won`/`start`/`playerTeams`/`totalPlayers` are read from
  // whichever member's copy is seen first - all CYN players in the same
  // game share the same team (and therefore the same result), so any one
  // of them is representative.
  const byGameId = new Map()
  for (const row of gamesRows) {
    for (const g of row.games ?? []) {
      // rankedType === '2v2' exclusion: confirmed directly against
      // OpenFront's own real GET /public/clan/:tag/sessions endpoint - a
      // 2v2 ranked game has mode: 'Team' same as a regular team lobby, but
      // OpenFront's own backend does NOT count it as a clan session (3
      // known [CYN] 2v2 games checked by date window, none appeared).
      // Before this fix, 478 of 1384 rows (34.5%) in cyn_clan_score_ledger
      // were 2v2 games scored as if they counted - cleaned up below by the
      // post-upsert delete step, which removes anything no longer eligible
      // regardless of why.
      if (g.clanTag !== CLAN_TAG || g.mode !== 'Team' || g.rankedType === '2v2' || g.rankedType === 'clanwars' || g.result === 'incomplete') continue
      const existing = byGameId.get(g.gameId)
      if (existing) {
        existing.clanPlayerCount++
      } else {
        byGameId.set(g.gameId, {
          gameId: g.gameId,
          start: g.start,
          playerTeams: g.playerTeams,
          totalPlayers: g.totalPlayers,
          won: g.result === 'victory',
          clanPlayerCount: 1,
        })
      }
    }
  }

  // clanPlayerCount above only counts REGISTERED members - confirmed live as
  // a real undercount: a member who plays team games with an untagged-on-
  // this-site clanmate (same [CYN] tag in-game, never registered on
  // cynclan.com) still only showed clanPlayerCount=1 here, silently failing
  // MIN_CLAN_PLAYERS_PER_SESSION and leaving those games unscored entirely -
  // even though OpenFront's own formula only cares about the CLAN tag, not
  // whether someone happens to have an account on this site. Where a game's
  // full roster is already cached (cyn_game_detail_cache - refresh-details.mjs
  // queues every team win/loss for this unconditionally), the true count of
  // clan-tagged players in that roster replaces the registered-only guess;
  // a game whose detail isn't cached yet keeps the registered-only count as
  // a fallback rather than losing it entirely.
  const gameIds = [...byGameId.keys()]
  for (let i = 0; i < gameIds.length; i += 200) {
    const chunk = gameIds.slice(i, i + 200)
    const detailRows = [...(await hotGetDetails(chunk))].map(([game_id, detail]) => ({ game_id, detail }))
    for (const row of detailRows ?? []) {
      const trueCount = (row.detail?.players ?? []).filter((p) => p.clanTag === CLAN_TAG).length
      if (trueCount > 0) byGameId.get(row.game_id).clanPlayerCount = trueCount
    }
  }

  // OpenFront's own clan sessions are the truth for every game they list (the exact clan player count, team count and result - the member
  // lists undercount unregistered clanmates and also hold private lobbies, which OpenFront does not count at all). From SESSIONS_FROM on the
  // ledger is built from them alone; the member-list games only fill the time before that.
  const sessions = await loadClanSessions()
  const allGames = sessions.map((s) => ({
    gameId: s.gameId,
    start: s.start,
    playerTeams: null,
    totalPlayers: s.totalPlayers,
    numTeams: s.numTeams,
    clanPlayerCount: s.clanPlayerCount,
    won: s.won,
  }))
  for (const g of byGameId.values()) if (Date.parse(g.start) < SESSIONS_FROM) allGames.push(g)
  const ledger = buildClanScoreLedger(allGames, new Date())

  // The Worker serves /api/clan-ledger from this document in D1 (worker/clanLedger.js). It is written whole every run,
  // so a game that is no longer eligible disappears by itself.
  await hotPutBlob(
    'ledger',
    JSON.stringify(ledger.map((e) => ({ game_id: e.gameId, won: e.won, score: e.score, ratio_before: e.ratioBefore, ratio_after: e.ratioAfter }))),
  )

  console.log(
    JSON.stringify(
      {
        eligibleGamesConsidered: byGameId.size,
        ledgerEntriesWritten: ledger.length,
        latestRatio: ledger.length ? ledger[ledger.length - 1].ratioAfter : null,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('compute-clan-score-ledger failed:', err)
  process.exitCode = 1
})
