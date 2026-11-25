import { describe, expect, it } from 'vitest'
import { ffaChange, fmtFfaDelta } from './gameRows'

describe('FFA rating of a single game', () => {
  it('works out the change from before and after', () => {
    const c = ffaChange({ ffaRating: { before: 2220.96, after: 2207.96, expected: 0.4078, deltaResult: -13.51, deltaPlace: 0.51 } })!
    expect(Math.round(c.d)).toBe(-13)
    expect(c.expected).toBeCloseTo(0.4078)
    expect(c.result).toBeCloseTo(-13.51)
    expect(c.place).toBeCloseTo(0.51)
  })

  it('has no change for a game that was not rated', () => {
    expect(ffaChange({})).toBeNull()
    expect(ffaChange({ ffaRating: null })).toBeNull()
  })

  it('formats the change with a sign and whole points', () => {
    expect(fmtFfaDelta(10.6)).toBe('+11')
    expect(fmtFfaDelta(-18.3)).toBe('−18')
    expect(fmtFfaDelta(0.2)).toBe('±0')
  })
})
