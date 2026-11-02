import { beforeEach, describe, expect, it, vi } from 'vitest'

// buildRoster with a stand-in for OpenFront: which members get their newest games asked directly
const batch = vi.fn()
const recent = vi.fn()
vi.mock('./openfront', () => ({
  fetchRosterDetailsBatch: async () => new Map(),
  fetchPlayerGamesBatch: (ids: string[]) => batch(ids),
  fetchRankedMap: async () => ({ oneVOne: new Map(), twoVTwo: new Map(), ffa: new Map() }),
  fetchRecentPlayerGames: (id: string) => recent(id),
}))

const { buildRoster } = await import('./stats')

const member = (id: string) => ({ openfront_id: id, in_game_name: id, timezone: 'UTC', claimed: true })
const game = (gameId: string) => ({ gameId, start: new Date().toISOString(), durationSeconds: 300, mode: 'Team', type: 'Public', rankedType: '2v2', result: 'victory', totalPlayers: 4, clanTag: 'CYN', username: 'x' })

describe('buildRoster: a member without a shared game list', () => {
  beforeEach(() => {
    batch.mockReset()
    recent.mockReset()
  })

  it('asks OpenFront directly for the newest games of the one member who has no list', async () => {
    batch.mockResolvedValue({ AAAA1111: [game('g0')] })
    recent.mockResolvedValue([game('g1'), game('g2')])
    const r = await buildRoster([member('AAAA1111'), member('NEWW2222')])
    expect(recent).toHaveBeenCalledTimes(1)
    expect(recent).toHaveBeenCalledWith('NEWW2222')
    expect(r.members.find((m) => m.publicId === 'NEWW2222')?.cynGames).toHaveLength(2)
  })

  it('asks once per page session only', async () => {
    batch.mockResolvedValue({ AAAA1111: [game('g0')] })
    recent.mockResolvedValue([game('g1')])
    await buildRoster([member('AAAA1111'), member('NEWW3333')])
    await buildRoster([member('AAAA1111'), member('NEWW3333')])
    expect(recent).toHaveBeenCalledTimes(1)
  })

  it('does not ask for a crowd of members (the shared store is down then)', async () => {
    batch.mockResolvedValue({})
    recent.mockResolvedValue([])
    await buildRoster(['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => member(id + 'XXXXXX')))
    expect(recent).not.toHaveBeenCalled()
  })

  it('keeps the member without games when OpenFront cannot be reached', async () => {
    batch.mockResolvedValue({ AAAA1111: [game('g0')] })
    recent.mockRejectedValue(new Error('offline'))
    const r = await buildRoster([member('AAAA1111'), member('NEWW4444')])
    expect(r.members.find((m) => m.publicId === 'NEWW4444')?.cynGames).toHaveLength(0)
  })
})
