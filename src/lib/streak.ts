// ── Clan-wide play streak ───────────────────────────────────────────────────
// Research-backed retention pattern (Duolingo/Strava-style streaks: a 7-day
// streak correlates with ~3.6x higher habit retention) applied at the CLAN
// level instead of per-member - a "Friend Streak" for the whole roster,
// since this site is clan-oriented, not single-player. Counts consecutive
// calendar days (UTC) with at least one clan-tagged, score-eligible Team
// game, computed straight from data already loaded for the Home page
// (`cyn_member_games_cache` "only ever grows" - see memberGames.js's own
// comment - so a member's `cynGames` is their FULL history, not a capped
// recent window). No new table, no new backend call.

import { isClanScoreEligible } from './clanScore'
import type { PlayerGame } from './openfront'

export interface ClanStreak {
  currentDays: number
  longestDays: number
  // Whether today (UTC) already has a qualifying game - purely informational
  // for the UI ("today still counts" vs "today's not played yet").
  playedToday: boolean
}

type StreakGame = Pick<PlayerGame, 'start' | 'mode' | 'playerTeams' | 'totalPlayers' | 'type' | 'rankedType'>

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function addDays(dayStr: string, n: number): string {
  const d = new Date(`${dayStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Dedupe games by gameId first if calling with per-member lists merged across the roster - see Home.tsx's own byGameId map for the same dedupe need. */
export function computeClanStreak(games: StreakGame[], now: Date = new Date()): ClanStreak {
  const days = new Set<string>()
  for (const g of games) {
    if (g.type === 'Private') continue
    if (!isClanScoreEligible(g)) continue
    days.add(dayKey(g.start))
  }

  const today = now.toISOString().slice(0, 10)
  const playedToday = days.has(today)

  // Current streak: walk backwards from today (or yesterday, if today has no
  // game yet - a quiet day-so-far shouldn't look like a broken streak before
  // the day is even over).
  let cursor = playedToday ? today : addDays(today, -1)
  let currentDays = 0
  while (days.has(cursor)) {
    currentDays++
    cursor = addDays(cursor, -1)
  }

  // Longest streak ever, over the whole history we have.
  const sorted = [...days].sort()
  let longestDays = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    run = prev != null && addDays(prev, 1) === d ? run + 1 : 1
    longestDays = Math.max(longestDays, run)
    prev = d
  }

  return { currentDays, longestDays, playedToday }
}
