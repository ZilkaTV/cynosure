import { describe, expect, it } from 'vitest'
// @ts-expect-error the Worker modules are plain JavaScript without type declarations
import { syncClanDonors, renewedCookie } from '../../worker/donorBot.js'

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
function fakeOpenFront(opts: { goodCookie: string; renew?: string; notInClan?: boolean }) {
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
