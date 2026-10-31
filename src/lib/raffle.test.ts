import { describe, expect, it } from 'vitest'
import { BOOST_BONUS, gamesFactor, winScoreFactor } from './raffle'

describe('Factor Wheel weights', () => {
  it('gives 1 point per game', () => {
    expect(gamesFactor(0)).toBe(0)
    expect(gamesFactor(7)).toBe(7)
  })
  it('gives 1 point per full Win Score, nothing for a negative one', () => {
    expect(winScoreFactor(95.1)).toBe(95)
    expect(winScoreFactor(0.9)).toBe(0)
    expect(winScoreFactor(-12)).toBe(0)
  })
  it('gives 10 points per boost', () => {
    expect(BOOST_BONUS).toBe(10)
  })
})
