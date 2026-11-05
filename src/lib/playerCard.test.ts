import { describe, expect, it } from 'vitest'
import { applySnapshot, computeCards, percentile, tierOf } from './playerCard'
import type { MemberStats } from './stats'

const member = (id: string, over: Partial<MemberStats> = {}): MemberStats =>
  ({
    publicId: id,
    name: `Player ${id}`, // a real name: a member whose name is only the public id gets no card
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
  it('INT counts the 1v1 and the 2v2 Elo, each against its own ladder (the FFA Elo and the win rate do not count)', () => {
    const duel = [
      member('EEEE5555', { elo: 1800, elo2v2: 2000, eloFfa: 1000 }),
      member('FFFF6666', { elo: 1800, eloFfa: 3000 }),
      member('GGGG7777', { elo: 1500, elo2v2: 1500, eloFfa: 1000 }),
      member('IIII9999', { elo: 1000, elo2v2: 1000 }),
    ]
    const c = computeCards(duel, new Map(), false)
    // strong in both ladders beats strong in one (the other ladder counts as the lowest place) and beats the middle of both; the bottom of both is last
    expect(c.get('EEEE5555')!.stats.INT).toBeGreaterThan(c.get('FFFF6666')!.stats.INT)
    expect(c.get('EEEE5555')!.stats.INT).toBeGreaterThan(c.get('GGGG7777')!.stats.INT)
    expect(c.get('GGGG7777')!.stats.INT).toBeGreaterThan(c.get('IIII9999')!.stats.INT)
    expect(c.get('FFFF6666')!.stats.INT).toBeGreaterThan(c.get('IIII9999')!.stats.INT)
    expect(computeCards([member('HHHH8888', { eloFfa: 3000 }), ...duel], new Map(), false).get('HHHH8888')!.noData.INT).toBe(true)
  })
  it('INT: whoever is higher in the 1v1 and in the 2v2 never has less than somebody listed on one ladder only', () => {
    // the top-100 entries of the clan: Zilka is higher than Calos in the 2v2 and Calos has no 1v1 place at all
    const clan = [
      member('BANE0001', { elo: 2556, elo2v2: 2127 }),
      member('ZILK0002', { elo: 2407, elo2v2: 2434 }),
      member('SOOT0003', { elo: 2396, elo2v2: 2000 }),
      member('CHUM0004', { elo: 2192, elo2v2: 2101 }),
      member('CALO0005', { elo2v2: 2288 }),
    ]
    const c = computeCards(clan, new Map(), false)
    expect(c.get('ZILK0002')!.stats.INT).toBeGreaterThan(c.get('CALO0005')!.stats.INT)
    expect(c.get('CALO0005')!.noData.INT).toBe(false) // one ladder is still data
  })
  it('DEF counts the team win score (2 points when another member was in the game)', () => {
    const team = (ids: string[]) => ids.map((id) => ({ gameId: id, mode: 'Team', result: 'victory', type: 'Public' })) as unknown as MemberStats['cynGames']
    const coop = { t1: true, t2: true, t3: false }
    const c = computeCards([member('IIII9999', { cynGames: team(['t1', 't2']) }), member('JJJJ0000', { cynGames: team(['t3']) })], new Map(), false, null, coop)
    expect(c.get('IIII9999')!.stats.DEF).toBeGreaterThan(c.get('JJJJ0000')!.stats.DEF)
  })
  it('shows a name with a long run of one letter shortened, a normal name untouched', () => {
    const c = computeCards([member('KKKK1111', { name: 'Franquitooooooooooooooooo' }), member('LLLL2222', { name: 'Missouri' })], new Map(), false)
    expect(c.get('KKKK1111')!.name).toBe('Franquito')
    expect(c.get('LLLL2222')!.name).toBe('Missouri')
  })
  it('gives no card to a member without a known name (the name is then the public id)', () => {
    const c = computeCards([member('NNNN9999', { name: 'NNNN9999' }), member('OOOO8888', { name: 'Olaf' })], new Map(), false)
    expect(c.has('NNNN9999')).toBe(false)
    expect(c.has('OOOO8888')).toBe(true)
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
