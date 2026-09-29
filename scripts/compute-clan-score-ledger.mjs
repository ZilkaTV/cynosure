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

import { createClient } from '@supabase/supabase-js'

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

function buildClanScoreLedger(games, now) {
  const sorted = [...games].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let cumWins = 0
  let cumLosses = 0
  const ledger = []
  for (const g of sorted) {
    const numTeams = deriveNumTeams(g.playerTeams, g.totalPlayers)
    if (numTeams == null || g.clanPlayerCount < MIN_CLAN_PLAYERS_PER_SESSION) continue
    const score = clanSessionScore({ totalPlayerCount: g.totalPlayers, numTeams, clanPlayerCount: g.clanPlayerCount, won: g.won })
    const ageDays = (now.getTime() - new Date(g.start).getTime()) / 86_400_000
    const decayedScore = score * Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)
    const ratioBefore = cumLosses > 0 ? cumWins / cumLosses : null
    if (g.won) cumWins += decayedScore
    else cumLosses += decayedScore
    const ratioAfter = cumLosses > 0 ? cumWins / cumLosses : null
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

const UPSERT_BATCH_SIZE = 500

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error(JSON.stringify({ error: 'supabase_not_configured' }))
    process.exitCode = 1
    return
  }
  const supabase = createClient(url, key)

  // Confirmed live: this exact query (identical URL every run - no filters,
  // no pagination) kept returning a byte-identical, hours-stale response
  // when called from GitHub Actions - the same script run locally with the
  // same credentials always saw current data. Supabase's REST endpoint sits
  // behind Cloudflare (visible in its own response headers), and GitHub
  // Actions runner IPs are well-known datacenter ranges Cloudflare's bot
  // heuristics are especially likely to flag - plausibly serving those
  // requests a cached/degraded response instead of hitting Postgres fresh
  // each time, the same class of problem already confirmed for OpenFront's
  // own Cloudflare-fronted API elsewhere in this repo (see fetchRankedMap's
  // own comment). A harmless, always-true filter keyed to the current
  // second makes the request URL genuinely different every run, defeating
  // any exact-URL cache without changing which rows come back.
  const { data: gamesRows, error } = await supabase
    .from('cyn_member_games_cache')
    .select('games')
    .gte('updated_at', '1970-01-01T00:00:00Z')
    .lte('updated_at', new Date(Date.now() + 86_400_000).toISOString())
  if (error) throw error

  // One entry per gameId (not per member) - clanPlayerCount is how many
  // DIFFERENT registered members' own cache includes this same gameId under
  // the CYN tag in Team mode, i.e. how many of them actually played it
  // together. `won`/`start`/`playerTeams`/`totalPlayers` are read from
  // whichever member's copy is seen first - all CYN players in the same
  // game share the same team (and therefore the same result), so any one
  // of them is representative.
  const byGameId = new Map()
  for (const row of gamesRows ?? []) {
    for (const g of row.games ?? []) {
      if (g.clanTag !== CLAN_TAG || g.mode !== 'Team' || g.result === 'incomplete') continue
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
    const { data: detailRows, error: detailError } = await supabase
      .from('cyn_game_detail_cache')
      .select('game_id, detail')
      .in('game_id', chunk)
    if (detailError) throw detailError
    for (const row of detailRows ?? []) {
      const trueCount = (row.detail?.players ?? []).filter((p) => p.clanTag === CLAN_TAG).length
      if (trueCount > 0) byGameId.get(row.game_id).clanPlayerCount = trueCount
    }
  }

  const allGames = [...byGameId.values()]
  const ledger = buildClanScoreLedger(allGames, new Date())

  let written = 0
  for (let i = 0; i < ledger.length; i += UPSERT_BATCH_SIZE) {
    const batch = ledger.slice(i, i + UPSERT_BATCH_SIZE).map((e) => ({
      game_id: e.gameId,
      played_at: e.playedAt,
      won: e.won,
      clan_player_count: e.clanPlayerCount,
      total_player_count: e.totalPlayerCount,
      num_teams: e.numTeams,
      score: e.score,
      cum_weighted_wins: e.cumWeightedWins,
      cum_weighted_losses: e.cumWeightedLosses,
      ratio_before: e.ratioBefore,
      ratio_after: e.ratioAfter,
    }))
    const { error: upsertError } = await supabase.from('cyn_clan_score_ledger').upsert(batch, { onConflict: 'game_id' })
    if (upsertError) throw upsertError
    written += batch.length
  }

  console.log(
    JSON.stringify(
      {
        eligibleGamesConsidered: byGameId.size,
        ledgerEntriesWritten: written,
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
