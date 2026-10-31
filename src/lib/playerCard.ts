import type { MemberStats } from './stats'

// The player card (like the cards of a football game, but our own system): six values from the stats of the site, an overall rating and a tier.
// Everything is computed from the data the site already checked (nothing is typed in by the member); a value is the member's place among all
// members for that measure (a percentile), so it needs no guessing about what a "good" number is in OpenFront.

export const CARD_STATS = ['COM', 'INT', 'ECO', 'SPE', 'DEF', 'ATK'] as const
export type CardStat = (typeof CARD_STATS)[number]
export type CardTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'legend'

export interface PlayerCardData {
  publicId: string
  name: string
  nationality?: string
  overall: number
  tier: CardTier
  /** short title from the strongest value, e.g. ATTACKER */
  title: string
  stats: Record<CardStat, number>
  /** true when a value had no data of the member at all (it then shows a neutral 50) */
  noData: Record<CardStat, boolean>
}

const FLOOR = 46
const SPAN = 53 // value = 46 .. 99
const NEUTRAL = 50

export const TIER_FROM: [number, CardTier][] = [
  [88, 'legend'],
  [80, 'diamond'],
  [72, 'gold'],
  [64, 'silver'],
  [0, 'bronze'],
]
export const tierOf = (overall: number): CardTier => TIER_FROM.find(([min]) => overall >= min)![1]

const TITLES: Record<CardStat, string> = { COM: 'COMMS', INT: 'TACTICIAN', ECO: 'ECONOMIST', SPE: 'SPRINTER', DEF: 'DEFENDER', ATK: 'ATTACKER' }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** The share of the population this value is better than or equal to (ties count half), 0..1. */
export function percentile(value: number, population: number[]): number {
  if (population.length <= 1) return 0.5
  let below = 0
  let equal = 0
  for (const v of population) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + Math.max(0, equal - 1) / 2) / (population.length - 1)
}
const toValue = (p: number) => Math.round(FLOOR + SPAN * Math.min(1, Math.max(0, p)))

/** The raw measures of one member (null = no data). */
export interface CardMeasures {
  /** comments and reactions the member wrote on the site */
  social: number | null
  xp: number | null
  winRate: number | null
  bestElo: number | null
  goldPerMin: number | null
  caps: number | null
  /** lower is better */
  speedrunSeconds: number | null
  tiles3min: number | null
  teamWinRate: number | null
  troopsIn: number | null
  kills: number | null
  troopsOut: number | null
}

export function measuresOf(m: MemberStats, caps: number | null, social: number | null): CardMeasures {
  const finished = m.cynGames.filter((g) => g.result !== 'incomplete')
  const won = (list: typeof finished) => list.filter((g) => g.result === 'victory').length
  const team = finished.filter((g) => g.mode === 'Team')
  const details = Object.values(m.detailByGame)
  const mean = (pick: (d: (typeof details)[number]) => number) => avg(details.map(pick).filter((v) => Number.isFinite(v)))
  const elos = [m.elo, m.elo2v2, m.eloFfa].filter((v): v is number => typeof v === 'number')
  return {
    social,
    xp: m.xp,
    winRate: finished.length >= 10 ? won(finished) / finished.length : null,
    bestElo: elos.length ? Math.max(...elos) : null,
    goldPerMin: mean((d) => d.goldPerMin),
    caps,
    speedrunSeconds: m.speedrunSeconds,
    tiles3min: m.tiles3minPercent,
    teamWinRate: team.length >= 5 ? won(team) / team.length : null,
    troopsIn: mean((d) => d.troopsInPerMin),
    kills: mean((d) => d.kills),
    troopsOut: mean((d) => d.troopsOutPerMin),
  }
}

type Pair = [keyof CardMeasures, boolean] // measure, higher is better

const FORMULA: Record<CardStat, Pair[]> = {
  COM: [
    ['social', true],
    ['xp', true],
  ],
  INT: [
    ['winRate', true],
    ['bestElo', true],
  ],
  ECO: [
    ['goldPerMin', true],
    ['caps', true],
  ],
  SPE: [
    ['speedrunSeconds', false],
    ['tiles3min', true],
  ],
  DEF: [
    ['teamWinRate', true],
    ['troopsIn', true],
  ],
  ATK: [
    ['kills', true],
    ['troopsOut', true],
  ],
}

/** The cards of all members: each value is the member's place among the members that have data for it. */
export function computeCards(members: MemberStats[], capsByMember: Map<string, number>, donorsKnown: boolean, socialByMember: Map<string, number> | null = null): Map<string, PlayerCardData> {
  const all = members.map((m) => ({ m, x: measuresOf(m, donorsKnown ? (capsByMember.get(m.publicId) ?? 0) : null, socialByMember ? (socialByMember.get(m.publicId) ?? 0) : null) }))
  const population = (key: keyof CardMeasures) => all.map((a) => a.x[key]).filter((v): v is number => typeof v === 'number')
  const pops = {} as Record<keyof CardMeasures, number[]>
  for (const key of Object.keys(all[0]?.x ?? {}) as (keyof CardMeasures)[]) pops[key] = population(key)

  const out = new Map<string, PlayerCardData>()
  for (const { m, x } of all) {
    const stats = {} as Record<CardStat, number>
    const noData = {} as Record<CardStat, boolean>
    for (const stat of CARD_STATS) {
      const ps: number[] = []
      for (const [key, higher] of FORMULA[stat]) {
        const v = x[key]
        if (typeof v !== 'number') continue
        const p = percentile(v, pops[key])
        ps.push(higher ? p : 1 - p)
      }
      // DEF without team games falls back to the overall win rate
      if (stat === 'DEF' && ps.length === 0 && typeof x.winRate === 'number') ps.push(percentile(x.winRate, pops.winRate))
      const mean = avg(ps)
      noData[stat] = mean == null
      stats[stat] = mean == null ? NEUTRAL : toValue(mean)
    }
    const overall = Math.round(CARD_STATS.reduce((s, k) => s + stats[k], 0) / CARD_STATS.length)
    const best = CARD_STATS.reduce((a, b) => (stats[b] > stats[a] ? b : a), CARD_STATS[0])
    out.set(m.publicId, { publicId: m.publicId, name: m.name, nationality: m.nationality, overall, tier: tierOf(overall), title: TITLES[best], stats, noData })
  }
  return out
}
