import { useEffect, useState } from 'react'
import { CLAN_TAG } from '../config'
import { useProfile } from './useProfile'
import { useIsAdmin } from './useSession'
import { useIsInnerCircle } from './metrics'
import { fetchBoosters } from './chat'
import { loadPersistedRoster } from './rosterCache'
import { loadRosterShared } from './useRoster'
import { fetchRecentPlayerGames } from './openfront'
import { isFfa, isTeam, is1v1, is2v2, type MemberStats, type RosterResult } from './stats'
import type { PlayerGame } from './openfront'

/** Days a member keeps access after their last qualifying win. */
export const ACCESS_DAYS = 7
/** All-time wins for the Gold Legionnaire rank (WINS_TIERS in badges.ts): permanent access. */
export const GOLD_LEGIONNAIRE_WINS = 250
const DAY = 86_400_000

export type PermanentReason = 'booster' | 'gold' | 'supporter' | 'staff'

export interface Access {
  /** loading: roster not read yet (never blocks); guest: not registered (the pages' own gate handles that). */
  status: 'loading' | 'guest' | 'ok' | 'permanent' | 'expired'
  permanentReason?: PermanentReason
  /** Whole days left (rounded up), null when permanent / unknown. */
  daysLeft: number | null
  lastWinAt: number | null
  expiresAt: number | null
}

/**
 * A win that keeps the access alive (all counted games already carry the [CYN] tag):
 * - a win in ranked 1v1, 2v2 or FFA, or
 * - a win in a public FFA with more than 10 players, or
 * - a win in a team game with at least two [CYN] members in it.
 */
export function isQualifyingWin(g: PlayerGame, cynPlayers: number, coop: boolean): boolean {
  if (g.result !== 'victory') return false
  if (is1v1(g) || is2v2(g) || g.rankedType === 'ffa') return true
  if (isFfa(g)) return g.type === 'Public' && (g.totalPlayers ?? 0) > 10
  if (isTeam(g)) return coop || cynPlayers >= 2
  return false
}

/**
 * The latest qualifying win in a plain list of games (end time in ms), null if there is none. Team games count only with a second [CYN] member, which a
 * single list does not tell: they are left to the roster.
 */
export function lastWinInGames(games: PlayerGame[]): number | null {
  let last: number | null = null
  for (const g of games) {
    if (g.clanTag !== CLAN_TAG || !isQualifyingWin(g, 1, false)) continue
    const at = new Date(g.start).getTime() + (g.durationSeconds ?? 0) * 1000
    if (!Number.isNaN(at) && (last == null || at > last)) last = at
  }
  return last
}

/** Start time (ms) of the member's latest qualifying win, null if there is none. */
export function lastQualifyingWin(member: MemberStats, members: MemberStats[], coopByGame: Record<string, boolean>): number | null {
  // How many registered [CYN] members were in each game (the game lists of the members tell it, even without a game report).
  const players = new Map<string, number>()
  for (const m of members) for (const g of new Set(m.cynGames.map((x) => x.gameId))) players.set(g, (players.get(g) ?? 0) + 1)
  let last: number | null = null
  for (const g of member.cynGames) {
    if (g.clanTag !== CLAN_TAG || !isQualifyingWin(g, players.get(g.gameId) ?? 1, !!coopByGame[g.gameId])) continue
    const at = new Date(g.start).getTime() + (g.durationSeconds ?? 0) * 1000
    if (!Number.isNaN(at) && (last == null || at > last)) last = at
  }
  return last
}

export function computeAccess(
  member: MemberStats | undefined,
  roster: RosterResult,
  extra: { booster: boolean; staff: boolean; /** a win found by asking OpenFront directly (the member's games are not in the shared lists yet) */ liveWinAt?: number | null },
  now = Date.now(),
): Access {
  if (!member) return { status: 'guest', daysLeft: null, lastWinAt: null, expiresAt: null }
  const permanentReason: PermanentReason | undefined = extra.booster
    ? 'booster'
    : member.allWins >= GOLD_LEGIONNAIRE_WINS
      ? 'gold'
      : member.isSupporter
        ? 'supporter'
        : extra.staff
          ? 'staff'
          : undefined
  const fromRoster = lastQualifyingWin(member, roster.members, roster.coopByGame)
  const lastWinAt = extra.liveWinAt != null && (fromRoster == null || extra.liveWinAt > fromRoster) ? extra.liveWinAt : fromRoster
  if (permanentReason) return { status: 'permanent', permanentReason, daysLeft: null, lastWinAt, expiresAt: null }
  const expiresAt = lastWinAt == null ? null : lastWinAt + ACCESS_DAYS * DAY
  if (expiresAt == null || expiresAt <= now) return { status: 'expired', daysLeft: 0, lastWinAt, expiresAt }
  return { status: 'ok', daysLeft: Math.ceil((expiresAt - now) / DAY), lastWinAt, expiresAt }
}

// One roster read and one booster list for the whole page, shared by every component that asks (the account menu and the gate).
let shared: { roster: RosterResult | null; boosters: Set<string>; at: number } | null = null
let inflight: Promise<void> | null = null
// members whose games were asked from OpenFront directly in this page session (see useAccess)
const liveChecked = new Set<string>()
const liveWins = new Map<string, number | null>()
const listeners = new Set<() => void>()

async function refreshShared() {
  if (inflight) return inflight
  inflight = (async () => {
    // The stored copy of the last roster answers at once; the fresh one replaces it when it arrives.
    if (!shared?.roster) {
      const cached = await loadPersistedRoster()
      if (cached) {
        shared = { roster: cached, boosters: shared?.boosters ?? new Set(), at: Date.now() }
        listeners.forEach((l) => l())
      }
    }
    const [roster, boosters] = await Promise.all([loadRosterShared().catch(() => null), fetchBoosters().catch(() => [] as string[])])
    shared = { roster: roster ?? shared?.roster ?? null, boosters: new Set(boosters), at: Date.now() }
    listeners.forEach((l) => l())
  })().finally(() => {
    inflight = null
  })
  return inflight
}

/** The roster that is shared on the page (one read for the access check and the clan window); null until it is there. */
export function useSharedRoster(): RosterResult | null {
  const { profile } = useProfile()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!profile) return
    const on = () => tick((n) => n + 1)
    listeners.add(on)
    if (!shared || Date.now() - shared.at > 10 * 60_000) refreshShared()
    return () => {
      listeners.delete(on)
    }
  }, [profile])
  return shared?.roster ?? null
}

/** Access state of the signed-in member (the 7-day rule); never blocks while the data is still loading. */
export function useAccess(): Access {
  const { profile } = useProfile()
  const isAdmin = useIsAdmin()
  const isInnerCircle = useIsInnerCircle()
  const [, tick] = useState(0)
  // Somebody who registered after their games: the scheduled job has no game list for them yet (it can take half an hour), and "no win found" would
  // lock them out. Their newest games are asked from OpenFront directly, once.
  const myId = profile?.openfront_id
  const noGameList = !!shared?.roster && !!myId && (shared.roster.members.find((m) => m.publicId === myId)?.cynGames.length ?? 0) === 0
  useEffect(() => {
    if (!myId || !noGameList || liveChecked.has(myId)) return
    liveChecked.add(myId)
    fetchRecentPlayerGames(myId)
      .then((games) => {
        liveWins.set(myId, lastWinInGames(games))
        listeners.forEach((l) => l()) // every component that asks for the access state looks again
      })
      .catch(() => {
        liveWins.set(myId, null) // asking failed: the roster's own answer stands
        listeners.forEach((l) => l())
      })
  }, [myId, noGameList])

  useEffect(() => {
    if (!profile) return
    const on = () => tick((n) => n + 1)
    listeners.add(on)
    if (!shared || Date.now() - shared.at > 10 * 60_000) refreshShared()
    const timer = setInterval(() => refreshShared(), 10 * 60_000)
    return () => {
      listeners.delete(on)
      clearInterval(timer)
    }
  }, [profile])

  if (!profile) return { status: 'guest', daysLeft: null, lastWinAt: null, expiresAt: null }
  if (!shared?.roster) return { status: 'loading', daysLeft: null, lastWinAt: null, expiresAt: null }
  const member = shared.roster.members.find((m) => m.publicId === profile.openfront_id)
  // while OpenFront is asked directly, the answer is "loading" (which never blocks), not a flash of the lock screen
  if (noGameList && !liveWins.has(profile.openfront_id)) return { status: 'loading', daysLeft: null, lastWinAt: null, expiresAt: null }
  return computeAccess(member, shared.roster, { booster: shared.boosters.has(profile.openfront_id), staff: isAdmin || isInnerCircle, liveWinAt: noGameList ? (liveWins.get(profile.openfront_id) ?? null) : null })
}
