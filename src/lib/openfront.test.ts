import { describe, expect, it } from 'vitest'
import { teamRosterNames, type GameDetail, type GamePlayerStat } from './openfront'

function player(clientID: string, username: string, clanTag: string | null): GamePlayerStat {
  return { clientID, username, clanTag }
}

function makeDetail(players: GamePlayerStat[], winnerClientIds: string[]): GameDetail {
  return {
    gameId: 'g1',
    map: 'World',
    gameType: 'Public',
    nations: 'enabled',
    bots: 0,
    durationSeconds: 300,
    numTurns: 100,
    winnerClientIds,
    numTeams: 2,
    start: 0,
    players,
  }
}

describe('teamRosterNames', () => {
  it('reconstructs a win straight from winnerClientIds', () => {
    const detail = makeDetail(
      [player('a', 'Zilka', 'CYN'), player('b', 'Chuma', 'CYN'), player('c', 'Enemy', 'FOO')],
      ['a', 'b'],
    )
    expect(teamRosterNames(detail, true, ['Zilka'])?.sort()).toEqual(['Chuma', 'Zilka'])
  })

  it('reconstructs a loss from every same-tagged player, with no teamIndex needed', () => {
    // Confirmed live: everyone carrying the same [CYN] tag is guaranteed to
    // be on the same team - a losing roster doesn't need a per-game
    // teamIndex to be reconstructed, unlike before this change.
    const detail = makeDetail(
      [player('a', 'Zilka', 'CYN'), player('b', 'UnregisteredMate', 'CYN'), player('c', 'Winner', 'FOO')],
      ['c'],
    )
    expect(teamRosterNames(detail, false, ['Zilka'])?.sort()).toEqual(['UnregisteredMate', 'Zilka'])
  })

  it('returns null when nobody in the roster carries the tag or a registered name (broken/missing data)', () => {
    const detail = makeDetail([player('a', 'Stranger', 'FOO'), player('b', 'Winner', 'FOO')], ['b'])
    expect(teamRosterNames(detail, true, ['Zilka'])).toBeNull()
    expect(teamRosterNames(detail, false, ['Zilka'])).toBeNull()
  })
})
