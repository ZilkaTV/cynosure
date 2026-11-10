import { describe, it, expect } from 'vitest'
import { normalizePath } from './pageTracker'

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
