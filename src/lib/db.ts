// The site's data client. It keeps the call style of the Supabase client it replaced
// (db.from('table').select(...).eq(...)), but every call is sent to the Worker (/api/db, worker/dbApi.js), which
// runs it against Cloudflare D1 after applying the access rules. The session is the signed HttpOnly cookie the
// Worker sets after the Discord sign-in - this file never sees a token.

export interface DbErrorShape {
  code: string
  message: string
}

export class DbError extends Error {
  code: string
  constructor(e: DbErrorShape) {
    super(e.message)
    this.code = e.code
  }
}

export interface DbResult<T = any> {
  data: T
  error: DbError | null
  count: number | null
}

type Filter = { col: string; op: string; val: unknown }

class Query implements PromiseLike<DbResult> {
  private q: Record<string, unknown> & { filters: Filter[]; order: { col: string; asc: boolean }[] }

  constructor(table: string) {
    this.q = { table, op: 'select', select: '*', filters: [], order: [] }
  }

  select(columns = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    // After insert/upsert/update, select() asks for the written rows back instead of starting a read.
    if (this.q.op === 'select') {
      this.q.select = columns
      if (opts?.count) this.q.count = true
      if (opts?.head) this.q.head = true
    } else {
      this.q.returning = true
    }
    return this
  }

  insert(values: unknown) {
    this.q.op = 'insert'
    this.q.values = values
    return this
  }

  upsert(values: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.q.op = 'upsert'
    this.q.values = values
    if (opts?.onConflict) this.q.onConflict = opts.onConflict
    if (opts?.ignoreDuplicates) this.q.ignoreDuplicates = true
    return this
  }

  update(values: unknown) {
    this.q.op = 'update'
    this.q.values = values
    return this
  }

  delete() {
    this.q.op = 'delete'
    return this
  }

  private f(op: string, col: string, val?: unknown) {
    this.q.filters.push({ col, op, val })
    return this
  }
  eq(col: string, val: unknown) {
    return this.f('eq', col, val)
  }
  neq(col: string, val: unknown) {
    return this.f('neq', col, val)
  }
  gt(col: string, val: unknown) {
    return this.f('gt', col, val)
  }
  gte(col: string, val: unknown) {
    return this.f('gte', col, val)
  }
  lt(col: string, val: unknown) {
    return this.f('lt', col, val)
  }
  lte(col: string, val: unknown) {
    return this.f('lte', col, val)
  }
  in(col: string, vals: unknown[]) {
    return this.f('in', col, vals)
  }
  is(col: string, val: null) {
    return this.f('is', col, val)
  }
  like(col: string, val: string) {
    return this.f('like', col, val)
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.q.order.push({ col, asc: opts?.ascending !== false })
    return this
  }

  limit(n: number) {
    this.q.limit = n
    return this
  }

  range(from: number, to: number) {
    this.q.offset = from
    this.q.limit = to - from + 1
    return this
  }

  single() {
    this.q.single = 'single'
    return this
  }

  maybeSingle() {
    this.q.single = 'maybe'
    return this
  }

  private async run(): Promise<DbResult> {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.q),
      })
      if (!res.ok) return { data: null, error: new DbError({ code: 'HTTP', message: `request failed (${res.status})` }), count: null }
      const body = (await res.json()) as { data: unknown; error: DbErrorShape | null; count?: number | null }
      return { data: body.data ?? null, error: body.error ? new DbError(body.error) : null, count: body.count ?? null }
    } catch (err) {
      return { data: null, error: new DbError({ code: 'NETWORK', message: String((err as Error)?.message ?? err) }), count: null }
    }
  }

  then<R1 = DbResult, R2 = never>(onfulfilled?: ((value: DbResult) => R1 | PromiseLike<R1>) | null, onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null) {
    return this.run().then(onfulfilled, onrejected)
  }
}

// ── session ─────────────────────────────────────────────────────────────────
/** Shaped like the session object the rest of the site already reads (user.id, user.user_metadata, user.identities). */
export interface Session {
  user: {
    id: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user_metadata: Record<string, any>
    identities: { provider: string; id: string }[]
  }
}

export async function fetchSession(): Promise<Session | null> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return null
    const { user } = (await res.json()) as { user: { id: string; username: string; globalName: string | null; avatar: string | null } | null }
    if (!user) return null
    return {
      user: {
        id: user.id,
        user_metadata: { full_name: user.username, provider_id: user.id, avatar_url: user.avatar, custom_claims: { global_name: user.globalName } },
        identities: [{ provider: 'discord', id: user.id }],
      },
    }
  } catch {
    return null
  }
}

/** Fired after the session changed (sign-out); useSession listens and reloads it. */
export const SESSION_EVENT = 'cyn:session-changed'

export const db = {
  from: (table: string) => new Query(table),
  rpc: (fn: string): PromiseLike<DbResult> => ({
    then: (ok, bad) =>
      fetch('/api/db/rpc', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn }) })
        .then((r) => r.json())
        .then((b: { data: unknown; error: DbErrorShape | null }) => ({ data: b.data ?? null, error: b.error ? new DbError(b.error) : null, count: null }) as DbResult)
        .catch((err) => ({ data: null, error: new DbError({ code: 'NETWORK', message: String(err?.message ?? err) }), count: null }) as DbResult)
        .then(ok, bad),
  }),
  auth: {
    /** Same shape as before: { data: { session } }. */
    getSession: async () => ({ data: { session: await fetchSession() }, error: null }),
    signOut: async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
      window.dispatchEvent(new Event(SESSION_EVENT))
    },
  },
}
