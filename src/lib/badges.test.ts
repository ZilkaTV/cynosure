import { describe, it, expect } from 'vitest'
import { computeBadges } from './badges'
import { translations } from '../i18n/translations'
import type { MemberStats } from './stats'

function fakeMember(i: number, games = 700): MemberStats {
  const now = Date.now()
  const cynGames = Array.from({ length: games }, (_, g) => ({
    gameId: `g${i}-${g}`, start: new Date(now - g * 3_600_000).toISOString(), durationSeconds: 600, map: 'World',
    mode: g % 2 ? 'Team' : 'Free For All', type: 'Public', playerTeams: g % 2 ? '2' : null, rankedType: 'unranked',
    result: g % 3 ? 'victory' : 'defeat', totalPlayers: 20, username: `m${i}`, clanTag: 'CYN',
  }))
  return { publicId: `m${i}`, name: `m${i}`, cynGames, detailByGame: {}, allWins: i, twoVTwoWins: i, rank1v1: null, rank2v2: null, ffaRank: null, speedrunSeconds: null, bumpCount: 0, xp: 0, chatMessageCount: 0, isSupporter: false, lastGame: null, gamesLast30d: 5, clanGamesTotal: games } as unknown as MemberStats
}

describe('computeBadges', () => {
  it('rendering a whole roster stays fast (leaders are computed once per roster, not once per row)', () => {
    const all = Array.from({ length: 36 }, (_, i) => fakeMember(i))
    const t0 = performance.now()
    for (const m of all) computeBadges(m, all, translations.en as never)
    // Was ~2850ms before the per-roster cache (36 members x 700 games);
    // ~100ms after. The bound is deliberately loose (slow CI machines) but
    // still far below the old cost.
    expect(performance.now() - t0).toBeLessThan(1500)
  })

  it('gives the same result on repeated calls and exactly one leader per category', () => {
    const all = Array.from({ length: 5 }, (_, i) => fakeMember(i, 50))
    const first = computeBadges(all[4], all, translations.en as never)
    const second = computeBadges(all[4], all, translations.en as never)
    expect(second.map((b) => [b.id, b.earned])).toEqual(first.map((b) => [b.id, b.earned]))
    const mostWinsHolders = all.filter((m) => computeBadges(m, all, translations.en as never).find((b) => b.id === 'mostWins')?.earned)
    expect(mostWinsHolders.map((m) => m.publicId)).toEqual(['m4'])
  })

  it('does not serve stale leaders after the roster changes (new array = fresh computation)', () => {
    const all = Array.from({ length: 3 }, (_, i) => fakeMember(i, 20))
    const before = computeBadges(all[2], all, translations.en as never).find((b) => b.id === 'mostWins')?.earned
    const updated = all.map((m, i) => (i === 0 ? { ...m, allWins: 999 } : m)) as MemberStats[]
    const after = computeBadges(updated[2], updated, translations.en as never).find((b) => b.id === 'mostWins')?.earned
    expect(before).toBe(true)
    expect(after).toBe(false)
  })
})
