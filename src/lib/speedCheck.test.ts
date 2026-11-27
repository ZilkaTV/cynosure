import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module shared with the Worker and the verify script
import { checkGameSpeed } from '../../worker/speedCheck.mjs'

// smsfun's run (Rg8EQ5YnZ): 299.5 s of game time in 2352 s of real time, paused 5 times.
const slowRecord = { duration: 2352, num_turns: 3101 }

describe('checkGameSpeed', () => {
  it('accepts a run at normal speed', () => {
    expect(checkGameSpeed({ duration: 320, num_turns: 3000 }, 299.5, 0)).toBeNull()
  })

  it('refuses a run played in fast-forward', () => {
    expect(checkGameSpeed({ duration: 100, num_turns: 3000 }, 299.5, 0)).toMatch(/sped up/)
    expect(checkGameSpeed({ duration: 100, num_turns: 3000 }, 299.5, 5)).toMatch(/sped up/)
  })

  it('refuses a long real time when the game was never paused', () => {
    expect(checkGameSpeed(slowRecord, 299.5, 0)).toMatch(/never paused/)
  })

  it('accepts a long real time when the game was paused', () => {
    expect(checkGameSpeed(slowRecord, 299.5, 5)).toBeNull()
    expect(checkGameSpeed(slowRecord, 299.5, 1)).toBeNull()
  })

  it('does not run the slow check before the replay is known (the Worker first look)', () => {
    expect(checkGameSpeed(slowRecord)).toBeNull()
    expect(checkGameSpeed(slowRecord, null, null)).toBeNull()
  })
})
