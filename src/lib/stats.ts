// ── CYN stats aggregation ───────────────────────────────────────────────────
// Golden rule (per the clan): ONLY games where the player actually used the CYN
// tag count. Every win here is filtered on the per-game clanTag, so wins played
// under no tag / another tag are never included.

import {
  fetchGameClanTags,
  fetchPlayerGames,
  fetchRankedMap,
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
  // activity
  gamesLast30d: number
  lastGame: string | null
  clanGamesTotal: number
  // raw CYN games (for profile page + month archive)
  cynGames: PlayerGame[]
}

export interface RosterResult {
  members: MemberStats[]
  coopByGame: Record<string, boolean>
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

const MAX_COOP_LOOKUPS = 80

export async function buildRoster(registered: RosterInput[]): Promise<RosterResult> {
  const ranked = await fetchRankedMap()

  const raw = await Promise.all(
    registered
      .filter((r) => r.openfront_id)
      .map(async (r) => {
        const games = (await fetchPlayerGames(r.openfront_id)).filter(isCyn)
        return { input: r, games }
      }),
  )

  // Resolve team co-op: for each team victory, does the game contain another
  // CYN player? Cached per game id; capped so a cold load stays bounded.
  const teamWinIds = new Set<string>()
  for (const { games } of raw) {
    for (const g of games) if (isTeam(g) && isVictory(g)) teamWinIds.add(g.gameId)
  }
  const coopByGame: Record<string, boolean> = {}
  const ids = [...teamWinIds].slice(0, MAX_COOP_LOOKUPS)
  await Promise.all(
    ids.map(async (gameId) => {
      const tags = await fetchGameClanTags(gameId)
      coopByGame[gameId] = tags.filter((t) => t === CLAN_TAG).length >= 2
    }),
  )

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
      gamesLast30d: games.filter((g) => within30d(g.start)).length,
      lastGame,
      clanGamesTotal: games.length,
      cynGames: games,
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

  return { members, coopByGame, totals }
}
