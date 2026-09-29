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
// OpenFront's own docs.md is explicit: "A clan session is created any time
// a player with that clan tag is in a public team game" - a single tagged
// player is enough. Confirmed directly against the live, previously-unused
// GET /public/clan/:tag/sessions endpoint: a real solo [CYN] game
// (clanPlayerCount 1) comes back from OpenFront itself with its own nonzero
// score, same as any other session. A prior, flawed comparison here claimed
// requiring >=2 matched the live leaderboard ratio better - that comparison
// forgot the live ratio is 30-day-half-life DECAYED (see
// forecastWinScoreLoss's own comment); once the same decay is applied to
// this side of the comparison, >=1 lands far closer to OpenFront's live
// ratio (~15.4 vs live 16.83) than >=2 does (~22.7 vs 16.83). So a single
// tagged player is enough - no minimum beyond "the session exists at all".
const MIN_CLAN_PLAYERS_PER_SESSION = 1

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
  clan_leaderboard_top: TopClanEntry[] | null
}

/** One row of the top-N clans overall (see fetchTopClanLeaderboard) - the same shape as ClanLeaderboardEntry, plus which clan it is. */
export interface TopClanEntry extends ClanLeaderboardEntry {
  clanTag: string
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

/**
 * Top 20 clans overall (by Win Score / weightedWins, same ranking as
 * OpenFront's own in-game "CLANS" tab), from the same cached snapshot as
 * fetchClanLeaderboardEntry - feeds the Win Score decay forecast panel.
 */
export async function fetchTopClanLeaderboard(): Promise<TopClanEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('cyn_roster_cache').select('clan_leaderboard_top').eq('id', 1).maybeSingle()
  if (error || !data) return []
  return (data as RosterCacheClanRow).clan_leaderboard_top ?? []
}

// ── Win Score decay forecast (no new games assumed) ─────────────────────────

/**
 * Half-life (days) OpenFront's own live clan leaderboard decays every
 * game's weighted contribution by - see docs/API.md's own description,
 * duplicated from the formula already used in clanSessionScore's own
 * comment above. A clan's Win Score (weightedWins) and Loss Score
 * (weightedLosses) are each just a sum of every past game's own
 * independently-decaying term - since every term shares the SAME decay
 * constant, calculus says the SUM decays at that identical constant rate
 * too, regardless of how old any individual game already is (this is why
 * projecting forward needs only today's total, not per-game history we
 * don't have for other clans in the first place).
 */
const DECAY_HALF_LIFE_DAYS = 30

/**
 * How many Win Score (or Loss Score) points a clan is on track to lose
 * over the next `days`, assuming they play NO further clan-tagged Team
 * games in that window - pure exponential decay of today's total, nothing
 * projected about new games. Note the Win/Loss RATIO itself does NOT move
 * from decay alone (wins and losses shrink by the exact same proportion),
 * so this is a forecast of the raw score dropping, not of rank/ratio
 * necessarily changing - a clan that keeps playing at its current rate
 * would offset some or all of this.
 */
export function forecastWinScoreLoss(currentScore: number, days: number): number {
  const remaining = currentScore * Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS)
  return currentScore - remaining
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
