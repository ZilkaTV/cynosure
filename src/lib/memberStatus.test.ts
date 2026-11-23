import { describe, expect, it } from 'vitest'
import { inactiveDays, isInactive, sinceText } from './memberStatus'

const now = Date.parse('2026-11-23T12:00:00Z')
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

describe('member status', () => {
  it('is inactive after more than 10 days without a clan-tag game', () => {
    expect(inactiveDays(daysAgo(10), now)).toBeNull()
    expect(inactiveDays(daysAgo(10.5), now)).toBeNull() // still 10 whole days
    expect(inactiveDays(daysAgo(11), now)).toBe(11)
    expect(inactiveDays(daysAgo(40), now)).toBe(40)
  })

  it('is not inactive without a known game (a new member is not marked)', () => {
    expect(inactiveDays(null, now)).toBeNull()
    expect(inactiveDays(undefined, now)).toBeNull()
    expect(inactiveDays('nonsense', now)).toBeNull()
  })

  it('writes how long a stream has been running', () => {
    expect(sinceText(new Date(now - 42 * 60_000).toISOString(), now)).toBe('42 min')
    expect(sinceText(new Date(now - 65 * 60_000).toISOString(), now)).toBe('1 h 05 min')
    expect(sinceText(null, now)).toBe('')
  })
})

describe('isInactive', () => {
  it('counts a member who never played a game with the clan tag as inactive', () => {
    expect(isInactive(null, now)).toBe(true)
    expect(isInactive(undefined, now)).toBe(true)
    expect(isInactive(daysAgo(30), now)).toBe(true)
    expect(isInactive(daysAgo(3), now)).toBe(false)
  })
})
