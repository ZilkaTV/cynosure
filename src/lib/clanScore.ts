// ── Clan Score (Win Score / Loss Score / Win-Loss Ratio) ────────────────────
// Reproduces OpenFront's own official clan-leaderboard weighting formula,
// documented in openfrontio/OpenFrontIO's docs/API.md (calculateScore) -
// confirmed against real numbers from the in-game "CLANS" leaderboard tab
// (https://api.openfront.io/public/clans/leaderboard): weightedWLRatio there
// is exactly weightedWins / weightedLosses (verified against multiple real
// rows, no extra smoothing), so no separate formula for the ratio itself is
// needed beyond this per-session score.
//
// That endpoint only ever returns the CURRENT rolling ~3-month total per
// clan (start/end/clanTag query params are silently ignored, confirmed
// directly) - it can't answer "how much did THIS one game change things",
// which is what this site needs for a per-game report. So instead of
// calling it, this reconstructs the same score from data already cached on
// this site (cyn_member_games_cache) and walks the clan's own full
// chronological history itself - see scripts/compute-clan-score-ledger.mjs,
// which builds cyn_clan_score_ledger from exactly these functions.
//
// One real gap versus OpenFront's own internal ledger: it counts EVERY
// CYN-tagged player in a game, including ones who never registered on this
// site; this can only count registered members (the only games this site
// has any record of at all). For a clan that requires registration to be
// taken seriously as a member, this should track the real number closely,
// but isn't guaranteed to match OpenFront's own total exactly.

import type { PlayerGame } from './openfront'
import { supabase } from './supabase'

export interface ClanScoreInput {
  totalPlayerCount: number
  numTeams: number
  clanPlayerCount: number
  won: boolean
}

/**
 * OpenFront's own documented formula (docs/API.md), decay=1 - a fixed,
 * unaging number for a specific past game, matching how the "Clan stats"
 * endpoint itself works ("No decay is used"), not the leaderboard's own
 * 30-day-half-life-decayed version (which shrinks the same game's
 * contribution over time - not what a per-game report should show).
 */
export function clanSessionScore({ totalPlayerCount, numTeams, clanPlayerCount, won }: ClanScoreInput): number {
  const avgTeamSize = totalPlayerCount / numTeams
  const clanMemberRatio = clanPlayerCount / avgTeamSize
  const difficulty = Math.max(1, Math.sqrt(numTeams - 1))
  return won ? clanMemberRatio * difficulty : clanMemberRatio / difficulty
}

// Fixed team-size presets OpenFront's own "auto-teams" lobby types use -
// confirmed against real cached games: numTeams for these isn't given
// directly (unlike a ranked 2v2 game, where playerTeams is already the
// literal team count "2"), so it has to be derived from how many humans
// were in the lobby divided into groups of this size.
const TEAM_SIZE_PRESETS: Record<string, number> = { Duos: 2, Trios: 3, Quads: 4 }

// A game's own clanTag field (not real player-vs-player teams) puts every
// human on one side against AI "nations" - the whole lobby is effectively a
// single giant stack, which the official formula was never meant to score
// (confirmed live: this string shows up as a real playerTeams value in
// cached Team-mode games).
const EXCLUDED_PLAYER_TEAMS = 'Humans Vs Nations'

/**
 * How many teams a game had, or null if it can't be determined (missing
 * data) or the game is explicitly excluded from clan scoring. playerTeams is
 * a string that's EITHER the literal team count as digits (e.g. "2", "63" -
 * confirmed on both ranked 2v2 games and large unranked lobbies) OR one of
 * the fixed size-preset names above, never both in the same game.
 */
export function deriveNumTeams(playerTeams: string | null, totalPlayerCount: number | null): number | null {
  if (!playerTeams || playerTeams === EXCLUDED_PLAYER_TEAMS) return null
  if (/^\d+$/.test(playerTeams)) return Number(playerTeams)
  const presetSize = TEAM_SIZE_PRESETS[playerTeams]
  if (presetSize && totalPlayerCount) return Math.max(1, Math.round(totalPlayerCount / presetSize))
  return null
}

/** Whether a game is eligible for clan scoring at all (Team mode, not Humans vs Nations, has a determinable team count). */
export function isClanScoreEligible(g: Pick<PlayerGame, 'mode' | 'playerTeams' | 'totalPlayers'>): boolean {
  return g.mode === 'Team' && deriveNumTeams(g.playerTeams, g.totalPlayers) != null && !!g.totalPlayers
}

export interface ClanScoreLedgerEntry {
  gameId: string
  playedAt: string
  won: boolean
  clanPlayerCount: number
  totalPlayerCount: number
  numTeams: number
  score: number
  cumWeightedWins: number
  cumWeightedLosses: number
  ratioBefore: number | null
  ratioAfter: number | null
}

/**
 * Walks a clan's full chronological history of eligible Team games, computing
 * each one's own score and the clan-wide weighted win/loss ratio immediately
 * before and after it. `games` must already be deduplicated by gameId (one
 * entry per game, not per member) with `clanPlayerCount` filled in - see
 * scripts/compute-clan-score-ledger.mjs for how that's built from
 * cyn_member_games_cache.
 */
// A clan only "plays as a clan" when at least 2 of its tagged players are on
// the same winning/losing side together - one member alone in a game is
// just that member's own individual result, not something the clan
// achieved together. Confirmed empirically, not just from OpenFront's own
// docs.md pseudocode (which shows the weighting formula for an
// already-created session but doesn't state this precondition): scoring
// only games with clanPlayerCount >= 2 against real, current in-game
// leaderboard numbers landed within ~1% on the win/loss ratio, while
// counting every single-member game too overshot it by ~30%.
const MIN_CLAN_PLAYERS_PER_SESSION = 2

export function buildClanScoreLedger(
  games: { gameId: string; start: string; playerTeams: string | null; totalPlayers: number; clanPlayerCount: number; won: boolean }[],
): ClanScoreLedgerEntry[] {
  const sorted = [...games].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let cumWins = 0
  let cumLosses = 0
  const ledger: ClanScoreLedgerEntry[] = []
  for (const g of sorted) {
    const numTeams = deriveNumTeams(g.playerTeams, g.totalPlayers)
    if (numTeams == null || g.clanPlayerCount < MIN_CLAN_PLAYERS_PER_SESSION) continue
    const score = clanSessionScore({
      totalPlayerCount: g.totalPlayers,
      numTeams,
      clanPlayerCount: g.clanPlayerCount,
      won: g.won,
    })
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

// ── Client-side reads (precomputed by scripts/compute-clan-score-ledger.mjs) ─

export interface ClanScoreRow {
  won: boolean
  score: number
  ratioBefore: number | null
  ratioAfter: number | null
}

interface ClanScoreLedgerDbRow {
  game_id: string
  won: boolean
  score: number
  ratio_before: number | null
  ratio_after: number | null
}

/**
 * Every requested game's precomputed Win Score/Loss Score/Ratio-before/after,
 * keyed by gameId. A gameId missing from the returned map just means that
 * game isn't in the ledger yet (not eligible, or the cron hasn't reached it
 * yet) - callers should treat that the same as "no clan score to show",
 * never as an error.
 */
export async function fetchClanScoreLedger(gameIds: string[]): Promise<Map<string, ClanScoreRow>> {
  const result = new Map<string, ClanScoreRow>()
  if (!supabase || gameIds.length === 0) return result
  const { data, error } = await supabase
    .from('cyn_clan_score_ledger')
    .select('game_id, won, score, ratio_before, ratio_after')
    .in('game_id', gameIds)
  if (error || !data) return result
  for (const row of data as ClanScoreLedgerDbRow[]) {
    result.set(row.game_id, { won: row.won, score: row.score, ratioBefore: row.ratio_before, ratioAfter: row.ratio_after })
  }
  return result
}

/** "+2.34" / "-0.87" - always signed, 2 decimal places. */
export function fmtScoreDelta(score: number, won: boolean): string {
  return `${won ? '+' : '-'}${score.toFixed(2)}`
}

/** "3.12 → 3.15" when both sides are known, "→ 3.15" for a clan's very first scored game (no "before" yet). */
export function fmtRatioChange(before: number | null, after: number | null): string | null {
  if (after == null) return null
  const afterStr = after.toFixed(2)
  return before == null ? `→ ${afterStr}` : `${before.toFixed(2)} → ${afterStr}`
}
