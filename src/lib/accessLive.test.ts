import { describe, expect, it } from 'vitest'
import { computeAccess, lastWinInGames } from './access'
import type { PlayerGame } from './openfront'
import type { MemberStats, RosterResult } from './stats'

const game = (g: Partial<PlayerGame>) =>
  ({ gameId: 'g', start: '2026-11-02T21:05:33.010Z', durationSeconds: 328, mode: 'Team', type: 'Public', rankedType: '2v2', result: 'victory', totalPlayers: 4, clanTag: 'CYN', ...g }) as PlayerGame

describe('lastWinInGames (the access check of a member whose games are not in the shared lists yet)', () => {
  it('takes the end of the newest qualifying win (ranked 2v2 counts)', () => {
    const games = [game({ gameId: 'a', start: '2026-11-02T21:05:33.010Z', durationSeconds: 328 }), game({ gameId: 'b', start: '2026-11-02T21:13:36.352Z', durationSeconds: 267 })]
    expect(lastWinInGames(games)).toBe(new Date('2026-11-02T21:13:36.352Z').getTime() + 267_000)
  })
  it('ignores losses, solo games, other clan tags and unranked team games', () => {
    expect(lastWinInGames([game({ result: 'defeat' })])).toBeNull()
    expect(lastWinInGames([game({ type: 'Singleplayer', mode: 'Free For All', rankedType: 'unranked', totalPlayers: 1 })])).toBeNull()
    expect(lastWinInGames([game({ clanTag: 'ABC' })])).toBeNull()
    expect(lastWinInGames([game({ rankedType: 'unranked' })])).toBeNull()
  })
  it('counts a public FFA with more than 10 players', () => {
    expect(lastWinInGames([game({ mode: 'Free For All', rankedType: 'unranked', totalPlayers: 65 })])).not.toBeNull()
  })
})

describe('computeAccess with a win found directly at OpenFront', () => {
  const member = { publicId: 'ylUVsCie', cynGames: [], allWins: 0, isSupporter: false } as unknown as MemberStats
  const roster = { members: [member], coopByGame: {} } as unknown as RosterResult
  const now = new Date('2026-11-02T21:40:00.000Z').getTime()
  const win = new Date('2026-11-02T21:18:00.000Z').getTime()

  it('is expired without any game data', () => {
    expect(computeAccess(member, roster, { booster: false, staff: false }, now).status).toBe('expired')
  })
  it('is open for 7 days after the win that was found', () => {
    const a = computeAccess(member, roster, { booster: false, staff: false, liveWinAt: win }, now)
    expect(a.status).toBe('ok')
    expect(a.daysLeft).toBe(7)
  })
})
