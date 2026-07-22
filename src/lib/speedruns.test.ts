import { describe, it, expect } from 'vitest'
import { parseGameId, verifySpeedrun, fmtTime } from './speedruns'
import type { GameDetail } from './openfront'

function makeDetail(overrides: Partial<GameDetail> = {}): GameDetail {
  return {
    gameId: 'abc123',
    map: 'Australia',
    gameType: 'Singleplayer',
    nations: 'disabled',
    bots: 5,
    durationSeconds: 189,
    numTurns: 1890,
    winnerClientId: 'client-1',
    start: 0,
    players: [{ clientID: 'client-1', username: 'Zilka', clanTag: 'CYN' }],
    ...overrides,
  }
}

describe('parseGameId', () => {
  it('extracts the id from a /game/<id> path', () => {
    expect(parseGameId('https://openfront.io/game/aBcD1234')).toBe('aBcD1234')
  })

  it('extracts the id from the replay tool link', () => {
    expect(parseGameId('https://openfront-tools.frozenpenguin.media?id=xYz789')).toBe('xYz789')
  })

  it('does not mistake the "live" query-string suffix for the id', () => {
    expect(parseGameId('https://openfront.io/w1/game/rEALid?live')).toBe('rEALid')
  })

  it('falls back to a bare id with no surrounding link', () => {
    expect(parseGameId('rEALid42')).toBe('rEALid42')
  })
})

describe('verifySpeedrun', () => {
  it('accepts a valid solo/Australia/no-nations win by the submitting name', () => {
    const result = verifySpeedrun(makeDetail(), 'Zilka')
    expect(result.ok).toBe(true)
    expect(result.seconds).toBe(189)
    expect(result.clientID).toBe('client-1')
  })

  it('is case/whitespace-insensitive when matching the submitter name', () => {
    const result = verifySpeedrun(makeDetail(), '  zilka  ')
    expect(result.ok).toBe(true)
  })

  it('rejects a map other than Australia', () => {
    const result = verifySpeedrun(makeDetail({ map: 'Asia' }), 'Zilka')
    expect(result.ok).toBe(false)
  })

  it('rejects anything other than a Singleplayer game', () => {
    const result = verifySpeedrun(makeDetail({ gameType: 'Public' }), 'Zilka')
    expect(result.ok).toBe(false)
  })

  it('rejects a game with Nations enabled', () => {
    const result = verifySpeedrun(makeDetail({ nations: 'enabled' }), 'Zilka')
    expect(result.ok).toBe(false)
  })

  it('rejects a game with no recorded winner', () => {
    const result = verifySpeedrun(makeDetail({ winnerClientId: null }), 'Zilka')
    expect(result.ok).toBe(false)
  })

  it("rejects submitting someone else's win", () => {
    const result = verifySpeedrun(makeDetail(), 'SomeoneElse')
    expect(result.ok).toBe(false)
  })

  it('rejects a win not played under the CYN tag', () => {
    const detail = makeDetail({ players: [{ clientID: 'client-1', username: 'Zilka', clanTag: null }] })
    const result = verifySpeedrun(detail, 'Zilka')
    expect(result.ok).toBe(false)
  })
})

describe('fmtTime', () => {
  it('formats seconds as m:ss', () => {
    expect(fmtTime(189)).toBe('3:09')
  })

  it('zero-pads seconds under 10', () => {
    expect(fmtTime(65)).toBe('1:05')
  })
})
