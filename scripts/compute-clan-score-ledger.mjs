#!/usr/bin/env node
// Rebuilds cyn_clan_score_ledger (see supabase/schema.sql) in full every
// run: OpenFront's own official clan-leaderboard weighting formula (from
// openfrontio/OpenFrontIO's docs/API.md), applied to every eligible Team
// game any registered [CYN] member has ever played, walked chronologically
// so each game also gets the clan's own cumulative weighted win/loss ratio
// immediately before and after it - not just that one game's own score.
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

// A clan only "plays as a clan" when at least 2 tagged players are on the
// same side together - confirmed empirically against real in-game
// leaderboard numbers (see clanScore.ts's own comment on this constant for
// the full reasoning), not stated in OpenFront's docs.md pseudocode itself.
const MIN_CLAN_PLAYERS_PER_SESSION = 2

function buildClanScoreLedger(games) {
  const sorted = [...games].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let cumWins = 0
  let cumLosses = 0
  const ledger = []
  for (const g of sorted) {
    const numTeams = deriveNumTeams(g.playerTeams, g.totalPlayers)
    if (numTeams == null || g.clanPlayerCount < MIN_CLAN_PLAYERS_PER_SESSION) continue
    const score = clanSessionScore({ totalPlayerCount: g.totalPlayers, numTeams, clanPlayerCount: g.clanPlayerCount, won: g.won })
    const ratioBefore = cumLosses > 0 ? cumWins / cumLosses : null
    if (g.won) cumWins += score
    else cumLosses += score
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

  const { data: gamesRows, error } = await supabase.from('cyn_member_games_cache').select('games')
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

  const ledger = buildClanScoreLedger([...byGameId.values()])

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
