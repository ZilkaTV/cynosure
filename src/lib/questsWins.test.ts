import { beforeEach, describe, expect, it, vi } from 'vitest'

// a stand-in for the database: records what a claim writes
const inserted: Record<string, unknown>[] = []
let xpNow = 0
const xpWrites: number[] = []
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({}) },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === 'cyn_quest_claims') inserted.push(row)
        return { error: null }
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { xp: xpNow } }) }) }),
      upsert: async (row: { xp: number }) => {
        xpWrites.push(row.xp)
        return { error: null }
      },
    }),
  },
}))

const { QUESTS, WIN_QUEST_TARGET, WIN_QUESTS_FROM, claimQuest, winProgress } = await import('./quests')
import type { MemberStats } from './stats'

const quest = (id: string) => QUESTS.find((q) => q.id === id)!
const ctx = (rounds: Record<string, number> = {}) => ({ reactedToday: false, donated: { hasRecent: false }, rounds }) as never
const DAY = new Date(WIN_QUESTS_FROM + 3_600_000).toISOString() // an hour after the start of counting

const game = (g: Record<string, unknown>) => ({ gameId: Math.random().toString(36).slice(2), mode: 'Free For All', type: 'Public', rankedType: null, result: 'victory', totalPlayers: 40, start: DAY, ...g })
const member = (games: Record<string, unknown>[]) => ({ cynGames: games }) as unknown as MemberStats
const many = (n: number, g: Record<string, unknown> = {}) => Array.from({ length: n }, () => game(g))

describe('win quests: 0/10, claim, on to the next round', () => {
  it('counts public FFA wins with 10+ players and ranked FFA wins', () => {
    const m = member([...many(4), ...many(3, { rankedType: 'ffa', totalPlayers: 6 }), ...many(2, { totalPlayers: 9 }), ...many(2, { type: 'Private' }), ...many(2, { type: 'Singleplayer' }), ...many(2, { result: 'defeat' })])
    const p = winProgress(quest('ffa_win'), m, {}, ctx())
    expect(p).toMatchObject({ total: 7, value: 7, target: WIN_QUEST_TARGET, ready: false })
  })
  it('does not count wins from before the counting started', () => {
    const m = member(many(10, { start: new Date(WIN_QUESTS_FROM - 60_000).toISOString() }))
    expect(winProgress(quest('ffa_win'), m, {}, ctx()).total).toBe(0)
  })
  it('is ready at 10 wins', () => {
    expect(quest('ffa_win').check(member(many(9)), {}, ctx())).toBe(false)
    expect(quest('ffa_win').check(member(many(10)), {}, ctx())).toBe(true)
  })
  it('starts the next round after a claim', () => {
    const q = quest('ffa_win')
    expect(winProgress(q, member(many(10)), {}, ctx({ ffa_win: 1 }))).toMatchObject({ value: 0, ready: false, rounds: 1 })
    expect(winProgress(q, member(many(14)), {}, ctx({ ffa_win: 1 }))).toMatchObject({ value: 4, ready: false })
    // wins that were not claimed yet pile up: two full rounds are two claims
    expect(winProgress(q, member(many(25)), {}, ctx({ ffa_win: 1 }))).toMatchObject({ value: 10, ready: true })
    expect(winProgress(q, member(many(25)), {}, ctx({ ffa_win: 2 }))).toMatchObject({ value: 5, ready: false })
  })
  it('counts team wins only with another [CYN] member and 10+ players', () => {
    const t = (extra: Record<string, unknown> = {}) => game({ mode: 'Team', gameId: Math.random().toString(36).slice(2), ...extra })
    const games = [t(), t(), t({ totalPlayers: 8 }), t()]
    const coop = Object.fromEntries([games[0], games[1], games[2]].map((g) => [g.gameId as string, true]))
    expect(winProgress(quest('team_win_friend'), member(games), coop, ctx()).total).toBe(2)
  })
  it('counts ranked 1v1 and ranked 2v2 wins separately', () => {
    const m = member([...many(3, { mode: 'Free For All', rankedType: '1v1', totalPlayers: 2 }), ...many(5, { mode: 'Team', rankedType: '2v2', totalPlayers: 4 })])
    expect(winProgress(quest('ranked_win'), m, {}, ctx()).total).toBe(3)
    expect(winProgress(quest('ranked_2v2_win'), m, {}, ctx()).total).toBe(5)
  })
})

describe('claiming a win quest', () => {
  beforeEach(() => {
    inserted.length = 0
    xpWrites.length = 0
    xpNow = 40
  })
  it('stores the round as the claim key and pays the XP', async () => {
    const r = await claimQuest('ABCD1234', quest('ranked_win'), member(many(10, { mode: 'Free For All', rankedType: '1v1', totalPlayers: 2 })), {}, ctx({ ranked_win: 2 }) as never)
    // 10 wins but 2 rounds claimed before: nothing to claim
    expect(r.ok).toBe(false)
    const r2 = await claimQuest('ABCD1234', quest('ranked_win'), member(many(30, { mode: 'Free For All', rankedType: '1v1', totalPlayers: 2 })), {}, ctx({ ranked_win: 2 }) as never)
    expect(r2.ok).toBe(true)
    expect(inserted).toEqual([{ openfront_id: 'ABCD1234', quest_id: 'ranked_win', claim_date: 'round-3' }])
    expect(xpWrites).toEqual([40 + quest('ranked_win').xp])
  })
  it('refuses to claim before 10 wins', async () => {
    const r = await claimQuest('ABCD1234', quest('ffa_win'), member(many(9)), {}, ctx() as never)
    expect(r.ok).toBe(false)
    expect(inserted).toHaveLength(0)
  })
})
