import { describe, expect, it } from 'vitest'
import { peakHour, summarizeActivity, toLocalHours, type ActivityDay, type ActivityDoc } from './rankedActivity'

const now = Date.parse('2026-11-23T12:00:00Z')
const key = (ago: number) => new Date(now - ago * 86_400_000).toISOString().slice(0, 10)
const hours = (peak: number, v: number) => Array.from({ length: 24 }, (_, h) => (h === peak ? v : 0))
const day = (a: number, b: number, peak = 18, f: number | null = 6): ActivityDay => ({ a, b, h: hours(peak, a + b), s: Math.round((a + b) / 10), f })

function doc(from: number, to: number, make: (ago: number) => ActivityDay): ActivityDoc {
  const days: Record<string, ActivityDay> = {}
  for (let ago = from; ago <= to; ago++) days[key(ago)] = make(ago)
  return { updated_at: new Date(now).toISOString(), days }
}

describe('ranked activity summary', () => {
  it('needs at least 3 complete days', () => {
    expect(summarizeActivity(doc(1, 2, () => day(10, 5)), now)).toBeNull()
  })

  it('averages the last 30 complete days and leaves today out', () => {
    const d = doc(0, 60, (ago) => (ago === 0 ? day(1, 1) : ago <= 30 ? day(80, 20) : day(160, 40)))
    const s = summarizeActivity(d, now)!
    expect(s.days).toBe(30)
    expect(s.series).toHaveLength(30)
    expect(s.series[29].day).toBe(key(1))
    expect(s.today).toEqual({ day: key(0), a: 1, b: 1 })
    expect(s.perDay30).toBe(100)
    expect(s.perDay7).toBe(100)
    expect(s.trendPct).toBe(-50)
    expect(s.trend1v1).toBe(-50)
    expect(s.share2v2).toBeCloseTo(0.2)
    expect(s.medianFill).toBe(6)
    expect(s.shortShare).toBeCloseTo(0.1)
    expect(peakHour(s.perHour)).toBe(18)
    expect(s.perHour[18]).toBe(100)
  })

  it('has no trend when the earlier period is too short', () => {
    const s = summarizeActivity(doc(1, 35, () => day(50, 10)), now)!
    expect(s.trendPct).toBeNull()
    expect(s.perDay30).toBe(60)
  })

  it('skips broken days', () => {
    const d = doc(1, 10, () => day(10, 0))
    d.days[key(3)] = { a: 5 } as unknown as ActivityDay
    expect(summarizeActivity(d, now)!.days).toBe(9)
  })
})

describe('local hours', () => {
  it('rotates UTC hours to a time zone', () => {
    const utc = hours(18, 7)
    expect(peakHour(toLocalHours(utc, 60))).toBe(19)
    expect(peakHour(toLocalHours(utc, 0))).toBe(18)
    expect(peakHour(toLocalHours(utc, -300))).toBe(13)
    expect(peakHour(toLocalHours(utc, 360))).toBe(0)
  })
})
