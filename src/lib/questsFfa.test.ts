import { describe, expect, it } from 'vitest'
import { QUESTS } from './quests'
import type { MemberStats } from './stats'

const ctx = { reactedToday: false, donated: { hasRecent: false } } as never
const ffaWin = QUESTS.find((q) => q.id === 'ffa_win')!
const today = new Date().toISOString()

/** a member with one game */
const withGame = (g: Record<string, unknown>) => ({ cynGames: [{ mode: 'Free For All', type: 'Public', rankedType: null, result: 'victory', totalPlayers: 65, start: today, ...g }] }) as unknown as MemberStats

describe('quest Battle Royale (win a FFA game)', () => {
  it('counts a public FFA win with 10 or more players', () => {
    expect(ffaWin.check(withGame({}), {}, ctx)).toBe(true)
    expect(ffaWin.check(withGame({ totalPlayers: 10 }), {}, ctx)).toBe(true)
  })
  it('does not count a public FFA with fewer than 10 players', () => {
    expect(ffaWin.check(withGame({ totalPlayers: 9 }), {}, ctx)).toBe(false)
    expect(ffaWin.check(withGame({ totalPlayers: null }), {}, ctx)).toBe(false)
  })
  it('still counts a ranked FFA win, whatever the lobby size', () => {
    expect(ffaWin.check(withGame({ rankedType: 'ffa', totalPlayers: 6 }), {}, ctx)).toBe(true)
  })
  it('does not count a loss, an old game, a private game or a solo game', () => {
    expect(ffaWin.check(withGame({ result: 'defeat' }), {}, ctx)).toBe(false)
    expect(ffaWin.check(withGame({ start: '2020-01-01T10:00:00.000Z' }), {}, ctx)).toBe(false)
    expect(ffaWin.check(withGame({ type: 'Private' }), {}, ctx)).toBe(false)
    expect(ffaWin.check(withGame({ type: 'Singleplayer' }), {}, ctx)).toBe(false)
  })
  it('does not count a team game', () => {
    expect(ffaWin.check(withGame({ mode: 'Team' }), {}, ctx)).toBe(false)
  })
})
