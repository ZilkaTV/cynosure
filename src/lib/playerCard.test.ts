import { describe, expect, it } from 'vitest'
import { applySnapshot, computeCards, percentile, tierOf } from './playerCard'
import type { MemberStats } from './stats'

const member = (id: string, over: Partial<MemberStats> = {}): MemberStats =>
  ({
    publicId: id,
    name: id,
    claimed: true,
    accountUsername: null,
    ffaWins: 0,
    teamWins: 0,
    rankedWins: 0,
    twoVTwoWins: 0,
    allWins: 0,
    elo: null,
    peakElo: null,
    eloInTop100: false,
    eloMonthDelta: null,
    elo2v2: null,
    peakElo2v2: null,
    eloFfa: null,
    peakEloFfa: null,
    rankedFfaWins: 0,
    clanWarsWins: 0,
    eloInTop100_2v2: false,
    eloMonthDelta2v2: null,
    rank1v1: null,
    rank2v2: null,
    ffaRank: null,
    speedrunSeconds: null,
    speedrunAttempts: 0,
    speedrunVerified: false,
    speedrunGameId: null,
    lastSpeedrunAt: null,
    tiles3minPercent: null,
    xp: 0,
    chatMessageCount: 0,
    isSupporter: false,
    gamesLast30d: 0,
    lastGame: null,
    clanGamesTotal: 0,
    cynGames: [],
    detailByGame: {},
    ...over,
  }) as MemberStats

describe('percentile', () => {
  it('is the place among the others', () => {
    expect(percentile(5, [1, 2, 3, 4, 5])).toBe(1)
    expect(percentile(1, [1, 2, 3, 4, 5])).toBe(0)
    expect(percentile(3, [1, 2, 3, 4, 5])).toBe(0.5)
  })
  it('counts ties half and a lone member as the middle', () => {
    expect(percentile(2, [2, 2, 2])).toBe(0.5)
    expect(percentile(7, [7])).toBe(0.5)
  })
})

describe('tiers', () => {
  it('follow the overall rating', () => {
    expect([50, 64, 72, 80, 88, 99].map(tierOf)).toEqual(['bronze', 'silver', 'gold', 'diamond', 'legend', 'legend'])
  })
})

describe('computeCards', () => {
  const games = (won: number, lost: number, mode = 'Free For All') =>
    [...Array(won).fill('victory'), ...Array(lost).fill('defeat')].map((result, i) => ({ gameId: `g${mode}${result}${i}`, mode, result })) as unknown as MemberStats['cynGames']
  const detail = (kills: number, gold: number, out: number, inn: number) => ({ g1: { kills, goldPerMin: gold, troopsOutPerMin: out, troopsInPerMin: inn, clientId: 'c' } })

  const members = [
    member('AAAA1111', { xp: 500, cynGames: games(30, 10), elo: 2000, speedrunSeconds: 240, tiles3minPercent: 9, detailByGame: detail(12, 90, 50, 5) }),
    member('BBBB2222', { xp: 40, cynGames: games(10, 30), elo: 1200, speedrunSeconds: 400, tiles3minPercent: 3, detailByGame: detail(2, 30, 10, 20) }),
    member('CCCC3333', { xp: 200, cynGames: games(20, 20), elo: 1600, speedrunSeconds: 300, tiles3minPercent: 6, detailByGame: detail(7, 60, 30, 12) }),
  ]
  const caps = new Map([['AAAA1111', 50000], ['BBBB2222', 0], ['CCCC3333', 1000]])
  const social = new Map([['AAAA1111', 90], ['BBBB2222', 5], ['CCCC3333', 30]])
  const cards = computeCards(members, caps, true, social)

  it('puts every value between 46 and 99', () => {
    for (const c of cards.values()) for (const v of Object.values(c.stats)) {
        expect(v).toBeGreaterThanOrEqual(46)
        expect(v).toBeLessThanOrEqual(99)
      }
  })
  it('ranks the stronger member above the weaker one in every value', () => {
    const a = cards.get('AAAA1111')!
    const b = cards.get('BBBB2222')!
    for (const k of ['COM', 'INT', 'ECO', 'SPE', 'ATK'] as const) expect(a.stats[k]).toBeGreaterThan(b.stats[k])
    expect(a.overall).toBeGreaterThan(cards.get('CCCC3333')!.overall)
    expect(cards.get('CCCC3333')!.overall).toBeGreaterThan(b.overall)
  })
  it('a faster speedrun is a higher SPE', () => {
    expect(cards.get('AAAA1111')!.stats.SPE).toBeGreaterThan(cards.get('BBBB2222')!.stats.SPE)
  })
  it('takes the title from the strongest value', () => {
    expect(['COMMS', 'TACTICIAN', 'ECONOMIST', 'SPRINTER', 'DEFENDER', 'ATTACKER']).toContain(cards.get('AAAA1111')!.title)
  })
  it('shows a neutral 50 and marks it when a value has no data at all', () => {
    const lone = computeCards([member('DDDD4444'), ...members], caps, true, social).get('DDDD4444')!
    expect(lone.stats.SPE).toBe(50)
    expect(lone.noData.SPE).toBe(true)
    expect(lone.noData.COM).toBe(false) // XP and social are known (0)
    expect(computeCards([member('DDDD4444'), ...members], caps, true, null).get('DDDD4444')!.noData.COM).toBe(false) // XP alone still counts
  })
  it('works without the donor list (ECO then only has the gold per minute)', () => {
    const c = computeCards(members, new Map(), false).get('AAAA1111')!
    expect(c.noData.ECO).toBe(false)
  })
})

describe('applySnapshot', () => {
  const base = computeCards([member('AAAA1111', { xp: 100 }), member('BBBB2222', { xp: 10 })], new Map(), false, null).get('AAAA1111')!
  const stats = { COM: 80, INT: 70, ECO: 60, SPE: 50, DEF: 90, ATK: 75 }

  it('shows the values of the update and keeps the live ones', () => {
    const card = applySnapshot(base, { month: '2026-11', stats, prev: null, at: 'x' })
    expect(card.stats).toEqual(stats)
    expect(card.overall).toBe(71) // (80+70+60+50+90+75) / 6 = 70.8
    expect(card.tier).toBe('silver')
    expect(card.title).toBe('DEFENDER')
    expect(card.live).toEqual(base.stats)
    expect(card.updatedMonth).toBe('2026-11')
    expect(card.delta).toBeUndefined() // the first update has nothing to compare with
  })

  it('knows what changed since the update before', () => {
    const card = applySnapshot(base, { month: '2026-12', stats, prev: { COM: 78, INT: 72, ECO: 60, SPE: 50, DEF: 85, ATK: 75 }, at: 'x' })
    expect(card.delta).toEqual({ COM: 2, INT: -2, ECO: 0, SPE: 0, DEF: 5, ATK: 0 })
  })
})
