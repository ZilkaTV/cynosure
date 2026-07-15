// ── Badges ───────────────────────────────────────────────────────────────────
// Three groups:
//  • rank      - 1v1 star & FFA ship, tiered by global ladder position (upgrade
//                badges: only the best tier shows). Lost if you drop out.
//  • milestone - permanent once earned (Good/God Player, Loyal Player).
//  • monthly   - this month's category leaders; lost next month if overtaken.
// Most Wins is a "limited" badge (held by the current roster leader).

import { currentMonthKey, ffaMonthly, teamMonthly, type MemberStats } from './stats'
import { levelFromXp, titleForLevel } from './levels'
import { fmtTime } from './speedruns'
import type { TranslationShape } from '../i18n/translations'

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond'

export type IconKey =
  | 'trophy'
  | 'medal'
  | 'crown'
  | 'flame'
  | 'bell'
  | 'bow'
  | 'bolt'
  | 'pickaxe'
  | 'anchor'
  | 'blast'
  | 'wrench'
  | 'flag'

export interface Badge {
  id: string
  name: string
  kind: 'star' | 'ship' | 'icon' | 'level'
  icon?: IconKey
  tier?: BadgeTier
  level?: number
  earned: boolean
  desc: string
  group: 'rank' | 'milestone' | 'monthly'
}

const LOYAL_THRESHOLD = 7

/** Rank → badge tier (top 3/10/50/100). null = outside the top 100. */
function tierFromRank(rank: number | null): BadgeTier | null {
  if (rank == null) return null
  if (rank <= 3) return 'diamond'
  if (rank <= 10) return 'gold'
  if (rank <= 50) return 'silver'
  if (rank <= 100) return 'bronze'
  return null
}

/** Tier -> the top-N cutoff, for short badge labels like "Top 50". */
function tierLimit(tier: BadgeTier): number {
  return { diamond: 3, gold: 10, silver: 50, bronze: 100 }[tier]
}

/** Consecutive days (ending on the latest win-day) with at least one CYN win. */
export function loyalStreak(m: MemberStats): number {
  const days = new Set(
    m.cynGames.filter((g) => g.result === 'victory').map((g) => g.start.slice(0, 10)),
  )
  if (days.size === 0) return 0
  const sorted = [...days].sort().reverse() // newest first
  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00Z')
    const cur = new Date(sorted[i] + 'T00:00:00Z')
    const diffDays = (prev.getTime() - cur.getTime()) / 86_400_000
    if (diffDays === 1) streak++
    else break
  }
  return streak
}

/** Leader (publicId + their value) of a numeric metric among members, if any value > 0. */
function leader(members: MemberStats[], value: (m: MemberStats) => number): { id: string; v: number } | null {
  let best: { id: string; v: number } | null = null
  for (const m of members) {
    const v = value(m)
    if (v > 0 && (!best || v > best.v)) best = { id: m.publicId, v }
  }
  return best
}

/** Member holding the single fastest (lowest) speedrun time clan-wide, if any. */
function fastestSpeedrunner(members: MemberStats[]): { id: string; v: number } | null {
  let best: { id: string; v: number } | null = null
  for (const m of members) {
    if (m.speedrunSeconds != null && (!best || m.speedrunSeconds < best.v)) best = { id: m.publicId, v: m.speedrunSeconds }
  }
  return best
}

export function computeBadges(m: MemberStats, all: MemberStats[], t: TranslationShape): Badge[] {
  const mk = currentMonthKey()
  const ffa = (x: MemberStats) => ffaMonthly(x, mk)
  const team = (x: MemberStats) => teamMonthly(x, mk, {})
  const b = t.badges

  const mostWins = leader(all, (x) => x.allWins)
  const predator = leader(all, (x) => ffa(x).avgKills ?? 0)
  const pro = leader(all, (x) => ffa(x).winstreak)
  const grinder = leader(all, (x) => ffa(x).points)
  const marine = leader(all, (x) => team(x).avgGold ?? 0)
  const destroyer = leader(all, (x) => team(x).kills ?? 0)
  const teamGrinder = leader(all, (x) => team(x).points)
  const fastest = fastestSpeedrunner(all)

  const starTier = tierFromRank(m.rank1v1)
  const shipTier = tierFromRank(m.ffaRank)
  const streak = loyalStreak(m)

  const starLabel = starTier ? b.star.earnedDesc(tierLimit(starTier)) : b.star.notEarnedDesc
  const shipLabel = shipTier ? b.ship.earnedDesc(tierLimit(shipTier)) : b.ship.notEarnedDesc

  const level = levelFromXp(m.xp)
  const levelTitle = titleForLevel(level)

  return [
    // ── rank (tiered) ──
    { id: 'level', name: levelTitle, kind: 'level', level, earned: true, group: 'rank', desc: b.levelDesc(level, m.xp) },
    { id: 'star', name: b.star.name, kind: 'star', tier: starTier ?? undefined, earned: !!starTier, group: 'rank', desc: starLabel },
    { id: 'ship', name: b.ship.name, kind: 'ship', tier: shipTier ?? undefined, earned: !!shipTier, group: 'rank', desc: shipLabel },
    {
      id: 'mostWins',
      name: b.mostWins.name,
      kind: 'icon',
      icon: 'trophy',
      earned: mostWins?.id === m.publicId,
      group: 'rank',
      desc: mostWins ? b.mostWins.descWithLeader(mostWins.v) : b.mostWins.descNoLeader,
    },
    {
      id: 'fastest',
      name: b.fastest.name,
      kind: 'icon',
      icon: 'flag',
      earned: fastest?.id === m.publicId,
      group: 'rank',
      desc: fastest ? b.fastest.descWithLeader(fmtTime(fastest.v)) : b.fastest.descNoLeader,
    },
    // ── milestones (permanent) ──
    { id: 'good', name: b.good.name, kind: 'icon', icon: 'medal', earned: m.allWins >= 100, group: 'milestone', desc: b.good.desc(m.allWins) },
    { id: 'god', name: b.god.name, kind: 'icon', icon: 'crown', earned: m.allWins >= 1000, group: 'milestone', desc: b.god.desc(m.allWins) },
    { id: 'loyal', name: b.loyal.name, kind: 'icon', icon: 'flame', earned: streak >= LOYAL_THRESHOLD, group: 'milestone', desc: b.loyal.desc(LOYAL_THRESHOLD, streak) },
    { id: 'pusher', name: b.pusher.name, kind: 'icon', icon: 'bell', earned: m.bumpCount >= 100, group: 'milestone', desc: b.pusher.desc(m.bumpCount) },
    // ── monthly (losable) ──
    {
      id: 'predator',
      name: b.predator.name,
      kind: 'icon',
      icon: 'bow',
      earned: predator?.id === m.publicId,
      group: 'monthly',
      desc: predator ? b.predator.descWithLeader(predator.v.toFixed(1)) : b.predator.descNoLeader,
    },
    {
      id: 'pro',
      name: b.pro.name,
      kind: 'icon',
      icon: 'bolt',
      earned: pro?.id === m.publicId,
      group: 'monthly',
      desc: pro ? b.pro.descWithLeader(pro.v) : b.pro.descNoLeader,
    },
    {
      id: 'grinder',
      name: b.grinder.name,
      kind: 'icon',
      icon: 'pickaxe',
      earned: grinder?.id === m.publicId,
      group: 'monthly',
      desc: grinder ? b.grinder.descWithLeader(grinder.v) : b.grinder.descNoLeader,
    },
    {
      id: 'marine',
      name: b.marine.name,
      kind: 'icon',
      icon: 'anchor',
      earned: marine?.id === m.publicId,
      group: 'monthly',
      desc: marine ? b.marine.descWithLeader(marine.v.toFixed(0)) : b.marine.descNoLeader,
    },
    {
      id: 'destroyer',
      name: b.destroyer.name,
      kind: 'icon',
      icon: 'blast',
      earned: destroyer?.id === m.publicId,
      group: 'monthly',
      desc: destroyer ? b.destroyer.descWithLeader(destroyer.v) : b.destroyer.descNoLeader,
    },
    {
      id: 'teamGrinder',
      name: b.teamGrinder.name,
      kind: 'icon',
      icon: 'wrench',
      earned: teamGrinder?.id === m.publicId,
      group: 'monthly',
      desc: teamGrinder ? b.teamGrinder.descWithLeader(teamGrinder.v) : b.teamGrinder.descNoLeader,
    },
  ]
}
