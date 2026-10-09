// Client for the user-data D1 database ("cynosure") for the GitHub Actions scripts. It has the same call style as the
// Supabase client the scripts used before (usersDb.from('cyn_members').select(...).eq(...)), but talks to the Worker's
// internal query endpoint (worker/usersApi.js -> worker/dbApi.js, service mode: no access rules) with HOT_API_SECRET.

const SECRET = process.env.HOT_API_SECRET
const BASE = process.env.HOT_API_BASE || 'https://cynosure.xa9087dwbu5631opu09x357q2.workers.dev'

export const usersDbEnabled = () => Boolean(SECRET)

class Query {
  constructor(table) {
    this.q = { table, op: 'select', select: '*', filters: [], order: [] }
  }
  select(columns = '*', opts) {
    if (this.q.op === 'select') {
      this.q.select = columns
      if (opts?.count) this.q.count = true
      if (opts?.head) this.q.head = true
    } else this.q.returning = true
    return this
  }
  insert(values) {
    this.q.op = 'insert'
    this.q.values = values
    return this
  }
  upsert(values, opts) {
    this.q.op = 'upsert'
    this.q.values = values
    if (opts?.onConflict) this.q.onConflict = opts.onConflict
    if (opts?.ignoreDuplicates) this.q.ignoreDuplicates = true
    return this
  }
  update(values) {
    this.q.op = 'update'
    this.q.values = values
    return this
  }
  delete() {
    this.q.op = 'delete'
    return this
  }
  f(op, col, val) {
    this.q.filters.push({ col, op, val })
    return this
  }
  eq(col, val) {
    return this.f('eq', col, val)
  }
  neq(col, val) {
    return this.f('neq', col, val)
  }
  gt(col, val) {
    return this.f('gt', col, val)
  }
  gte(col, val) {
    return this.f('gte', col, val)
  }
  lt(col, val) {
    return this.f('lt', col, val)
  }
  lte(col, val) {
    return this.f('lte', col, val)
  }
  notNull(col) {
    return this.f('is', col, '__not_null__')
  }
  in(col, vals) {
    return this.f('in', col, vals)
  }
  is(col, val) {
    return this.f('is', col, val)
  }
  order(col, opts) {
    this.q.order.push({ col, asc: opts?.ascending !== false })
    return this
  }
  limit(n) {
    this.q.limit = n
    return this
  }
  range(from, to) {
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
  async run() {
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${BASE}/api/internal/users/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', 'User-Agent': 'CynosureCron/1.0' },
          body: JSON.stringify(this.q),
          signal: AbortSignal.timeout(60000),
        })
        if (!res.ok) throw new Error(`users api -> ${res.status}`)
        const body = await res.json()
        return { data: body.data ?? null, error: body.error ? Object.assign(new Error(body.error.message), { code: body.error.code }) : null, count: body.count ?? null }
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      }
    }
    return { data: null, error: lastErr, count: null }
  }
  then(ok, bad) {
    return this.run().then(ok, bad)
  }
}

export const usersDb = { from: (table) => new Query(table) }
