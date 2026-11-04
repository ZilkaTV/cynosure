import { describe, expect, it, vi } from 'vitest'

// The notification bell reads what was claimed to know which quests are still waiting. A failed read (the database is down, the free plan's daily
// limit is used up) used to look like "nothing claimed": every quest the member had already collected was announced again.
let failing = false
const claimRows = [
  { quest_id: 'ranked_win', claim_date: 'round-1' },
  { quest_id: 'ranked_win', claim_date: 'round-2' },
  { quest_id: 'ffa_win', claim_date: 'round-1' },
]
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => (failing ? { data: null, error: { message: 'D1 limit' } } : { data: claimRows, error: null }),
        }),
      }),
    }),
  },
}))

const { fetchClaimRounds, fetchClaimsToday } = await import('./quests')

describe('claim reads', () => {
  it('count the rounds per win quest', async () => {
    failing = false
    expect(await fetchClaimRounds('ABCD1234', true)).toEqual({ ranked_win: 2, ffa_win: 1 })
  })
  it('strict reads throw when the database fails, the plain ones keep answering "nothing"', async () => {
    failing = true
    await expect(fetchClaimRounds('ABCD1234', true)).rejects.toThrow('claims_unreadable')
    await expect(fetchClaimsToday('ABCD1234', true)).rejects.toThrow('claims_unreadable')
    expect(await fetchClaimRounds('ABCD1234')).toEqual({})
    expect((await fetchClaimsToday('ABCD1234')).size).toBe(0)
  })
})
