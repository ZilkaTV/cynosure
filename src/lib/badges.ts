// ── Badges ───────────────────────────────────────────────────────────────────
// Three groups:
//  • rank      - 1v1 star & FFA ship, tiered by global ladder position (upgrade
//                badges: only the best tier shows). Lost if you drop out.
//  • milestone - permanent once earned (Good/God Player, Loyal Player).
//  • monthly   - this month's category leaders; lost next month if overtaken.
// Most Wins is a "limited" badge (held by the current roster leader).

import { currentMonthKey, ffaMonthly, teamMonthly, type MemberStats } from './stats'

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

export interface Badge {
  id: string
  name: string
  kind: 'star' | 'ship' | 'icon'
  icon?: IconKey
  tier?: BadgeTier
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

/** Leader (publicId) of a numeric metric among members, if any value > 0. */
function leader(members: MemberStats[], value: (m: MemberStats) => number): string | null {
  let best: { id: string; v: number } | null = null
  for (const m of members) {
    const v = value(m)
    if (v > 0 && (!best || v > best.v)) best = { id: m.publicId, v }
  }
  return best?.id ?? null
}

export function computeBadges(m: MemberStats, all: MemberStats[]): Badge[] {
  const mk = currentMonthKey()
  const ffa = (x: MemberStats) => ffaMonthly(x, mk)
  const team = (x: MemberStats) => teamMonthly(x, mk, {})

  const mostWinsLeader = leader(all, (x) => x.allWins)
  const predatorLeader = leader(all, (x) => ffa(x).avgKills ?? 0)
  const proLeader = leader(all, (x) => ffa(x).winstreak)
  const grinderLeader = leader(all, (x) => ffa(x).points)
  const marineLeader = leader(all, (x) => team(x).avgGold ?? 0)
  const destroyerLeader = leader(all, (x) => team(x).kills ?? 0)
  const teamGrinderLeader = leader(all, (x) => team(x).points)

  const starTier = tierFromRank(m.rank1v1)
  const shipTier = tierFromRank(m.ffaRank)
  const streak = loyalStreak(m)

  const starLabel = starTier ? `Top ${tierLimit(starTier)} 1v1 Leaderboard` : 'Reach top 100 1v1 Leaderboard'
  const shipLabel = shipTier ? `Top ${tierLimit(shipTier)} FFA Leaderboard` : 'Reach top 100 FFA Leaderboard'

  return [
    // ── rank (tiered) ──
    { id: 'star', name: '1v1 Ladder', kind: 'star', tier: starTier ?? undefined, earned: !!starTier, group: 'rank', desc: starLabel },
    { id: 'ship', name: 'FFA Ladder', kind: 'ship', tier: shipTier ?? undefined, earned: !!shipTier, group: 'rank', desc: shipLabel },
    { id: 'mostWins', name: 'Most Wins', kind: 'icon', icon: 'trophy', earned: mostWinsLeader === m.publicId, group: 'rank', desc: 'Most total wins in the clan' },
    // ── milestones (permanent) ──
    { id: 'good', name: 'Good Player', kind: 'icon', icon: 'medal', earned: m.allWins >= 100, group: 'milestone', desc: '100 wins' },
    { id: 'god', name: 'God Player', kind: 'icon', icon: 'crown', earned: m.allWins >= 1000, group: 'milestone', desc: '1000 wins' },
    { id: 'loyal', name: 'Loyal Player', kind: 'icon', icon: 'flame', earned: streak >= LOYAL_THRESHOLD, group: 'milestone', desc: `${LOYAL_THRESHOLD}+ day win streak (current: ${streak})` },
    { id: 'pusher', name: 'Pusher', kind: 'icon', icon: 'bell', earned: m.bumpCount >= 100, group: 'milestone', desc: `100 Discord bumps (current: ${m.bumpCount})` },
    // ── monthly (losable) ──
    { id: 'predator', name: 'Predator', kind: 'icon', icon: 'bow', earned: predatorLeader === m.publicId, group: 'monthly', desc: 'Highest FFA avg kills this month' },
    { id: 'pro', name: 'Pro Player', kind: 'icon', icon: 'bolt', earned: proLeader === m.publicId, group: 'monthly', desc: 'Highest FFA win streak this month' },
    { id: 'grinder', name: 'Grinder', kind: 'icon', icon: 'pickaxe', earned: grinderLeader === m.publicId, group: 'monthly', desc: 'Most FFA points this month' },
    { id: 'marine', name: 'Marine', kind: 'icon', icon: 'anchor', earned: marineLeader === m.publicId, group: 'monthly', desc: 'Highest Team gold/min this month' },
    { id: 'destroyer', name: 'Destroyer', kind: 'icon', icon: 'blast', earned: destroyerLeader === m.publicId, group: 'monthly', desc: 'Most Team kills this month' },
    { id: 'teamGrinder', name: 'Team Grinder', kind: 'icon', icon: 'wrench', earned: teamGrinderLeader === m.publicId, group: 'monthly', desc: 'Most Team points this month' },
  ]
}
