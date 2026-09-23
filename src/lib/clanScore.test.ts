import { describe, it, expect } from 'vitest'
import { clanSessionScore, deriveNumTeams, isClanScoreEligible, buildClanScoreLedger } from './clanScore'

describe('deriveNumTeams', () => {
  it('reads a literal numeric team count straight through', () => {
    expect(deriveNumTeams('2', 4)).toBe(2)
    expect(deriveNumTeams('63', 400)).toBe(63)
  })
  it('derives team count from a fixed size preset', () => {
    expect(deriveNumTeams('Trios', 24)).toBe(8) // 24 / 3
    expect(deriveNumTeams('Duos', 10)).toBe(5)
    expect(deriveNumTeams('Quads', 20)).toBe(5)
  })
  it('excludes Humans Vs Nations entirely', () => {
    expect(deriveNumTeams('Humans Vs Nations', 100)).toBeNull()
  })
  it('returns null when it cannot determine a team count', () => {
    expect(deriveNumTeams(null, 10)).toBeNull()
    expect(deriveNumTeams('Quads', null)).toBeNull()
  })
})

describe('clanSessionScore', () => {
  it('matches a hand-computed 2v2 win', () => {
    // 4 players, 2 teams, both CYN on the winning team.
    const score = clanSessionScore({ totalPlayerCount: 4, numTeams: 2, clanPlayerCount: 2, won: true })
    // avgTeamSize = 2, ratio = 1, difficulty = max(1, sqrt(1)) = 1 -> score = 1
    expect(score).toBeCloseTo(1, 5)
  })
  it('rewards winning a game with more teams more (difficulty scales with team count)', () => {
    // totalPlayerCount scaled with numTeams so avgTeamSize (and clanMemberRatio) stays identical in both - isolates the difficulty effect alone.
    const twoTeams = clanSessionScore({ totalPlayerCount: 8, numTeams: 2, clanPlayerCount: 2, won: true })
    const fourTeams = clanSessionScore({ totalPlayerCount: 16, numTeams: 4, clanPlayerCount: 2, won: true })
    expect(fourTeams).toBeGreaterThan(twoTeams)
  })
  it('punishes a loss less in a harder (more-teams) match', () => {
    const lossEasy = clanSessionScore({ totalPlayerCount: 8, numTeams: 2, clanPlayerCount: 2, won: false })
    const lossHard = clanSessionScore({ totalPlayerCount: 16, numTeams: 4, clanPlayerCount: 2, won: false })
    expect(lossHard).toBeLessThan(lossEasy)
  })
  it('never lets difficulty drop below 1 even for a 1-team edge case', () => {
    const score = clanSessionScore({ totalPlayerCount: 4, numTeams: 1, clanPlayerCount: 4, won: true })
    // avgTeamSize = 4, ratio = 1, difficulty = max(1, sqrt(0)) = 1 -> score = 1
    expect(score).toBeCloseTo(1, 5)
  })
})

describe('isClanScoreEligible', () => {
  it('accepts a real Team game with a determinable team count', () => {
    expect(isClanScoreEligible({ mode: 'Team', playerTeams: 'Trios', totalPlayers: 24 })).toBe(true)
  })
  it('rejects non-Team modes', () => {
    expect(isClanScoreEligible({ mode: 'Free For All', playerTeams: '4', totalPlayers: 20 })).toBe(false)
  })
  it('rejects Humans Vs Nations', () => {
    expect(isClanScoreEligible({ mode: 'Team', playerTeams: 'Humans Vs Nations', totalPlayers: 100 })).toBe(false)
  })
})

describe('buildClanScoreLedger', () => {
  it('accumulates weighted wins/losses in chronological order and computes before/after ratios', () => {
    const ledger = buildClanScoreLedger([
      { gameId: 'b', start: '2026-01-02T00:00:00Z', playerTeams: '2', totalPlayers: 4, clanPlayerCount: 2, won: true },
      { gameId: 'a', start: '2026-01-01T00:00:00Z', playerTeams: '2', totalPlayers: 4, clanPlayerCount: 2, won: false },
    ])
    // Re-sorted chronologically: 'a' (loss) first, then 'b' (win).
    expect(ledger.map((e) => e.gameId)).toEqual(['a', 'b'])

    expect(ledger[0].ratioBefore).toBeNull() // no losses recorded yet
    expect(ledger[0].cumWeightedLosses).toBeCloseTo(1, 5)
    expect(ledger[0].ratioAfter).toBe(0) // 0 wins / 1 loss

    expect(ledger[1].ratioBefore).toBe(0)
    expect(ledger[1].cumWeightedWins).toBeCloseTo(1, 5)
    expect(ledger[1].ratioAfter).toBeCloseTo(1, 5) // 1 win / 1 loss
  })

  it('skips games with no CYN players or an undeterminable team count', () => {
    const ledger = buildClanScoreLedger([
      { gameId: 'x', start: '2026-01-01T00:00:00Z', playerTeams: '2', totalPlayers: 4, clanPlayerCount: 0, won: true },
      { gameId: 'y', start: '2026-01-02T00:00:00Z', playerTeams: 'Humans Vs Nations', totalPlayers: 100, clanPlayerCount: 5, won: true },
    ])
    expect(ledger).toHaveLength(0)
  })
})
