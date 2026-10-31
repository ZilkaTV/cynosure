import { describe, expect, it } from 'vitest'
// @ts-expect-error the Worker modules are plain JavaScript without type declarations
import { syncClanDonors, renewedCookie, cleanMember, cleanGame, diffMembers } from '../../worker/donorBot.js'

/** The hot database as far as the bot uses it: the blobs table. */
function fakeDb() {
  const rows = new Map<string, string>()
  return {
    rows,
    prepare(sql: string) {
      return {
        bind(...args: string[]) {
          return {
            first: async () => (sql.startsWith('SELECT') ? (rows.has(args[0]) ? { value: rows.get(args[0]) } : null) : null),
            run: async () => {
              if (sql.startsWith('INSERT')) rows.set(args[0], args[1])
            },
          }
        },
      }
    },
  }
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init })

/** A fake OpenFront API: accepts one login cookie, hands out a renewed one, answers the donation lists. */
const MEMBERS = [
  { publicId: 'AAAA1111', username: 'CYN Calos', role: 'leader', joinedAt: '2026-01-02T10:00:00.000Z', stats: { total: { wins: 5, losses: 2 }, '3': { wins: 1, losses: 1 } }, eloContributed: 12 },
  { publicId: 'BBBB2222', username: 'Chuma', role: 'member', joinedAt: '2026-02-03T10:00:00.000Z', stats: { total: { wins: 0, losses: 0 } } },
]
const GAME = (id: string, start: string) => ({
  gameId: id,
  start,
  map: 'Europe',
  result: 'victory',
  durationSeconds: 600,
  rankedType: 'unranked',
  totalPlayers: 40,
  clanPlayers: [{ publicId: 'AAAA1111', username: 'CYN Calos', verified: true, won: true }],
})
function fakeOpenFront(opts: { goodCookie: string; renew?: string; notInClan?: boolean; members?: unknown[]; gamePages?: unknown[][] }) {
  const calls: string[] = []
  const f = async (url: string, init?: RequestInit) => {
    calls.push(url)
    const headers = new Headers(init?.headers)
    if (url.endsWith('/auth/refresh')) {
      if (headers.get('Cookie') !== opts.goodCookie) return new Response('{}', { status: 401 })
      const h = new Headers({ 'Content-Type': 'application/json' })
      if (opts.renew) h.append('set-cookie', `${opts.renew}; Path=/; HttpOnly`)
      return new Response(JSON.stringify({ jwt: 'jwt-1', expiresIn: 900 }), { status: 200, headers: h })
    }
    if (headers.get('Authorization') !== 'Bearer jwt-1') return new Response('{}', { status: 401 })
    if (opts.notInClan) return new Response('{}', { status: 403 })
    if (url.includes('/members')) return json({ results: opts.members ?? MEMBERS, total: (opts.members ?? MEMBERS).length, pendingRequests: 2 })
    if (url.includes('/games')) {
      const pages = opts.gamePages ?? [[GAME('gameAAA1', '2026-10-30T10:00:00Z')]]
      const at = url.includes('cursor=') ? Number(new URL(url).searchParams.get('cursor')) : 0
      return json({ results: pages[at], nextCursor: at + 1 < pages.length ? String(at + 1) : null })
    }
    if (url.includes('/donations/leaderboard')) {
      return json({ results: [{ playerId: 'AAAA1111', username: 'Calos', total: 5000, donations: 3 }, { playerId: 'BBBB2222', username: null, total: '70', donations: 1 }], total: 2 })
    }
    return json({ results: [{ createdBy: 'AAAA1111', createdAt: '2026-10-30T07:21:00Z', currencyType: 'soft', amount: 10000 }], total: 1 })
  }
  return { f: f as unknown as typeof fetch, calls }
}

describe('the CYN donor bot', () => {
  it('does nothing without its cookie secret', async () => {
    const api = fakeOpenFront({ goodCookie: 'tok=a' })
    expect(await syncClanDonors({ HOT_DB: fakeDb() }, api.f)).toBeNull()
    expect(api.calls).toHaveLength(0)
  })

  it('logs in, reads the rankings and stores them with the status', async () => {
    const db = fakeDb()
    const api = fakeOpenFront({ goodCookie: 'tok=a' })
    const out = await syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=a' }, api.f)
    expect(out).toEqual({ ok: true, message: 'ok' })
    const doc = JSON.parse(db.rows.get('clan-donors')!)
    expect(doc.by).toBe('bot')
    expect(doc.boards.soft.all.map((r: { playerId: string }) => r.playerId)).toEqual(['AAAA1111', 'BBBB2222'])
    expect(doc.boards.soft.all[0].total).toBe('5000')
    expect(doc.recent[0]).toMatchObject({ playerId: 'AAAA1111', currency: 'soft', amount: '10000' })
    expect(JSON.parse(db.rows.get('donor-bot-status')!)).toMatchObject({ ok: true })
  })

  it('reports a dead cookie instead of throwing', async () => {
    const db = fakeDb()
    const api = fakeOpenFront({ goodCookie: 'tok=a' })
    const out = await syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=expired' }, api.f)
    expect(out).toEqual({ ok: false, message: 'cookie_expired' })
    expect(JSON.parse(db.rows.get('donor-bot-status')!)).toMatchObject({ ok: false, message: 'cookie_expired' })
    expect(db.rows.has('clan-donors')).toBe(false)
  })

  it('says so when the bot is not in the clan', async () => {
    const db = fakeDb()
    const api = fakeOpenFront({ goodCookie: 'tok=a', notInClan: true })
    expect(await syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=a' }, api.f)).toEqual({ ok: false, message: 'not_in_clan' })
  })

  it('keeps a renewed cookie and uses it next time', async () => {
    const db = fakeDb()
    const first = fakeOpenFront({ goodCookie: 'tok=a', renew: 'tok=b' })
    await syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=a' }, first.f)
    // the old cookie is dead now, only the renewed one works
    const second = fakeOpenFront({ goodCookie: 'tok=b' })
    expect(await syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=a' }, second.f)).toEqual({ ok: true, message: 'ok' })
    // a new secret starts over (the stored cookie belongs to the old one)
    const third = fakeOpenFront({ goodCookie: 'tok=c' })
    expect(await syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=c' }, third.f)).toEqual({ ok: true, message: 'ok' })
  })
})

describe('the CYN bot: clan members and games', () => {
  const run = (db: ReturnType<typeof fakeDb>, api: ReturnType<typeof fakeOpenFront>) => syncClanDonors({ HOT_DB: db, OPENFRONT_BOT_COOKIE: 'tok=a' }, api.f)

  it('stores the member list and the games, and says which fields it saw', async () => {
    const db = fakeDb()
    expect(await run(db, fakeOpenFront({ goodCookie: 'tok=a' }))).toEqual({ ok: true, message: 'ok' })
    const members = JSON.parse(db.rows.get('clan-members')!)
    expect(members.members.map((m: { publicId: string }) => m.publicId)).toEqual(['AAAA1111', 'BBBB2222'])
    expect(members.members[0]).toMatchObject({ role: 'leader', eloContributed: 12 })
    expect(members.pendingRequests).toBe(2)
    expect(members.events).toEqual([]) // the first run has nothing to compare with
    const games = JSON.parse(db.rows.get('clan-games')!)
    expect(games.games[0]).toMatchObject({ gameId: 'gameAAA1', result: 'victory', rankedType: null, totalPlayers: 40 })
    expect(games.games[0].clanPlayers).toEqual([{ publicId: 'AAAA1111', username: 'CYN Calos', won: true }])
    const status = JSON.parse(db.rows.get('donor-bot-status')!)
    expect(status.parts).toEqual({ donors: 'ok', members: 'ok', games: 'ok' })
    expect(status.shape.members).toContain('publicId')
  })

  it('notes who joined, left or was promoted between two runs', async () => {
    const db = fakeDb()
    await run(db, fakeOpenFront({ goodCookie: 'tok=a' }))
    const next = [{ ...MEMBERS[0], role: 'officer' }, { publicId: 'CCCC3333', username: 'New', role: 'member', joinedAt: '2026-10-31T10:00:00Z' }]
    // Chuma left, Calos got another role, New joined
    await run(db, fakeOpenFront({ goodCookie: 'tok=a', members: [...next, MEMBERS[1], { publicId: 'DDDD4444', username: 'D', role: 'member' }].filter((m) => m.publicId !== 'BBBB2222') }))
    const events = JSON.parse(db.rows.get('clan-members')!).events as { type: string; playerId: string }[]
    expect(events.map((e) => e.type + ':' + e.playerId).sort()).toEqual(['joined:CCCC3333', 'joined:DDDD4444', 'left:BBBB2222', 'role:AAAA1111'])
  })

  it('does not take a much shorter list for half the clan leaving', async () => {
    const db = fakeDb()
    const many = Array.from({ length: 10 }, (_, i) => ({ publicId: 'P' + String(i).padStart(7, '0'), username: 'p' + i, role: 'member', joinedAt: '2026-01-01T00:00:00Z' }))
    await run(db, fakeOpenFront({ goodCookie: 'tok=a', members: many }))
    const out = await run(db, fakeOpenFront({ goodCookie: 'tok=a', members: many.slice(0, 3) }))
    expect(out).toEqual({ ok: false, message: 'members_incomplete' })
    expect(JSON.parse(db.rows.get('clan-members')!).members).toHaveLength(10)
  })

  it('reads several pages of games and keeps the older ones it already had', async () => {
    const db = fakeDb()
    await run(db, fakeOpenFront({ goodCookie: 'tok=a', gamePages: [[GAME('gameOLD1', '2026-10-01T10:00:00Z')]] }))
    await run(db, fakeOpenFront({ goodCookie: 'tok=a', gamePages: [[GAME('gameNEW1', '2026-10-31T10:00:00Z')], [GAME('gameMID1', '2026-10-15T10:00:00Z')]] }))
    const ids = JSON.parse(db.rows.get('clan-games')!).games.map((g: { gameId: string }) => g.gameId)
    expect(ids).toEqual(['gameNEW1', 'gameMID1', 'gameOLD1'])
  })

  it('one failing part does not stop the others', async () => {
    const db = fakeDb()
    const api = fakeOpenFront({ goodCookie: 'tok=a', members: [{ nonsense: true }] })
    const out = await run(db, api)
    expect(out).toEqual({ ok: false, message: 'members_empty' })
    expect(db.rows.has('clan-donors')).toBe(true)
    expect(db.rows.has('clan-games')).toBe(true)
  })

  it('rebuilds every field and drops what does not look right', () => {
    expect(cleanMember({ publicId: 'bad id!', username: 'x' })).toBeNull()
    expect(cleanMember({ publicId: 'AAAA1111', username: 'x'.repeat(100), role: 'god', stats: { total: { wins: 'many', losses: 1 }, ok: { wins: 1, losses: 2 } } })).toEqual({
      publicId: 'AAAA1111',
      username: 'x'.repeat(60),
      role: 'member',
      joinedAt: null,
      stats: { ok: { wins: 1, losses: 2 } },
    })
    expect(cleanGame({ gameId: '!' })).toBeNull()
    const g = cleanGame({ gameId: 'gameAAA1', start: 1_700_000_000_000, result: 'whatever', durationSeconds: -5, clanPlayers: [{ publicId: '<script>' }, { publicId: 'AAAA1111', won: 1 }] })
    expect(g).toMatchObject({ result: 'defeat', durationSeconds: null, start: '2023-11-14T22:13:20.000Z' })
    expect(g.clanPlayers).toEqual([{ publicId: 'AAAA1111', username: null, won: true }])
    expect(diffMembers([], [{ publicId: 'AAAA1111', username: 'a', role: 'member' }], 'now')).toEqual([])
  })
})

describe('renewedCookie', () => {
  const res = (...lines: string[]) => {
    const h = new Headers()
    lines.forEach((l) => h.append('set-cookie', l))
    return new Response('', { headers: h })
  }
  it('replaces only cookies that were already there', () => {
    expect(renewedCookie('a=1; b=2', res('a=9; Path=/', 'c=3'))).toBe('a=9; b=2')
  })
  it('is null when nothing changed', () => {
    expect(renewedCookie('a=1', res('a=1; Path=/'))).toBeNull()
    expect(renewedCookie('a=1', res())).toBeNull()
  })
})
