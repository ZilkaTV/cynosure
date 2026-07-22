import { describe, it, expect } from 'vitest'
import { isFfa, isTeam, is1v1, ffaBucket, teamBucket, oneVoneBucket, winRate, monthKeyOf } from './stats'
import type { PlayerGame } from './openfront'

function makeGame(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    gameId: 'g1',
    start: '2026-06-15T12:00:00.000Z',
    durationSeconds: 600,
    map: 'Australia',
    mode: 'Free For All',
    type: 'Public',
    playerTeams: null,
    rankedType: 'unranked',
    result: 'victory',
    totalPlayers: 20,
    username: 'Tester',
    clanTag: 'CYN',
    ...overrides,
  }
}

describe('game mode classification', () => {
  it('classifies plain FFA games', () => {
    const g = makeGame({ mode: 'Free For All', rankedType: 'unranked' })
    expect(isFfa(g)).toBe(true)
    expect(isTeam(g)).toBe(false)
    expect(is1v1(g)).toBe(false)
  })

  it('classifies Team games', () => {
    const g = makeGame({ mode: 'Team' })
    expect(isTeam(g)).toBe(true)
    expect(isFfa(g)).toBe(false)
    expect(is1v1(g)).toBe(false)
  })

  it('classifies ranked 1v1 as its own mode, not FFA', () => {
    const g = makeGame({ mode: 'Free For All', rankedType: '1v1' })
    expect(is1v1(g)).toBe(true)
    expect(isFfa(g)).toBe(false)
  })
})

describe('ffaBucket - streak scoring', () => {
  const mk = '2026-06'

  it('awards 1 point for an isolated win', () => {
    const games = [makeGame({ gameId: 'a', start: '2026-06-15T12:00:00Z', result: 'victory' })]
    expect(ffaBucket(games, mk)).toEqual({ wins: 1, losses: 0, points: 1 })
  })

  it('doubles every win in a streak of 2+ consecutive wins', () => {
    const games = [
      makeGame({ gameId: 'a', start: '2026-06-15T12:00:00Z', result: 'victory' }),
      makeGame({ gameId: 'b', start: '2026-06-15T13:00:00Z', result: 'victory' }),
      makeGame({ gameId: 'c', start: '2026-06-15T14:00:00Z', result: 'victory' }),
    ]
    // 3-win streak -> each win worth 2 -> 6 points total
    expect(ffaBucket(games, mk)).toEqual({ wins: 3, losses: 0, points: 6 })
  })

  it('resets the streak after a loss', () => {
    const games = [
      makeGame({ gameId: 'a', start: '2026-06-15T12:00:00Z', result: 'victory' }),
      makeGame({ gameId: 'b', start: '2026-06-15T13:00:00Z', result: 'victory' }),
      makeGame({ gameId: 'c', start: '2026-06-15T14:00:00Z', result: 'defeat' }),
      makeGame({ gameId: 'd', start: '2026-06-15T15:00:00Z', result: 'victory' }),
    ]
    // first streak of 2 -> 2*2=4, the loss, then a lone win -> 1 => 5 total
    expect(ffaBucket(games, mk)).toEqual({ wins: 3, losses: 1, points: 5 })
  })

  it('ignores incomplete games entirely', () => {
    const games = [makeGame({ gameId: 'a', start: '2026-06-15T12:00:00Z', result: 'incomplete' })]
    expect(ffaBucket(games, mk)).toEqual({ wins: 0, losses: 0, points: 0 })
  })

  it('ignores games outside the requested month', () => {
    const games = [makeGame({ gameId: 'a', start: '2026-05-15T12:00:00Z', result: 'victory' })]
    expect(ffaBucket(games, mk)).toEqual({ wins: 0, losses: 0, points: 0 })
  })
})

describe('teamBucket - co-op scoring', () => {
  const mk = '2026-06'

  it('awards 1 point for a solo team win', () => {
    const games = [makeGame({ gameId: 'a', mode: 'Team', start: '2026-06-15T12:00:00Z', result: 'victory' })]
    expect(teamBucket(games, mk, {})).toEqual({ wins: 1, losses: 0, points: 1 })
  })

  it('awards 2 points when the game is flagged as a co-op win', () => {
    const games = [makeGame({ gameId: 'a', mode: 'Team', start: '2026-06-15T12:00:00Z', result: 'victory' })]
    expect(teamBucket(games, mk, { a: true })).toEqual({ wins: 1, losses: 0, points: 2 })
  })

  it('counts a loss without awarding points', () => {
    const games = [makeGame({ gameId: 'a', mode: 'Team', start: '2026-06-15T12:00:00Z', result: 'defeat' })]
    expect(teamBucket(games, mk, {})).toEqual({ wins: 0, losses: 1, points: 0 })
  })
})

describe('oneVoneBucket', () => {
  it('counts ranked 1v1 wins/losses only', () => {
    const games = [
      makeGame({ gameId: 'a', mode: 'Free For All', rankedType: '1v1', start: '2026-06-15T12:00:00Z', result: 'victory' }),
      makeGame({ gameId: 'b', mode: 'Free For All', rankedType: '1v1', start: '2026-06-15T13:00:00Z', result: 'defeat' }),
      // an unranked FFA win in the same month must not leak into 1v1 counts
      makeGame({ gameId: 'c', mode: 'Free For All', rankedType: 'unranked', start: '2026-06-15T14:00:00Z', result: 'victory' }),
    ]
    expect(oneVoneBucket(games, '2026-06')).toEqual({ wins: 1, losses: 1 })
  })
})

describe('winRate', () => {
  it('is 0 when nothing is decided yet', () => {
    expect(winRate(0, 0)).toBe(0)
  })
  it('rounds to the nearest whole percent', () => {
    expect(winRate(1, 2)).toBe(33)
    expect(winRate(2, 1)).toBe(67)
    expect(winRate(1, 1)).toBe(50)
  })
})

describe('monthKeyOf', () => {
  it('formats as YYYY-MM', () => {
    // Noon UTC on the 15th - won't roll into a neighboring month/year in any
    // real-world timezone offset, unlike a date near midnight or month-end.
    expect(monthKeyOf('2026-01-15T12:00:00.000Z')).toBe('2026-01')
  })
})
