import { describe, it, expect } from 'vitest'
import { computeClanStreak } from './streak'

function teamGame(start: string): { start: string; mode: string; playerTeams: string | null; totalPlayers: number; type: string } {
  return { start, mode: 'Team', playerTeams: '2', totalPlayers: 8, type: 'Public' }
}

const NOW = new Date('2026-06-15T12:00:00Z')

describe('computeClanStreak', () => {
  it('is zero with no games', () => {
    const s = computeClanStreak([], NOW)
    expect(s.currentDays).toBe(0)
    expect(s.longestDays).toBe(0)
    expect(s.playedToday).toBe(false)
  })

  it('counts consecutive days ending today', () => {
    const games = [teamGame('2026-06-13T10:00:00Z'), teamGame('2026-06-14T10:00:00Z'), teamGame('2026-06-15T09:00:00Z')]
    const s = computeClanStreak(games, NOW)
    expect(s.currentDays).toBe(3)
    expect(s.playedToday).toBe(true)
  })

  it('still counts yesterday as the current streak if today has no game yet', () => {
    const games = [teamGame('2026-06-13T10:00:00Z'), teamGame('2026-06-14T10:00:00Z')]
    const s = computeClanStreak(games, NOW)
    expect(s.currentDays).toBe(2)
    expect(s.playedToday).toBe(false)
  })

  it('breaks the streak across a gap day', () => {
    const games = [teamGame('2026-06-10T10:00:00Z'), teamGame('2026-06-14T10:00:00Z'), teamGame('2026-06-15T09:00:00Z')]
    const s = computeClanStreak(games, NOW)
    expect(s.currentDays).toBe(2)
    expect(s.longestDays).toBe(2)
  })

  it('ignores Private games and non-Team modes', () => {
    const games = [{ ...teamGame('2026-06-15T09:00:00Z'), type: 'Private' }, { ...teamGame('2026-06-15T09:00:00Z'), mode: 'Free For All' }]
    const s = computeClanStreak(games, NOW)
    expect(s.currentDays).toBe(0)
  })

  it('longest can exceed the current streak', () => {
    const games = [teamGame('2026-06-01T10:00:00Z'), teamGame('2026-06-02T10:00:00Z'), teamGame('2026-06-03T10:00:00Z'), teamGame('2026-06-10T10:00:00Z')]
    const s = computeClanStreak(games, NOW)
    expect(s.longestDays).toBe(3)
    expect(s.currentDays).toBe(0)
  })
})
