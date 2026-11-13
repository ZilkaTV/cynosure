import { describe, it, expect } from 'vitest'
import { extractInfo, tallyPeople, tallyMaps, tallySizes, type RawGame, type RankedGameInfo } from './rankedStats'

const game = (o: Record<string, unknown> = {}) => ({ gameId: 'g1', start: '2026-11-10T12:00:00Z', result: 'victory' as const, username: 'Me', clanTag: 'CYN', rankedType: '1v1', map: 'Europe', ...o })
const p = (id: string, username: string, extra: Record<string, unknown> = {}) => ({ clientID: id, username, clanTag: null, publicID: `pub-${id}`, ...extra })

describe('extractInfo', () => {
  it('1v1: the other player is the opponent, map and size come from the report', () => {
    const raw: RawGame = { players: [p('a', 'Me', { publicID: 'ME' }), p('b', 'Rival')], winners: ['a'], map: 'Africa', mapSize: 'Compact' }
    const i = extractInfo(game(), 'ME', raw)!
    expect(i.ladder).toBe('1v1')
    expect(i.opponents).toEqual([{ key: 'pub-b', name: 'Rival' }])
    expect(i.map).toBe('Africa')
    expect(i.mapSize).toBe('Compact')
    expect(i.won).toBe(true)
  })
  it('finds the member by in-game name when the report has no public id', () => {
    const raw: RawGame = { players: [{ clientID: 'a', username: 'Me', clanTag: 'CYN' }, { clientID: 'b', username: 'Rival' }], winners: [], map: '', mapSize: null }
    expect(extractInfo(game({ result: 'defeat' }), 'ME', raw)?.opponents[0].name).toBe('Rival')
  })
  it('2v2 with team indexes: partner is on my team, the others are the opponents', () => {
    const raw: RawGame = {
      players: [p('a', 'Me', { publicID: 'ME', teamIndex: 0 }), p('b', 'Mate', { teamIndex: 0 }), p('c', 'Foe1', { teamIndex: 1 }), p('d', 'Foe2', { teamIndex: 1 })],
      winners: ['c', 'd'],
      map: 'Asia',
      mapSize: 'Normal',
    }
    const i = extractInfo(game({ rankedType: '2v2', result: 'defeat' }), 'ME', raw)!
    expect(i.partner?.name).toBe('Mate')
    expect(i.opponents.map((o) => o.name)).toEqual(['Foe1', 'Foe2'])
  })
  it('2v2 without team indexes: the winners (or the non-winners after a defeat) are my team', () => {
    const players = [p('a', 'Me', { publicID: 'ME' }), p('b', 'Mate'), p('c', 'Foe1'), p('d', 'Foe2')]
    const win = extractInfo(game({ rankedType: '2v2' }), 'ME', { players, winners: ['a', 'b'], map: '', mapSize: null })!
    expect(win.partner?.name).toBe('Mate')
    const loss = extractInfo(game({ rankedType: '2v2', result: 'defeat' }), 'ME', { players, winners: ['c', 'd'], map: '', mapSize: null })!
    expect(loss.partner?.name).toBe('Mate')
    expect(loss.opponents.map((o) => o.name)).toEqual(['Foe1', 'Foe2'])
  })
  it('returns null for other ladders and when the member is not among the players', () => {
    expect(extractInfo(game({ rankedType: 'unranked' }), 'ME', { players: [], winners: [], map: '', mapSize: null })).toBeNull()
    expect(extractInfo(game({ username: 'Nobody', clanTag: 'X' }), 'ME', { players: [p('b', 'Rival')], winners: [], map: '', mapSize: null })).toBeNull()
  })
})

describe('tallies', () => {
  const info = (o: Partial<RankedGameInfo>): RankedGameInfo => ({ gameId: 'x', ladder: '1v1', start: 1, map: 'Europe', mapSize: 'Compact', won: true, opponents: [{ key: 'r', name: 'Rival' }], partner: null, ...o })
  it('counts games and wins per opponent, most games first', () => {
    const t = tallyPeople([info({ gameId: '1' }), info({ gameId: '2', won: false }), info({ gameId: '3', opponents: [{ key: 's', name: 'Other' }] })], (i) => i.opponents)
    expect(t.map((x) => [x.name, x.games, x.wins])).toEqual([['Rival', 2, 1], ['Other', 1, 1]])
    expect(t[0].list).toHaveLength(2)
  })
  it('groups maps with their mode and sums Compact against Normal', () => {
    const infos = [info({ gameId: '1' }), info({ gameId: '2', mapSize: 'Normal', won: false }), info({ gameId: '3', map: 'Asia' })]
    expect(tallyMaps(infos).map((x) => x.name).sort()).toEqual(['Asia · Compact', 'Europe · Compact', 'Europe · Normal'])
    expect(tallySizes(infos).map((x) => [x.name, x.games, x.wins])).toEqual([['Compact', 2, 2], ['Normal', 1, 0]])
  })
})
