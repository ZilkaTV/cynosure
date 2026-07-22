import { describe, it, expect } from 'vitest'
import { MAX_LEVEL, xpForLevel, levelFromXp, xpProgress, titleForLevel } from './levels'

describe('xpForLevel / levelFromXp round-trip', () => {
  it('is monotonically increasing', () => {
    let prev = -1
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const xp = xpForLevel(l)
      expect(xp).toBeGreaterThan(prev)
      prev = xp
    }
  })

  it('recovers the exact level from its own threshold', () => {
    for (const l of [1, 5, 10, 35, 50, 99]) {
      expect(levelFromXp(xpForLevel(l))).toBe(l)
    }
  })

  it('stays at level 1 below the level-2 threshold', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(xpForLevel(2) - 1)).toBe(1)
  })

  it('never exceeds MAX_LEVEL no matter how much XP is thrown at it', () => {
    expect(levelFromXp(xpForLevel(MAX_LEVEL) * 100)).toBe(MAX_LEVEL)
  })
})

describe('xpProgress', () => {
  it('reports 0 progress exactly at a level threshold', () => {
    const p = xpProgress(xpForLevel(10))
    expect(p.level).toBe(10)
    expect(p.into).toBe(0)
  })

  it('has no "next" level once MAX_LEVEL is reached', () => {
    const p = xpProgress(xpForLevel(MAX_LEVEL))
    expect(p.level).toBe(MAX_LEVEL)
    expect(p.next).toBeNull()
  })
})

describe('titleForLevel', () => {
  it('gives the starter title below the first tier', () => {
    expect(titleForLevel(1)).toBe('CYN Starter')
  })

  it('upgrades exactly at each tier boundary', () => {
    expect(titleForLevel(4)).toBe('CYN Starter')
    expect(titleForLevel(5)).toBe('CYN Recruit')
  })

  it('reaches the top title at MAX_LEVEL', () => {
    expect(titleForLevel(MAX_LEVEL)).toBe('CYN God')
  })
})
