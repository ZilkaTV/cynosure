// Which pages of the site are opened most, for how long, and who has which page open right now (admin Metrics page).
//
//   POST /api/seen/pages     a signed-in member's browser reports { pages: { "/path": { v: views, s: seconds } }, open: "/path" | null }
//                            (batched: at most every 30 s per tab, see src/lib/pageTracker.ts)
//   GET  /api/metrics/pages  { days, today, week, open } - inner circle only
//
// Stored like the visitor list (worker/siteSeen.js): one small row per member and Europe/Berlin day in the hot database's
// `blobs` table, key "pages:<day>:<openfront id>", value { pages: { path: { v, s } }, open: { p, at } }. Rows older than
// 8 days are dropped. Only signed-in members are measured (no anonymous visitors).
import { readSession } from './session.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
const dayKey = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d)
const DAY_MS = 86_400_000
const KEEP_DAYS = 8
const OPEN_FOR_MS = 4 * 60_000 // a heartbeat comes every 2 minutes: "open" = reported within the last 4
const MAX_PATHS_PER_REPORT = 12
const MAX_PATHS_PER_MEMBER_DAY = 60
const PATH_RE = /^\/[A-Za-z0-9/_:-]{0,60}$/

export async function handlePageReport(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const user = await readSession(request, env)
  if (!user) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
  let body = null
  try {
    const text = await request.text()
    if (text.length > 4000) return json(413, { error: 'too_large' })
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'bad_json' })
  }
  const member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? OR discord_user_id = ? LIMIT 1').bind(user.id, user.id).first()
  if (!member) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })

  const add = {}
  for (const [path, val] of Object.entries(body?.pages ?? {}).slice(0, MAX_PATHS_PER_REPORT)) {
    if (!PATH_RE.test(path)) continue
    const v = Math.max(0, Math.min(30, Math.round(Number(val?.v) || 0)))
    const s = Math.max(0, Math.min(900, Math.round(Number(val?.s) || 0)))
    if (v || s) add[path] = { v, s }
  }
  const open = typeof body?.open === 'string' && PATH_RE.test(body.open) ? body.open : null

  const now = new Date()
  const iso = now.toISOString()
  const key = `pages:${dayKey(now)}:${member.openfront_id}`
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(key).first()
  let doc = { pages: {}, open: null }
  try {
    if (row?.value) doc = { pages: {}, open: null, ...JSON.parse(row.value) }
  } catch {
    /* start over */
  }
  for (const [path, a] of Object.entries(add)) {
    const cur = doc.pages[path]
    if (!cur && Object.keys(doc.pages).length >= MAX_PATHS_PER_MEMBER_DAY) continue
    doc.pages[path] = { v: (cur?.v ?? 0) + a.v, s: (cur?.s ?? 0) + a.s }
  }
  doc.open = open ? { p: open, at: iso } : null
  await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, JSON.stringify(doc), iso)
    .run()
  if (Math.random() < 0.02) {
    await env.HOT_DB.prepare('DELETE FROM blobs WHERE key >= ? AND key < ?').bind('pages:', `pages:${dayKey(new Date(now.getTime() - KEEP_DAYS * DAY_MS))}`).run()
  }
  return json(200, { ok: true })
}

export async function handlePageStats(request, env) {
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  if (!env.DB || !env.HOT_DB) return json(503, { error: 'not_configured' })
  const inner = await env.DB.prepare('SELECT 1 AS x FROM cyn_members m JOIN cyn_inner_circle ic ON ic.openfront_id = m.openfront_id WHERE m.user_id = ? LIMIT 1').bind(user.id).first()
  if (!inner) return json(403, { error: 'inner_circle_only' })

  const now = new Date()
  const today = dayKey(now)
  const days = []
  for (let i = 0; i < 7; i++) days.push(dayKey(new Date(now.getTime() - i * DAY_MS)))
  const from = days[days.length - 1]
  const { results } = await env.HOT_DB.prepare('SELECT key, value FROM blobs WHERE key >= ? AND key < ?').bind(`pages:${from}:`, `pages:${today};`).all()

  const empty = () => ({})
  const totals = { today: empty(), week: empty() }
  const open = []
  for (const r of results ?? []) {
    const m = /^pages:(\d{4}-\d{2}-\d{2}):(.+)$/.exec(r.key)
    if (!m || !days.includes(m[1])) continue
    let doc = null
    try {
      doc = JSON.parse(r.value)
    } catch {
      continue
    }
    for (const [path, a] of Object.entries(doc.pages ?? {})) {
      for (const scope of m[1] === today ? ['today', 'week'] : ['week']) {
        const t = totals[scope][path] ?? (totals[scope][path] = { views: 0, seconds: 0, users: 0 })
        t.views += a.v ?? 0
        t.seconds += a.s ?? 0
        t.users += 1
      }
    }
    if (m[1] === today && doc.open?.p && now.getTime() - Date.parse(doc.open.at) < OPEN_FOR_MS) open.push({ id: m[2], path: doc.open.p, at: doc.open.at })
  }

  const names = new Map()
  for (let i = 0; i < open.length; i += 80) {
    const slice = open.slice(i, i + 80).map((o) => o.id)
    const rows = await env.DB.prepare(`SELECT openfront_id, in_game_name FROM cyn_members WHERE openfront_id IN (${slice.map(() => '?').join(',')})`).bind(...slice).all()
    for (const x of rows.results ?? []) names.set(x.openfront_id, x.in_game_name)
  }
  const toList = (obj) =>
    Object.entries(obj)
      .map(([path, t]) => ({ path, ...t }))
      .sort((a, b) => b.views - a.views || b.seconds - a.seconds)
  return json(200, {
    today: toList(totals.today),
    week: toList(totals.week),
    open: open.map((o) => ({ ...o, name: names.get(o.id) ?? o.id })).sort((a, b) => String(b.at).localeCompare(String(a.at))),
  })
}
