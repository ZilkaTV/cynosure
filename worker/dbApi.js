// The site's data API on D1 (binding DB, database "cynosure"). It replaces the Supabase REST API plus its row-level
// security: the browser sends a small JSON query description (built by src/lib/db.ts, same shape of calls as the
// Supabase client it replaces), and this file runs it against D1 after applying the access rules below - the same
// rules the old RLS policies and triggers enforced.
//
//   POST /api/db            browser queries, identity = session cookie (worker/session.js)
//   POST /api/db/rpc        the two public survey helper functions
//   POST /api/internal/users/query   same engine without access rules, for the GitHub Actions scripts (HOT_API_SECRET)
//
// Query description: { table, op: select|insert|upsert|update|delete, select, count, head, filters:[{col,op,val}],
//   order:[{col,asc}], limit, offset, single: 'single'|'maybe'|null, values, onConflict, ignoreDuplicates, returning }
// Response: { data, error: {code,message}|null, count }

import { USERS_META } from './d1/usersMeta.js'
import { readSession, verifyOwnershipProof } from './session.js'

const MAX_BODY = 262144
const MAX_ROWS = 5000
const COL = /^[a-z_][a-z0-9_]{0,62}$/

// Survey submissions close at the reveal (mirrors REVEAL_AT in src/lib/survey.ts): 2026-09-26 20:00 CEST.
const SURVEY_CLOSES_MS = Date.parse('2026-09-26T18:00:00Z')

class DbError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const denied = () => new DbError('42501', 'new row violates row-level security policy')
const nowIso = () => new Date().toISOString()

// ── access rules ────────────────────────────────────────────────────────────
// read/update/delete rule -> false | true | { sql, args } (extra WHERE restricting which rows the caller may touch).
// insert rule -> async (row, ctx) => row to write (may add/force fields) | false.
const PUBLIC = () => true
const SIGNED_IN = (c) => !!c.user
const ADMIN = async (c) => !!c.user && (await c.isAdmin())
const MEMBER = async (c) => !!c.user && !!(await c.myMember())
const INNER = async (c) => !!c.user && (await c.isInner())
const SERVICE_ONLY = () => false

const own = (col) => async (c) => {
  const m = c.user && (await c.myMember())
  return m ? { sql: `${col} = ?`, args: [m.openfront_id] } : false
}
const insertOwn = (col) => async (row, c) => {
  const m = c.user && (await c.myMember())
  return m && row[col] === m.openfront_id ? row : false
}
const insertAdmin = async (row, c) => (await ADMIN(c)) ? row : false

const BLOCKED = /nigg(er|a)|faggot|retard|chink|spic|kike|coon|tranny|cunt|hurensohn|schlampe|missgeburt|untermensch|fotze|wichser|arschloch|behindert|salope|connard|encule|batard|negre|bougnoule|pute/
const normalizeChat = (s) => s.toLowerCase().replace(/[431057$@!]/g, (ch) => ({ 4: 'a', 3: 'e', 1: 'i', 0: 'o', 5: 's', 7: 't', $: 's', '@': 'a', '!': 'i' })[ch]).replace(/[^a-z]/g, '')

const RULES = {
  cyn_members: {
    read: PUBLIC,
    // upsert()/update() go through the special handling in runWrite (claiming, forced identity fields)
    insert: async (row, c) => (c.user ? row : false),
    update: (c) => (c.user ? { sql: '(user_id IS NULL OR user_id = ?)', args: [c.user.id] } : false),
  },
  cyn_speedruns: { read: PUBLIC, insert: insertOwn('openfront_id'), update: own('openfront_id') },
  cyn_bumps: { read: PUBLIC, insert: insertOwn('openfront_id'), update: own('openfront_id') },
  cyn_xp: { read: PUBLIC, insert: insertOwn('openfront_id'), update: own('openfront_id') },
  cyn_quest_claims: { read: PUBLIC, insert: insertOwn('openfront_id') },
  cyn_kudos: { read: PUBLIC, insert: insertOwn('from_openfront_id'), delete: own('from_openfront_id') },
  cyn_event_admins: { read: PUBLIC, insert: insertAdmin, delete: ADMIN },
  cyn_chat_moderators: { read: PUBLIC, insert: insertAdmin, delete: ADMIN },
  cyn_supporters: { read: PUBLIC, insert: insertAdmin, delete: ADMIN },
  cyn_event_teams: { read: PUBLIC, insert: insertAdmin, update: ADMIN },
  cyn_event_submissions: {
    read: PUBLIC,
    // Anyone may submit; whatever the caller sends, a new entry starts pending and unreviewed.
    insert: async (row) => ({ ...row, status: 'pending', reviewed_by: null, reviewed_at: null }),
    update: ADMIN,
  },
  cyn_game_tile_stats: { read: PUBLIC, insert: async (row) => row, update: PUBLIC },
  cyn_member_snapshots: { read: PUBLIC },
  cyn_chat_message_counts: { read: PUBLIC },
  cyn_inner_circle: { read: PUBLIC },
  cyn_game_nights: {
    read: SIGNED_IN,
    insert: async (row, c) => {
      const m = c.user && (await c.myMember())
      if (!m || row.created_by !== m.openfront_id || !(await c.isInner())) return false
      if (!(Date.parse(row.starts_at) > Date.now() - 5 * 60 * 1000)) return false
      return row
    },
    delete: async (c) => {
      const m = c.user && (await c.myMember())
      return m && (await c.isInner()) ? { sql: 'created_by = ?', args: [m.openfront_id] } : false
    },
  },
  cyn_game_night_rsvps: { read: SIGNED_IN, insert: insertOwn('openfront_id'), update: own('openfront_id') },
  cyn_clan_chat_messages: {
    read: MEMBER,
    insert: async (row, c) => {
      const m = c.user && (await c.myMember())
      if (!m) return false
      const content = String(row.content ?? '').trim()
      if (content.length === 0) throw new DbError('P0001', 'invalid_length: message is empty')
      if (content.length > 500) throw new DbError('P0001', 'invalid_length: message is too long (max 500 characters)')
      const last = await c.db.prepare('SELECT created_at FROM cyn_clan_chat_messages WHERE author_user_id = ? ORDER BY created_at DESC LIMIT 1').bind(c.user.id).first()
      if (last && Date.now() - Date.parse(last.created_at) < 60000) throw new DbError('P0001', 'rate_limited: wait a bit before posting again')
      if (BLOCKED.test(normalizeChat(content))) throw new DbError('P0001', 'blocked_content: message contains blocked language')
      return { author_user_id: c.user.id, author_openfront_id: m.openfront_id, author_name: String(row.author_name ?? '').slice(0, 60) || m.openfront_id, content }
    },
    after: (row) => ({
      sql: 'INSERT INTO cyn_chat_message_counts (openfront_id, count) VALUES (?, 1) ON CONFLICT(openfront_id) DO UPDATE SET count = count + 1',
      args: [row.author_openfront_id],
    }),
    delete: async (c) => (c.user && ((await c.isAdmin()) || (await c.isModerator())) ? true : false),
  },
  cyn_site_visits: {
    read: INNER,
    insert: async (row, c) => {
      const recent = await c.db.prepare('SELECT COUNT(*) AS n FROM cyn_site_visits WHERE visited_at > ?').bind(new Date(Date.now() - 60000).toISOString()).first()
      if ((recent?.n ?? 0) >= 120) return 'skip'
      return { is_member: row.is_member ? 1 : 0 }
    },
  },
  cyn_metrics_daily: { read: INNER },
  cyn_member_discord_status: { read: INNER },
  cyn_metrics_channel_state: {},
  cyn_help_conversations: { read: ADMIN, update: ADMIN },
  cyn_help_messages: { read: ADMIN },
  cyn_help_rate_limit: {},
  cyn_survey_responses: {
    read: async (c) => {
      if (!c.user) return false
      return (await c.isAdmin()) ? true : { sql: 'user_id = ?', args: [c.user.id] }
    },
    insert: async (row, c) => (c.user && Date.now() < SURVEY_CLOSES_MS ? { ...row, user_id: c.user.id } : false),
    update: (c) => (c.user && Date.now() < SURVEY_CLOSES_MS ? { sql: 'user_id = ?', args: [c.user.id] } : false),
  },
}

// ── request context ─────────────────────────────────────────────────────────
function makeContext(env, user, service) {
  const memo = {}
  const once = (k, fn) => (memo[k] ??= fn())
  const db = env.DB
  return {
    db,
    env,
    user,
    service,
    myMember: () => once('member', () => db.prepare('SELECT openfront_id, in_game_name FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()),
    isAdmin: () => once('admin', async () => !!(await db.prepare('SELECT 1 AS x FROM cyn_event_admins WHERE user_id = ? LIMIT 1').bind(user.id).first())),
    isModerator: () => once('mod', async () => !!(await db.prepare('SELECT 1 AS x FROM cyn_chat_moderators WHERE user_id = ? LIMIT 1').bind(user.id).first())),
    isInner: () =>
      once('inner', async () => !!(await db.prepare('SELECT 1 AS x FROM cyn_members m JOIN cyn_inner_circle ic ON ic.openfront_id = m.openfront_id WHERE m.user_id = ? LIMIT 1').bind(user.id).first())),
  }
}

// ── query building ──────────────────────────────────────────────────────────
const FILTER_OPS = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'LIKE' }

function sqlValue(v) {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

function colList(meta, wanted) {
  if (!wanted || wanted === '*') return meta.cols
  const cols = wanted.split(',').map((s) => s.trim()).filter(Boolean)
  for (const c of cols) if (!meta.cols.includes(c)) throw new DbError('42703', `column ${c} does not exist`)
  return cols
}

function whereClause(meta, filters, extra) {
  const parts = []
  const args = []
  for (const f of filters ?? []) {
    if (!COL.test(f.col) || !meta.cols.includes(f.col)) throw new DbError('42703', `column ${f.col} does not exist`)
    if (f.op === 'in') {
      const vals = Array.isArray(f.val) ? f.val : []
      if (vals.length > 90) throw new DbError('54000', 'too many values in filter')
      if (vals.length === 0) {
        parts.push('0')
        continue
      }
      parts.push(`${f.col} IN (${vals.map(() => '?').join(',')})`)
      args.push(...vals.map(sqlValue))
    } else if (f.op === 'is') {
      parts.push(f.val === null ? `${f.col} IS NULL` : `${f.col} IS NOT NULL`)
    } else if (FILTER_OPS[f.op]) {
      parts.push(`${f.col} ${FILTER_OPS[f.op]} ?`)
      args.push(sqlValue(f.val))
    } else {
      throw new DbError('42883', `unsupported filter ${f.op}`)
    }
  }
  if (extra && extra !== true) {
    parts.push(`(${extra.sql})`)
    args.push(...extra.args)
  }
  return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', args }
}

function decodeRow(meta, row) {
  const out = { ...row }
  for (const c of meta.json) if (typeof out[c] === 'string') {
    try {
      out[c] = JSON.parse(out[c])
    } catch {
      /* keep the raw text */
    }
  }
  for (const c of meta.bool) if (out[c] !== undefined && out[c] !== null) out[c] = !!out[c]
  return out
}

function cleanRow(meta, row) {
  const out = {}
  for (const [k, v] of Object.entries(row ?? {})) {
    if (!COL.test(k) || !meta.cols.includes(k)) throw new DbError('42703', `column ${k} does not exist`)
    out[k] = v
  }
  return out
}

function mapError(err) {
  if (err instanceof DbError) return { code: err.code, message: err.message }
  const msg = String(err?.message ?? err)
  if (/UNIQUE constraint failed/i.test(msg)) return { code: '23505', message: 'duplicate key value violates unique constraint' }
  if (/NOT NULL constraint failed/i.test(msg)) return { code: '23502', message: msg.slice(0, 200) }
  return { code: 'XX000', message: msg.slice(0, 200) }
}

// ── execution ───────────────────────────────────────────────────────────────
async function runSelect(c, q, meta, rule) {
  const access = c.service ? true : await rule
  if (!access) throw denied()
  let cols = colList(meta, q.select)
  // The public member list never exposes the account link; signed-in visitors may read the Discord id.
  if (q.table === 'cyn_members' && !c.service) cols = cols.filter((x) => x !== 'user_id' && (x !== 'discord_user_id' || c.user))
  const { sql: where, args } = whereClause(meta, q.filters, access)
  let sql = `SELECT ${q.head ? '1 AS x' : cols.join(', ')} FROM ${q.table}${where}`
  if (q.order?.length) {
    const parts = q.order.map((o) => {
      if (!COL.test(o.col) || !meta.cols.includes(o.col)) throw new DbError('42703', `column ${o.col} does not exist`)
      return `${o.col} ${o.asc === false ? 'DESC' : 'ASC'}`
    })
    sql += ` ORDER BY ${parts.join(', ')}`
  }
  const limit = Math.min(Number.isFinite(q.limit) ? q.limit : MAX_ROWS, MAX_ROWS)
  const offset = Number.isFinite(q.offset) ? Math.max(0, q.offset) : 0
  let count = null
  if (q.count) count = (await c.db.prepare(`SELECT COUNT(*) AS n FROM ${q.table}${where}`).bind(...args).first())?.n ?? 0
  if (q.head) return { data: null, count }
  const { results } = await c.db.prepare(`${sql} LIMIT ${limit} OFFSET ${offset}`).bind(...args).all()
  const rows = (results ?? []).map((r) => decodeRow(meta, r))
  return { data: rows, count }
}

async function prepareInsertRows(c, q, meta, rules) {
  const rowsIn = Array.isArray(q.values) ? q.values : [q.values]
  if (rowsIn.length === 0 || rowsIn.length > 500) throw new DbError('22023', 'bad number of rows')
  const out = []
  for (const raw of rowsIn) {
    const { _proof: proof, ...rest } = raw ?? {}
    let row = cleanRow(meta, rest)
    if (proof !== undefined) c.proof = proof
    if (!c.service) {
      if (!rules.insert) throw denied()
      const result = await rules.insert(row, c)
      if (result === 'skip') continue
      if (!result) throw denied()
      row = cleanRow(meta, result)
    }
    out.push(row)
  }
  return out
}

async function runWrite(c, q, meta, rules) {
  const op = q.op
  if (op === 'insert' || op === 'upsert') {
    let rows = await prepareInsertRows(c, q, meta, rules)
    const statements = []
    const written = []
    const mainIdx = []
    for (let row of rows) {
      let membersExisting = null
      if (q.table === 'cyn_members' && !c.service) {
        membersExisting = await c.db.prepare('SELECT user_id FROM cyn_members WHERE openfront_id = ?').bind(row.openfront_id).first()
        if (membersExisting && membersExisting.user_id && membersExisting.user_id !== c.user.id) throw denied()
        // Taking an id nobody owns yet (a new row, or a clan member nobody has claimed) needs the ownership proof the Worker
        // hands out after the solo-game check (worker/soloLatest.js); updating your own row does not.
        if (!(membersExisting && membersExisting.user_id === c.user.id) && !(await verifyOwnershipProof(c.env, c.user.id, row.openfront_id, c.proof))) {
          throw new DbError('42501', 'ownership_required')
        }
        // Identity fields always come from the verified session, never from the request body.
        row = { ...row, user_id: c.user.id, discord_user_id: c.user.id, claimed: 1 }
        delete row.created_at
        row.updated_at = nowIso()
        if (membersExisting && !membersExisting.user_id) row.created_at = nowIso()
      }
      if (q.table === 'cyn_members' && c.service && (op === 'insert' || row.user_id !== undefined)) row.claimed = row.user_id ? 1 : 0
      if (['cyn_event_admins', 'cyn_chat_moderators'].includes(q.table) && !row.user_id && !c.service) {
        const target = await c.db.prepare('SELECT user_id FROM cyn_members WHERE discord_username = ? AND user_id IS NOT NULL LIMIT 1').bind(row.discord_username).first()
        row.user_id = target?.user_id ?? null
      }
      const cols = Object.keys(row)
      if (cols.length === 0) throw new DbError('22023', 'empty row')
      const conflict = (q.onConflict ? q.onConflict.split(',').map((s) => s.trim()) : meta.pk).filter(Boolean)
      for (const k of conflict) if (!meta.cols.includes(k)) throw new DbError('42703', `column ${k} does not exist`)
      let checkChanged = op === 'upsert' && !q.ignoreDuplicates && !c.service
      let sql = `INSERT INTO ${q.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      const args = cols.map((k) => sqlValue(row[k]))
      if (op === 'upsert') {
        if (q.ignoreDuplicates) {
          sql += ` ON CONFLICT(${conflict.join(',')}) DO NOTHING`
        } else {
          const sets = cols.filter((k) => !conflict.includes(k))
          let scope = true
          if (!c.service) {
            const rule = rules.update
            scope = typeof rule === 'function' ? await rule(c) : false
            if (!scope) throw denied()
          }
          if (sets.length === 0) {
            sql += ` ON CONFLICT(${conflict.join(',')}) DO NOTHING`
            checkChanged = false
          } else {
            sql += ` ON CONFLICT(${conflict.join(',')}) DO UPDATE SET ${sets.map((k) => `${k} = excluded.${k}`).join(', ')}`
            if (scope !== true) {
              sql += ` WHERE ${scope.sql}`
              args.push(...scope.args)
            }
          }
        }
      }
      statements.push(c.db.prepare(sql).bind(...args))
      mainIdx.push({ i: statements.length - 1, check: checkChanged })
      written.push(row)
      if (!c.service && rules.after) {
        const extra = rules.after(row)
        statements.push(c.db.prepare(extra.sql).bind(...extra.args))
      }
    }
    if (statements.length) {
      const results = await c.db.batch(statements)
      // An upsert that matched an existing row the caller may not touch changes nothing - report it like RLS would.
      if (mainIdx.some((m) => m.check && results[m.i]?.meta?.changes === 0)) throw denied()
    }
    if (q.returning) {
      const data = []
      for (const row of written) {
        const keys = (meta.pk.length ? meta.pk : Object.keys(row)).filter((k) => row[k] !== undefined)
        if (keys.length === meta.pk.length && keys.length) {
          const r = await c.db.prepare(`SELECT * FROM ${q.table} WHERE ${keys.map((k) => `${k} = ?`).join(' AND ')}`).bind(...keys.map((k) => sqlValue(row[k]))).first()
          if (r) data.push(decodeRow(meta, r))
        } else data.push(decodeRow(meta, row))
      }
      return { data, count: null }
    }
    return { data: null, count: null }
  }

  if (op === 'update') {
    const patch = cleanRow(meta, q.values)
    delete patch.user_id
    if (!c.service && q.table === 'cyn_members') {
      delete patch.created_at
      patch.discord_user_id = c.user.id
    }
    if (meta.cols.includes('updated_at') && patch.updated_at === undefined) patch.updated_at = nowIso()
    const cols = Object.keys(patch)
    if (cols.length === 0) throw new DbError('22023', 'empty update')
    let scope = true
    if (!c.service) {
      scope = typeof rules.update === 'function' ? await rules.update(c) : false
      if (!scope) throw denied()
    }
    const { sql: where, args } = whereClause(meta, q.filters, scope)
    if (!where) throw new DbError('21000', 'update requires a filter')
    const res = await c.db.prepare(`UPDATE ${q.table} SET ${cols.map((k) => `${k} = ?`).join(', ')}${where}`).bind(...cols.map((k) => sqlValue(patch[k])), ...args).run()
    if (!c.service && (res.meta?.changes ?? 0) === 0 && q.mustMatch) throw denied()
    return { data: null, count: null }
  }

  if (op === 'delete') {
    let scope = true
    if (!c.service) {
      scope = typeof rules.delete === 'function' ? await rules.delete(c) : false
      if (!scope) throw denied()
    }
    const { sql: where, args } = whereClause(meta, q.filters, scope)
    if (!where) throw new DbError('21000', 'delete requires a filter')
    await c.db.prepare(`DELETE FROM ${q.table}${where}`).bind(...args).run()
    return { data: null, count: null }
  }
  throw new DbError('42883', `unsupported operation ${op}`)
}

/** Runs one described query. `service` skips the access rules (scripts only). */
export async function runQuery(env, q, user, service) {
  try {
    const meta = USERS_META[q?.table]
    if (!meta) throw new DbError('42P01', 'unknown table')
    const rules = RULES[q.table] ?? {}
    const c = makeContext(env, user, service)
    let result
    if (q.op === 'select') {
      const rule = rules.read ? Promise.resolve(rules.read(c)) : Promise.resolve(false)
      // D1 allows 100 bound values per statement: a long IN list is read in slices and the rows are joined.
      const big = q.filters?.find((f) => f.op === 'in' && Array.isArray(f.val) && f.val.length > 80)
      if (big && !q.count && !q.single) {
        const rows = []
        for (let i = 0; i < big.val.length && rows.length < MAX_ROWS; i += 80) {
          const slice = { ...q, filters: q.filters.map((f) => (f === big ? { ...f, val: big.val.slice(i, i + 80) } : f)) }
          rows.push(...((await runSelect(c, slice, meta, rule)).data ?? []))
        }
        return { data: rows, error: null, count: null }
      }
      result = await runSelect(c, q, meta, rule)
      if (q.single) {
        const rows = result.data ?? []
        if (rows.length > 1 || (q.single === 'single' && rows.length === 0)) throw new DbError('PGRST116', 'JSON object requested, multiple (or no) rows returned')
        result = { data: rows[0] ?? null, count: result.count }
      }
    } else {
      result = await runWrite(c, q, meta, rules)
    }
    return { data: result.data, error: null, count: result.count }
  } catch (err) {
    return { data: null, error: mapError(err), count: null }
  }
}

// ── RPCs (security-definer functions of the old database) ───────────────────
async function runRpc(env, fn) {
  if (fn === 'cyn_survey_nominees') {
    const { results } = await env.DB.prepare(
      'SELECT DISTINCT q.key AS question_id, n.value AS name FROM cyn_survey_responses r, json_each(r.answers) q, json_each(q.value) n',
    ).all()
    return results ?? []
  }
  if (fn === 'cyn_survey_public_answers') {
    if (Date.now() < SURVEY_CLOSES_MS) return []
    const { results } = await env.DB.prepare('SELECT answers FROM cyn_survey_responses').all()
    return (results ?? []).map((r) => ({ answers: JSON.parse(r.answers) }))
  }
  throw new DbError('42883', 'unknown function')
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

export async function handleDbApi(request, env, pathname) {
  if (!env.DB) return json(503, { data: null, error: { code: 'XX000', message: 'database not configured' } })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  // Browser calls only come from this site (SameSite=Lax already keeps the cookie off cross-site POSTs; this is the second lock).
  const origin = request.headers.get('Origin')
  if (origin && !/^https:\/\/(www\.)?cynclan\.com$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json(403, { error: 'bad_origin' })
  const len = Number(request.headers.get('Content-Length') ?? 0)
  if (len > MAX_BODY) return json(413, { error: 'too_large' })
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad_json' })
  }
  const user = await readSession(request, env)
  if (pathname === '/api/db/rpc') {
    try {
      return json(200, { data: await runRpc(env, body?.fn), error: null })
    } catch (err) {
      return json(200, { data: null, error: mapError(err) })
    }
  }
  return json(200, await runQuery(env, body, user, false))
}

/** Service entry for scripts: same engine, no access rules. Auth is checked by the caller (usersApi.js). */
export async function handleServiceQuery(env, body) {
  return runQuery(env, body, null, true)
}
