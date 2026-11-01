import { describe, it, expect } from 'vitest'
import { capsDonatedMap, donationTotals, startOfWeek, type DonorDoc } from './clanDonors'
import { nextResetAt, periodKey, QUESTS, questPeriod } from './quests'

// Saturday 2026-10-31 12:00 UTC: Monday of that week is 2026-10-26
const NOW = new Date('2026-10-31T12:00:00Z')
const doc: DonorDoc = {
  boards: {
    soft: { all: [{ rank: 1, playerId: 'AAAA1111', username: 'a', total: '49550', donations: 4 }], month: [], week: [] },
    hard: { all: [], month: [], week: [] },
  },
  recent: [
    { playerId: 'AAAA1111', currency: 'soft', amount: '120', at: '2026-10-31T08:00:00Z' }, // today
    { playerId: 'AAAA1111', currency: 'soft', amount: '9900', at: '2026-10-27T08:00:00Z' }, // this week, not today
    { playerId: 'AAAA1111', currency: 'soft', amount: '500', at: '2026-10-20T08:00:00Z' }, // last week
    { playerId: 'AAAA1111', currency: 'hard', amount: '100', at: '2026-10-05T08:00:00Z' }, // this month, plutonium
    { playerId: 'BBBB2222', currency: 'soft', amount: '77', at: '2026-10-31T09:00:00Z' },
  ],
}

describe('donation totals', () => {
  it('counts today, this week (from Monday) and this month separately', () => {
    const d = donationTotals(doc, 'AAAA1111', NOW)
    expect(d.capsDay).toBe(120)
    expect(d.capsWeek).toBe(120 + 9900)
    expect(d.plutoniumMonth).toBe(100)
    expect(d.hasRecent).toBe(true)
  })
  it('keeps the all-time caps from the ranking when it is higher than the single donations', () => {
    expect(donationTotals(doc, 'AAAA1111', NOW).capsAll).toBe(49550)
    expect(capsDonatedMap(doc).get('AAAA1111')).toBe(49550)
    expect(capsDonatedMap(doc).get('BBBB2222')).toBe(77)
  })
  it('knows nothing about a member who never donated, and has no quest data without a list', () => {
    expect(donationTotals(doc, 'CCCC3333', NOW)).toMatchObject({ capsDay: 0, capsWeek: 0, plutoniumMonth: 0 })
    expect(donationTotals({ boards: null }, 'AAAA1111', NOW).hasRecent).toBe(false)
    expect(donationTotals(null, 'AAAA1111', NOW).capsAll).toBe(0)
  })
  it('starts the week on Monday 00:00 UTC, also on a Sunday', () => {
    expect(new Date(startOfWeek(new Date('2026-11-01T23:00:00Z'))).toISOString()).toBe('2026-10-26T00:00:00.000Z')
    expect(new Date(startOfWeek(new Date('2026-10-26T00:00:00Z'))).toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })
})

describe('quest periods', () => {
  it('names the claim of a day, a week and a month', () => {
    expect(periodKey('day', NOW)).toBe('2026-10-31')
    expect(periodKey('week', NOW)).toBe('W2026-10-26')
    expect(periodKey('month', NOW)).toBe('2026-10')
  })
  it('resets the week on Monday and the month on the 1st', () => {
    expect(nextResetAt('week')).toBeGreaterThan(Date.now())
    expect(new Date(nextResetAt('week')).getUTCDay()).toBe(1)
    expect(new Date(nextResetAt('month')).getUTCDate()).toBe(1)
  })
  it('has the three donation quests with their period and the right limits', () => {
    const q = (id: string) => QUESTS.find((x) => x.id === id)!
    const ctx = (donated: Partial<ReturnType<typeof donationTotals>>) => ({ reactedToday: false, donated: { capsAll: 0, capsDay: 0, capsWeek: 0, plutoniumMonth: 0, hasRecent: true, ...donated } })
    expect(questPeriod(q('donate_caps_day'))).toBe('day')
    expect(questPeriod(q('donate_caps_week'))).toBe('week')
    expect(questPeriod(q('donate_plutonium_month'))).toBe('month')
    const m = {} as never
    expect(q('donate_caps_day').check(m, {}, ctx({ capsDay: 99 }))).toBe(false)
    expect(q('donate_caps_day').check(m, {}, ctx({ capsDay: 100 }))).toBe(true)
    expect(q('donate_caps_week').check(m, {}, ctx({ capsWeek: 9999 }))).toBe(false)
    expect(q('donate_caps_week').check(m, {}, ctx({ capsWeek: 10000 }))).toBe(true)
    expect(q('donate_plutonium_month').check(m, {}, ctx({ plutoniumMonth: 100 }))).toBe(true)
    expect(q('donate_plutonium_month').check(m, {}, ctx({ plutoniumMonth: 99 }))).toBe(false)
  })
})
