import { describe, it, expect } from 'vitest'
import { normalizePath, activeSeconds } from './pageTracker'

describe('normalizePath', () => {
  it('keeps plain pages and the home page', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('/events')).toBe('/events')
    expect(normalizePath('/ranked/ffa')).toBe('/ranked/ffa')
  })
  it('replaces an id segment so no member id ends up in the list', () => {
    expect(normalizePath('/member/qNZMiEyR')).toBe('/member/:id')
    expect(normalizePath('/member/qNZMiEyR/extra/more')).toBe('/member/:id')
  })
  it('cuts to two segments and strips odd characters', () => {
    expect(normalizePath('/a/b/c/d')).toBe('/a/b')
    expect(normalizePath('/he llo!/x')).toBe('/hello/x')
  })
})

describe('activeSeconds', () => {
  const T = 1_000_000
  it('counts the whole span while the member is active', () => {
    expect(activeSeconds(T, T + 60_000, T + 59_000)).toBe(60)
  })
  it('stops counting two minutes after the last input', () => {
    // last input at T, span of 10 minutes: only the first 2 minutes count
    expect(activeSeconds(T, T + 600_000, T)).toBe(120)
  })
  it('counts nothing when the member was already idle at the start of the span', () => {
    expect(activeSeconds(T + 500_000, T + 560_000, T)).toBe(0)
  })
  it('never counts more than 5 minutes per span', () => {
    expect(activeSeconds(T, T + 3_600_000, T + 3_600_000, 10_000_000)).toBe(300)
  })
})
