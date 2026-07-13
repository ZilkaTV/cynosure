// ── Badges ───────────────────────────────────────────────────────────────────
// Three groups:
//  • rank      — 1v1 star & FFA ship, tiered by global ladder position (upgrade
//                badges: only the best tier shows). Lost if you drop out.
//  • milestone — permanent once earned (Good/God Player, Loyal Player).
//  • monthly   — this month's category leaders; lost next month if overtaken.
// Most Wins is a "limited" badge (held by the current roster leader).

import { currentMonthKey, ffaMonthly, teamMonthly, type MemberStats } from './stats'

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond'

export interface Badge {
  id: string
  name: string
  kind: 'star' | 'ship' | 'emoji'
  icon?: string
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

  return [
    // ── rank (tiered) ──
    {
      id: 'star',
      name: '1v1 Ladder',
      kind: 'star',
      tier: starTier ?? undefined,
      earned: !!starTier,
      group: 'rank',
      desc: starTier
        ? `Global 1v1 rank #${m.rank1v1} — ${starTier} star (top 3 = diamond, 10 = gold, 50 = silver, 100 = brown).`
        : 'Reach the global 1v1 ranked top 100 (brown → silver → gold → diamond star).',
    },
    {
      id: 'ship',
      name: 'FFA Ladder',
      kind: 'ship',
      tier: shipTier ?? undefined,
      earned: !!shipTier,
      group: 'rank',
      desc: shipTier
        ? `Global FFA rank #${m.ffaRank} — ${shipTier} ship (top 3 = diamond, 10 = gold, 50 = silver, 100 = bronze).`
        : 'Reach the global FFA (trackerfront) top 100 (bronze → silver → gold → diamond ship).',
    },
    {
      id: 'mostWins',
      name: 'Most Wins',
      kind: 'emoji',
      icon: '🏆',
      earned: mostWinsLeader === m.publicId,
      group: 'rank',
      desc: 'Held by the [CYN] member with the most total wins. Lost when someone overtakes you.',
    },
    // ── milestones (permanent) ──
    { id: 'good', name: 'Good Player', kind: 'emoji', icon: '🎖️', earned: m.allWins >= 100, group: 'milestone', desc: 'Win 100 games with the [CYN] tag.' },
    { id: 'god', name: 'God Player', kind: 'emoji', icon: '👑', earned: m.allWins >= 1000, group: 'milestone', desc: 'Win 1000 games with the [CYN] tag.' },
    {
      id: 'loyal',
      name: 'Loyal Player',
      kind: 'emoji',
      icon: '🔥',
      earned: streak >= LOYAL_THRESHOLD,
      group: 'milestone',
      desc: `Win [CYN] games on ${LOYAL_THRESHOLD}+ consecutive days. Current streak: ${streak} day${streak === 1 ? '' : 's'}.`,
    },
    // ── monthly (losable) ──
    { id: 'predator', name: 'Predator', kind: 'emoji', icon: '🏹', earned: predatorLeader === m.publicId, group: 'monthly', desc: 'This month’s highest FFA average kills.' },
    { id: 'pro', name: 'Pro Player', kind: 'emoji', icon: '⚡', earned: proLeader === m.publicId, group: 'monthly', desc: 'This month’s highest FFA win streak.' },
    { id: 'grinder', name: 'Grinder', kind: 'emoji', icon: '⛏️', earned: grinderLeader === m.publicId, group: 'monthly', desc: 'This month’s most FFA points.' },
    { id: 'marine', name: 'Marine', kind: 'emoji', icon: '⚓', earned: marineLeader === m.publicId, group: 'monthly', desc: 'This month’s highest Team gold income.' },
    { id: 'destroyer', name: 'Destroyer', kind: 'emoji', icon: '💥', earned: destroyerLeader === m.publicId, group: 'monthly', desc: 'This month’s most Team kills.' },
    { id: 'teamGrinder', name: 'Team Grinder', kind: 'emoji', icon: '🛠️', earned: teamGrinderLeader === m.publicId, group: 'monthly', desc: 'This month’s most Team points.' },
  ]
}
