import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { handleEloRows, handleMostImproved } from '../../worker/trends.js'

// The two cached trend answers, run against a real SQLite (the same engine as D1) with a stand-in for env.DB
let sqlite: DatabaseSync
const env = () => ({
  DB: {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({ all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }) }),
    }),
  },
})
const ask = (path: string) => new Request(`https://cynclan.com${path}`)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE cyn_member_snapshots (openfront_id TEXT NOT NULL, snapshot_date TEXT NOT NULL, elo INTEGER, all_wins INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, elo_2v2 INTEGER, elo_ffa INTEGER, PRIMARY KEY (openfront_id, snapshot_date))')
  const add = sqlite.prepare('INSERT INTO cyn_member_snapshots (openfront_id, snapshot_date, elo, elo_2v2, all_wins) VALUES (?, ?, ?, ?, ?)')
  // A: 100 -> 130 wins in the window, B: 50 -> 60, C: no gain, D: one row only, E: older than the window
  for (const [id, d, wins] of [['AAAA1111', '2026-10-28', 100], ['AAAA1111', '2026-11-01', 110], ['AAAA1111', '2026-11-04', 130], ['BBBB2222', '2026-10-29', 50], ['BBBB2222', '2026-11-04', 60], ['CCCC3333', '2026-10-29', 70], ['CCCC3333', '2026-11-04', 70], ['DDDD4444', '2026-11-04', 10], ['EEEE5555', '2026-09-01', 5], ['EEEE5555', '2026-09-02', 500]] as const) {
    add.run(id, d, 1000 + wins, d === '2026-11-04' ? 1500 : null, wins)
  }
})
afterEach(() => vi.useRealTimers())

describe('/api/trends/most-improved', () => {
  it('lists the members by wins gained in the window, highest first, without those who gained nothing or have one row only', async () => {
    const body = await (await handleMostImproved(ask('/api/trends/most-improved?days=7&limit=3'), env())).json()
    expect(body.list).toEqual([
      { openfrontId: 'AAAA1111', winsDelta: 30 },
      { openfrontId: 'BBBB2222', winsDelta: 10 },
    ])
  })
  it('honours the limit and falls back to the defaults for nonsense', async () => {
    expect((await (await handleMostImproved(ask('/api/trends/most-improved?limit=1'), env())).json()).list).toHaveLength(1)
    expect((await (await handleMostImproved(ask('/api/trends/most-improved?days=abc&limit=xyz'), env())).json()).list).toHaveLength(2)
  })
  it('answers 502 when the database cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleMostImproved(ask('/api/trends/most-improved'), { DB: { prepare: () => { throw new Error('D1 limit') } } })
    expect(res.status).toBe(502)
  })
})

describe('/api/trends/elo-rows', () => {
  it('gives the rows of the range as compact arrays', async () => {
    const body = await (await handleEloRows(ask('/api/trends/elo-rows?from=2026-11-01&to=2026-11-04'), env())).json()
    expect(body.rows).toHaveLength(5) // A on 11-01 and on 11-04, B, C and D on 11-04
    expect(body.rows).toContainEqual(['AAAA1111', '2026-11-04', 1130, 1500])
    expect(body.rows).toContainEqual(['AAAA1111', '2026-11-01', 1110, null])
  })
  it('keeps a range that is over in the edge cache for hours, a running one for the normal time only', async () => {
    expect((await handleEloRows(ask('/api/trends/elo-rows?from=2026-10-01&to=2026-10-31'), env())).headers.get('X-Edge-Ttl')).toBe('21600')
    expect((await handleEloRows(ask('/api/trends/elo-rows?from=2026-10-25&to=2026-11-30'), env())).headers.get('X-Edge-Ttl')).toBeNull()
  })
  it('refuses a broken or huge range', async () => {
    for (const q of ['', '?from=2026-11-01', '?from=2026-13-01&to=2026-13-02', '?from=2026-11-04&to=2026-11-01', '?from=2025-01-01&to=2026-11-01']) {
      expect((await handleEloRows(ask(`/api/trends/elo-rows${q}`), env())).status).toBe(400)
    }
  })
  it('gives an empty list, not an error, for a range without rows', async () => {
    const res = await handleEloRows(ask('/api/trends/elo-rows?from=2020-01-01&to=2020-01-31'), env())
    expect(await res.json()).toEqual({ rows: [] })
  })
})
