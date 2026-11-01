import { describe, expect, it } from 'vitest'
// @ts-expect-error the Worker modules are plain JavaScript without type declarations
import { PACK_SIZE, RARITIES, berlinDay, drawPack, drawRarity, nextBerlinMidnight, randomInt } from '../../worker/boosters.js'

describe('the booster draw', () => {
  it('the rarity weights add up to 100', () => {
    expect(RARITIES.reduce((s: number, [, w]: [string, number]) => s + w, 0)).toBe(100)
  })

  it('a roll picks the rarity by its weight', () => {
    // rolls 0..54 are common, 55..80 rare, 81..92 epic, 93..97 ultra, 98..99 legendary
    const at = (roll: number) => drawRarity(() => roll)
    expect([0, 54, 55, 80, 81, 92, 93, 97, 98, 99].map(at)).toEqual(['common', 'common', 'rare', 'rare', 'epic', 'epic', 'ultra', 'ultra', 'legendary', 'legendary'])
  })

  it('draws the pack size from the pool, with a rarity for each', () => {
    const pack = drawPack(['A', 'B', 'C'], () => 1)
    expect(pack).toHaveLength(PACK_SIZE)
    expect(pack.every((c: { card_id: string; rarity: string }) => ['A', 'B', 'C'].includes(c.card_id) && typeof c.rarity === 'string')).toBe(true)
    expect(drawPack([])).toEqual([])
  })

  it('randomInt stays inside the range and uses all of it', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const v = randomInt(5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
      seen.add(v)
    }
    expect(seen.size).toBe(5)
  })

  it('the rarities come out roughly as often as their weights say', () => {
    const counts: Record<string, number> = {}
    const n = 20000
    for (let i = 0; i < n; i++) {
      const r = drawRarity()
      counts[r] = (counts[r] ?? 0) + 1
    }
    expect(counts.common / n).toBeGreaterThan(0.5)
    expect(counts.common / n).toBeLessThan(0.6)
    expect(counts.legendary / n).toBeGreaterThan(0.005)
    expect(counts.legendary / n).toBeLessThan(0.04)
  })
})

describe('the day of the free booster', () => {
  it('counts in Berlin time', () => {
    // 22:30 UTC on 30 Oct is already 31 Oct in Berlin (CET is UTC+1 after the clock change on 25 Oct 2026)
    expect(berlinDay(Date.UTC(2026, 9, 30, 22, 30))).toBe('2026-10-30')
    expect(berlinDay(Date.UTC(2026, 9, 30, 23, 30))).toBe('2026-10-31')
  })
  it('the next midnight is the next change of the date', () => {
    const now = Date.UTC(2026, 9, 31, 14, 0)
    const next = nextBerlinMidnight(now)
    expect(berlinDay(next)).toBe('2026-11-01')
    expect(berlinDay(next - 5000)).toBe('2026-10-31')
  })
})
