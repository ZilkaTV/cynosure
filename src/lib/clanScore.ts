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

import { deriveNumTeams, type PlayerGame, type GameDetail } from './openfront'
import { supabase } from './supabase'

export { deriveNumTeams }

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

// ── Live clan leaderboard entry (matches OpenFront's own in-game numbers) ──

export interface ClanLeaderboardEntry {
  games: number
  wins: number
  losses: number
  playerSessions: number
  weightedWins: number
  weightedLosses: number
  weightedWLRatio: number
}

interface RosterCacheClanRow {
  clan_leaderboard: ClanLeaderboardEntry | null
}

/**
 * [CYN]'s own row from OpenFront's public/clans/leaderboard, cached by
 * refresh-details.mjs - the LIVE, rolling-90-day/30-day-half-life-decayed
 * numbers exactly as OpenFront's own in-game "CLANS" leaderboard tab shows
 * them right now. Deliberately a different metric from the rest of this
 * file's per-game history (which is all-time and never decays, on purpose -
 * see buildClanScoreLedger's own comment) - this is the one place on the
 * site meant to match that live, ever-changing number exactly.
 */
export async function fetchClanLeaderboardEntry(): Promise<ClanLeaderboardEntry | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('cyn_roster_cache').select('clan_leaderboard').eq('id', 1).maybeSingle()
  if (error || !data) return null
  return (data as RosterCacheClanRow).clan_leaderboard
}

// ── Per-game score for OTHER clans in the same game (post-game report) ─────

export interface OtherClanScore {
  clanTag: string
  won: boolean
  score: number
}

/**
 * Every OTHER clan tag (not CLAN_TAG - that one gets its own ledger-backed
 * line with real history, see ClanScoreRow above) with at least
 * MIN_CLAN_PLAYERS_PER_SESSION players in this one game, and what THIS game
 * alone was worth to them - "how much did the other team(s) lose" for the
 * post-game report. No historical ratio for these (this site only tracks
 * [CLAN_TAG]'s own full game history), just this game's own session score,
 * computed straight from the already-fetched GameDetail - no extra fetch.
 * Same "same-tag players share a team" assumption the official leaderboard
 * itself relies on: whether a tag "won" is just whether any of its players'
 * clientIDs are among the winners.
 */
export function otherClanScoresForGame(detail: Pick<GameDetail, 'players' | 'winnerClientIds' | 'numTeams'>, excludeClanTag: string): OtherClanScore[] {
  if (detail.numTeams == null) return []
  const totalPlayerCount = detail.players.length
  const byTag = new Map<string, GameDetail['players']>()
  for (const p of detail.players) {
    if (!p.clanTag || p.clanTag === excludeClanTag) continue
    const arr = byTag.get(p.clanTag) ?? []
    arr.push(p)
    byTag.set(p.clanTag, arr)
  }
  const winnerSet = new Set(detail.winnerClientIds)
  const results: OtherClanScore[] = []
  for (const [clanTag, players] of byTag) {
    if (players.length < MIN_CLAN_PLAYERS_PER_SESSION) continue
    const won = players.some((p) => winnerSet.has(p.clientID))
    const score = clanSessionScore({ totalPlayerCount, numTeams: detail.numTeams, clanPlayerCount: players.length, won })
    results.push({ clanTag, won, score })
  }
  return results.sort((a, b) => b.score - a.score)
}
