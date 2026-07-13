// ── CYN stats aggregation ───────────────────────────────────────────────────
// Golden rule (per the clan): ONLY games where the player actually used the CYN
// tag count. Every win here is filtered on the per-game clanTag, so wins played
// under no tag / another tag are never included.

import {
  fetchFfaLeaderboard,
  fetchGameDetail,
  fetchPlayerGames,
  fetchRankedMap,
  type GameDetail,
  type PlayerGame,
  type RankedEntry,
} from './openfront'
import { CLAN_TAG } from '../config'

export interface RosterInput {
  openfront_id: string
  in_game_name?: string
  timezone?: string
  discord_username?: string
}

export interface Bucket {
  wins: number
  losses: number
  points: number
}

export interface MemberStats {
  publicId: string
  name: string
  timezone?: string
  discord?: string
  // lifetime, CYN-tagged only
  ffaWins: number
  teamWins: number
  rankedWins: number
  allWins: number
  elo: number | null
  peakElo: number | null
  eloInTop100: boolean
  eloMonthDelta: number | null
  rank1v1: number | null // global 1v1 ladder position (top 100), for star badges
  ffaRank: number | null // global FFA (trackerfront) position (top 100), for ship badges
  speedrunSeconds: number | null // best verified Australia/solo/no-nations time
  bumpCount: number // self-reported Discord bumps (2h cooldown enforced)
  lastBumpAt: string | null
  // activity
  gamesLast30d: number
  lastGame: string | null
  clanGamesTotal: number
  // raw CYN games (for profile page + month archive)
  cynGames: PlayerGame[]
  // per-game detail (kills + gold/min) for this member, where fetched (recent games)
  detailByGame: Record<string, { kills: number; goldPerMin: number }>
}

export interface RosterResult {
  members: MemberStats[]
  coopByGame: Record<string, boolean>
  /** Start date of the OLDEST CYN game currently counted (coverage window). */
  oldestGame: string | null
  totals: {
    members: number
    ffaWins: number
    teamWins: number
    rankedWins: number
    allWins: number
    topElo: number | null
  }
}

// ── game classification ─────────────────────────────────────────────────────

const isCyn = (g: PlayerGame) => g.clanTag === CLAN_TAG && g.type !== 'Singleplayer'
const isVictory = (g: PlayerGame) => g.result === 'victory'
const isDefeat = (g: PlayerGame) => g.result === 'defeat'
export const isFfa = (g: PlayerGame) => g.mode === 'Free For All' && g.rankedType !== '1v1'
export const isTeam = (g: PlayerGame) => g.mode === 'Team'
export const is1v1 = (g: PlayerGame) => g.rankedType === '1v1'

export function monthKeyOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function within30d(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= 30 * 24 * 60 * 60 * 1000
}

// ── points ──────────────────────────────────────────────────────────────────
// FFA: 1 point per win; a run of 2+ consecutive wins (no defeat between) makes
//      every win in that run worth 2. Incomplete/abandoned games are ignored.
// Team: 1 point per win; 2 if another CYN-tagged player was in the game.

export function ffaBucket(games: PlayerGame[], monthKey: string): Bucket {
  const decided = games
    .filter((g) => isFfa(g) && monthKeyOf(g.start) === monthKey && (isVictory(g) || isDefeat(g)))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  let wins = 0
  let losses = 0
  let points = 0
  let run = 0
  const flush = () => {
    if (run > 0) points += run >= 2 ? run * 2 : 1
    run = 0
  }
  for (const g of decided) {
    if (isVictory(g)) {
      wins++
      run++
    } else {
      losses++
      flush()
    }
  }
  flush()
  return { wins, losses, points }
}

export function teamBucket(
  games: PlayerGame[],
  monthKey: string,
  coopByGame: Record<string, boolean>,
): Bucket {
  const inMonth = games.filter((g) => isTeam(g) && monthKeyOf(g.start) === monthKey)
  let wins = 0
  let losses = 0
  let points = 0
  for (const g of inMonth) {
    if (isVictory(g)) {
      wins++
      points += coopByGame[g.gameId] ? 2 : 1
    } else if (isDefeat(g)) {
      losses++
    }
  }
  return { wins, losses, points }
}

export function oneVoneBucket(games: PlayerGame[], monthKey: string): { wins: number; losses: number } {
  const inMonth = games.filter((g) => is1v1(g) && monthKeyOf(g.start) === monthKey)
  return {
    wins: inMonth.filter(isVictory).length,
    losses: inMonth.filter(isDefeat).length,
  }
}

// ── richer monthly rows (with kills/gold from game detail where available) ───

function wlRatio(wins: number, losses: number): number {
  return losses === 0 ? wins : Math.round((wins / losses) * 100) / 100
}

/** Longest run of consecutive FFA victories in the month (defeats break it). */
function highestFfaStreak(games: PlayerGame[], monthKey: string): number {
  const decided = games
    .filter((g) => isFfa(g) && monthKeyOf(g.start) === monthKey && (isVictory(g) || isDefeat(g)))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let best = 0
  let run = 0
  for (const g of decided) {
    if (isVictory(g)) {
      run++
      best = Math.max(best, run)
    } else run = 0
  }
  return best
}

export interface FfaRow {
  wins: number
  losses: number
  points: number
  winstreak: number
  wl: number
  avgKills: number | null // null = no game detail available
}

export interface TeamRow {
  wins: number
  losses: number
  points: number
  wl: number
  kills: number | null
  avgGold: number | null
}

export function ffaMonthly(m: MemberStats, monthKey: string): FfaRow {
  const b = ffaBucket(m.cynGames, monthKey)
  const inMonth = m.cynGames.filter((g) => isFfa(g) && monthKeyOf(g.start) === monthKey)
  const detailed = inMonth.filter((g) => m.detailByGame[g.gameId])
  const totalKills = detailed.reduce((s, g) => s + m.detailByGame[g.gameId].kills, 0)
  return {
    ...b,
    winstreak: highestFfaStreak(m.cynGames, monthKey),
    wl: wlRatio(b.wins, b.losses),
    avgKills: detailed.length ? Math.round((totalKills / detailed.length) * 10) / 10 : null,
  }
}

export function teamMonthly(m: MemberStats, monthKey: string, coop: Record<string, boolean>): TeamRow {
  const b = teamBucket(m.cynGames, monthKey, coop)
  const inMonth = m.cynGames.filter((g) => isTeam(g) && monthKeyOf(g.start) === monthKey)
  const detailed = inMonth.filter((g) => m.detailByGame[g.gameId])
  const kills = detailed.reduce((s, g) => s + m.detailByGame[g.gameId].kills, 0)
  const goldPerMinSum = detailed.reduce((s, g) => s + m.detailByGame[g.gameId].goldPerMin, 0)
  return {
    ...b,
    wl: wlRatio(b.wins, b.losses),
    kills: detailed.length ? kills : null,
    avgGold: detailed.length ? Math.round(goldPerMinSum / detailed.length) : null,
  }
}

/** Every month (newest first) that appears anywhere in the members' CYN games. */
export function availableMonths(members: MemberStats[]): string[] {
  const set = new Set<string>()
  for (const m of members) for (const g of m.cynGames) set.add(monthKeyOf(g.start))
  set.add(currentMonthKey())
  return [...set].sort().reverse()
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

// ── monthly elo snapshots (OpenFront has no elo history) ─────────────────────

function eloMonthDelta(publicId: string, currentElo: number | null): number | null {
  if (currentElo == null) return null
  const key = `of:elosnap:${currentMonthKey()}`
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

// ── build roster ─────────────────────────────────────────────────────────────

// Cap on full game-detail fetches per roster build (co-op + kills/gold). Details
// are cached, so coverage grows over time; kept bounded to respect rate limits.
const MAX_DETAIL_LOOKUPS = 140

export async function buildRoster(
  registered: RosterInput[],
  speedruns: Record<string, { seconds: number }> = {},
  bumps: Record<string, { bump_count: number; last_bump_at: string | null }> = {},
): Promise<RosterResult> {
  const [ranked, ffaLb] = await Promise.all([fetchRankedMap(), fetchFfaLeaderboard()])

  const raw = await Promise.all(
    registered
      .filter((r) => r.openfront_id)
      .map(async (r) => {
        const games = (await fetchPlayerGames(r.openfront_id)).filter(isCyn)
        return { input: r, games }
      }),
  )

  // Which games need a full detail fetch? Team victories (for co-op scoring) +
  // this month's FFA/Team games (for kills/gold). One detail serves both.
  const mk = currentMonthKey()
  const teamWinIds = new Set<string>()
  const wantDetail = new Set<string>()
  for (const { games } of raw) {
    for (const g of games) {
      if (isTeam(g) && isVictory(g)) {
        teamWinIds.add(g.gameId)
        wantDetail.add(g.gameId)
      }
      if (monthKeyOf(g.start) === mk && (isFfa(g) || isTeam(g))) wantDetail.add(g.gameId)
    }
  }
  const detailMap = new Map<string, GameDetail | null>()
  await Promise.all(
    [...wantDetail].slice(0, MAX_DETAIL_LOOKUPS).map(async (id) => {
      detailMap.set(id, await fetchGameDetail(id))
    }),
  )

  // Co-op = another CYN player in the same team-win game.
  const coopByGame: Record<string, boolean> = {}
  for (const id of teamWinIds) {
    const d = detailMap.get(id)
    if (d) coopByGame[id] = d.players.filter((p) => p.clanTag === CLAN_TAG).length >= 2
  }

  const members: MemberStats[] = raw.map(({ input, games }) => {
    const r: RankedEntry | undefined = ranked[input.openfront_id]
    const ffaWins = games.filter((g) => isFfa(g) && isVictory(g)).length
    const teamWins = games.filter((g) => isTeam(g) && isVictory(g)).length
    const rankedWins = games.filter((g) => is1v1(g) && isVictory(g)).length
    const elo = r?.elo ?? null
    const lastGame = games.reduce<string | null>(
      (acc, g) => (!acc || new Date(g.start) > new Date(acc) ? g.start : acc),
      null,
    )

    // Pull this member's kills + gold/min out of each fetched game detail
    // (match by the exact name they used in that game).
    const detailByGame: Record<string, { kills: number; goldPerMin: number }> = {}
    for (const g of games) {
      const d = detailMap.get(g.gameId)
      if (!d) continue
      const me =
        d.players.find((p) => p.username === g.username && p.clanTag === CLAN_TAG) ??
        d.players.find((p) => p.username === g.username)
      if (!me?.stats) continue
      const goldTotal = (me.stats.gold ?? []).reduce((s, x) => s + Number(x || 0), 0)
      const minutes = d.durationSeconds > 0 ? d.durationSeconds / 60 : 1
      detailByGame[g.gameId] = {
        kills: me.stats.kills?.length ?? 0,
        goldPerMin: goldTotal / minutes,
      }
    }

    return {
      publicId: input.openfront_id,
      name: input.in_game_name?.trim() || r?.username || games[0]?.username || input.openfront_id,
      timezone: input.timezone,
      discord: input.discord_username,
      ffaWins,
      teamWins,
      rankedWins,
      allWins: ffaWins + teamWins + rankedWins,
      elo,
      peakElo: r?.peakElo ?? null,
      eloInTop100: !!r,
      eloMonthDelta: eloMonthDelta(input.openfront_id, elo),
      rank1v1: r?.rank ?? null,
      ffaRank:
        ffaLb[input.in_game_name?.trim() ?? ''] ??
        (r?.username ? ffaLb[r.username] : undefined) ??
        (games[0]?.username ? ffaLb[games[0].username] : undefined) ??
        null,
      speedrunSeconds: speedruns[input.openfront_id]?.seconds ?? null,
      bumpCount: bumps[input.openfront_id]?.bump_count ?? 0,
      lastBumpAt: bumps[input.openfront_id]?.last_bump_at ?? null,
      gamesLast30d: games.filter((g) => within30d(g.start)).length,
      lastGame,
      clanGamesTotal: games.length,
      cynGames: games,
      detailByGame,
    }
  })

  members.sort((a, b) => b.allWins - a.allWins || (b.elo ?? -1) - (a.elo ?? -1))

  const totals = {
    members: members.length,
    ffaWins: members.reduce((s, m) => s + m.ffaWins, 0),
    teamWins: members.reduce((s, m) => s + m.teamWins, 0),
    rankedWins: members.reduce((s, m) => s + m.rankedWins, 0),
    allWins: members.reduce((s, m) => s + m.allWins, 0),
    topElo: members.reduce<number | null>((mx, m) => (m.elo != null && (mx == null || m.elo > mx) ? m.elo : mx), null),
  }

  // Oldest CYN game currently counted = the start of the coverage window.
  const oldestGame = members
    .flatMap((m) => m.cynGames.map((g) => g.start))
    .reduce<string | null>((acc, s) => (!acc || new Date(s) < new Date(acc) ? s : acc), null)

  return { members, coopByGame, oldestGame, totals }
}
