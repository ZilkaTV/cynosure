// ── CYN stats aggregation ───────────────────────────────────────────────────
// Turns raw OpenFront data into the numbers the tables show. The golden rule
// (per the clan's request): ONLY games where the player used the CYN tag count.

import { CLAN_TAG, EXTRA_MEMBER_IDS } from '../config'
import {
  fetchCynRanked,
  fetchPlayerGames,
  type PlayerGame,
  type RankedEntry,
} from './openfront'

export interface RosterInput {
  /** OpenFront public id of a registered member. */
  openfront_id: string
  /** Their chosen in-game name (used instead of the API username when present). */
  in_game_name?: string
  timezone?: string
}

export interface MemberStats {
  publicId: string
  name: string
  timezone?: string
  registered: boolean
  // lifetime, CYN-tagged only
  ffaWins: number
  teamWins: number
  rankedWins: number
  allWins: number
  elo: number | null
  peakElo: number | null
  eloMonthDelta: number | null
  // this calendar month, CYN-tagged only
  monthlyFfaWins: number
  monthlyTeamWins: number
  monthly1v1Wins: number
  // activity
  lastGame: string | null
  gamesLast30d: number
  clanGamesTotal: number
}

export interface RosterResult {
  members: MemberStats[]
  totals: {
    members: number
    ffaWins: number
    teamWins: number
    rankedWins: number
    allWins: number
    topElo: number | null
    activeLast30d: number
  }
}

const isCyn = (g: PlayerGame) => g.clanTag === CLAN_TAG && g.type !== 'Singleplayer'
const isVictory = (g: PlayerGame) => g.result === 'victory'
const isFfa = (g: PlayerGame) => g.mode === 'Free For All' && g.rankedType !== '1v1'
const isTeam = (g: PlayerGame) => g.mode === 'Team'
const is1v1 = (g: PlayerGame) => g.rankedType === '1v1'

function monthStart(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
}

function within30d(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= 30 * 24 * 60 * 60 * 1000
}

// ── monthly elo delta via lightweight client snapshots ──────────────────────
// OpenFront doesn't expose historical elo, so we remember the earliest elo we
// observe for each member in the current month and report the change since.
// It starts accruing the first time the site is opened in a given month.

function monthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function eloMonthDelta(publicId: string, currentElo: number | null): number | null {
  if (currentElo == null) return null
  const key = `of:elosnap:${monthKey()}`
  let snap: Record<string, number> = {}
  try {
    snap = JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    snap = {}
  }
  if (snap[publicId] == null) {
    snap[publicId] = currentElo
    try {
      localStorage.setItem(key, JSON.stringify(snap))
    } catch {
      /* ignore */
    }
    return 0
  }
  return currentElo - snap[publicId]
}

function computeMember(
  publicId: string,
  input: RosterInput | undefined,
  ranked: RankedEntry | undefined,
  games: PlayerGame[],
): MemberStats {
  const cynGames = games.filter(isCyn)
  const ms = monthStart()

  const ffaWins = cynGames.filter((g) => isFfa(g) && isVictory(g)).length
  const teamWins = cynGames.filter((g) => isTeam(g) && isVictory(g)).length
  // 1v1 ranked wins come from the ranked ladder (the authoritative per-player
  // record OpenFront itself shows); ranked games aren't reliably tagged in the
  // public history. Non-ranked members fall back to their tagged 1v1 wins.
  const rankedWins = ranked ? ranked.wins : cynGames.filter((g) => is1v1(g) && isVictory(g)).length
  // All Wins = the sum of the three columns, so the row is internally consistent
  // (never "All < Ranked").
  const allWins = ffaWins + teamWins + rankedWins

  const monthGames = cynGames.filter((g) => new Date(g.start).getTime() >= ms)
  const lastGame = cynGames.reduce<string | null>(
    (acc, g) => (!acc || new Date(g.start) > new Date(acc) ? g.start : acc),
    null,
  )

  const elo = ranked?.elo ?? null

  const name =
    input?.in_game_name?.trim() ||
    ranked?.username ||
    cynGames[0]?.username ||
    games[0]?.username ||
    publicId

  return {
    publicId,
    name,
    timezone: input?.timezone,
    registered: !!input,
    ffaWins,
    teamWins,
    rankedWins,
    allWins,
    elo,
    peakElo: ranked?.peakElo ?? null,
    eloMonthDelta: eloMonthDelta(publicId, elo),
    monthlyFfaWins: monthGames.filter((g) => isFfa(g) && isVictory(g)).length,
    monthlyTeamWins: monthGames.filter((g) => isTeam(g) && isVictory(g)).length,
    monthly1v1Wins: monthGames.filter((g) => is1v1(g) && isVictory(g)).length,
    lastGame,
    gamesLast30d: cynGames.filter((g) => within30d(g.start)).length,
    clanGamesTotal: cynGames.length,
  }
}

/**
 * Build the full CYN roster + totals. `registered` is the list of members that
 * signed up through the site (may be empty — ranked players are still
 * auto-discovered from the leaderboard).
 */
export async function buildRoster(registered: RosterInput[] = []): Promise<RosterResult> {
  const ranked = await fetchCynRanked()

  // Union of every id we know about: leaderboard + configured extras + sign-ups.
  const inputById = new Map<string, RosterInput>()
  for (const r of registered) if (r.openfront_id) inputById.set(r.openfront_id, r)

  const ids = new Set<string>([
    ...Object.keys(ranked),
    ...EXTRA_MEMBER_IDS,
    ...inputById.keys(),
  ])

  const members = await Promise.all(
    [...ids].map(async (id) => {
      const games = await fetchPlayerGames(id)
      return computeMember(id, inputById.get(id), ranked[id], games)
    }),
  )

  members.sort((a, b) => (b.elo ?? -1) - (a.elo ?? -1) || b.allWins - a.allWins)

  const totals = {
    members: members.length,
    ffaWins: members.reduce((s, m) => s + m.ffaWins, 0),
    teamWins: members.reduce((s, m) => s + m.teamWins, 0),
    rankedWins: members.reduce((s, m) => s + m.rankedWins, 0),
    allWins: members.reduce((s, m) => s + m.allWins, 0),
    topElo: members.reduce<number | null>((max, m) => (m.elo != null && (max == null || m.elo > max) ? m.elo : max), null),
    activeLast30d: members.filter((m) => m.gamesLast30d > 0).length,
  }

  return { members, totals }
}
