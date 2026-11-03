import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPlayerGamesBatch } from './openfront'

afterEach(() => vi.unstubAllGlobals())

// If the shared game lists cannot be read (the database is down, the free plan's daily limit is used up ...) this is an error. An empty answer used to give a
// roster in which every member had 0 games: every member was locked out by the 7-day rule, and that roster was saved as the last good copy.
describe('fetchPlayerGamesBatch when /api/member-games fails', () => {
  it('throws on a 502', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'member_games_unavailable' }), { status: 502 }))
    await expect(fetchPlayerGamesBatch(['FAIL0001', 'FAIL0002'])).rejects.toThrow('member_games_502')
  })
  it('throws when the Worker cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network')
    })
    await expect(fetchPlayerGamesBatch(['FAIL0003'])).rejects.toThrow('member_games_unreachable')
  })
  it('still answers with the lists that exist (a member without a list is simply missing)', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ OKAY0001: [{ gameId: 'g1', start: '2026-11-01T10:00:00.000Z', clanTag: 'CYN', result: 'victory' }] }), { status: 200 }))
    const r = await fetchPlayerGamesBatch(['OKAY0001', 'NONE0001'])
    expect(Object.keys(r)).toEqual(['OKAY0001'])
  })
})
