// The CYN bot: an OpenFront account that is a member of the clan and reads the donations, the member list and the games of the clan by itself, so
// nobody has to keep the userscript running.
//
// Every 30 minutes (see scheduled() in index.js) the Worker logs in as the bot - the same call the OpenFront page makes (POST /auth/refresh with the
// login cookie) - reads the donor rankings and the newest donations exactly like public/cynosure-donors.user.js does, and stores them like an import.
//
// The login cookie of the bot account is the Worker secret OPENFRONT_BOT_COOKIE ("name=value", set with `wrangler secret put`). Without that secret
// nothing happens at all. If OpenFront hands out a renewed cookie it is kept in the hot database (blobs "donor-bot-cookie") and used from then on.
// What the last run did is stored as "donor-bot-status" (shown to admins on the Clan page); a dead cookie shows up there as "cookie_expired".
import { BOT_STATUS_KEY, storeDonors } from './clanDonors.js'

const API = 'https://api.openfront.io'
const SITE = 'https://openfront.io'
const UA = 'CynClanBot/1.0 (+https://cynclan.com)'
const TAG = 'CYN'
const COOKIE_KEY = 'donor-bot-cookie'
const LIMIT = 50
const BOARD_PAGES = 2 // up to 100 donors per ranking, like the site stores at most
const RECENT_PAGES = 4
const CURRENCIES = ['soft', 'hard']
const PERIODS = ['all', 'month', 'week']
const MEMBERS_KEY = 'clan-members'
const GAMES_KEY = 'clan-games'
const MEMBER_PAGES = 15
const GAME_PAGES = 3
const MAX_GAMES = 300
const MAX_EVENTS = 100
const ID = /^[A-Za-z0-9_-]{1,40}$/
const ROLES = ['leader', 'officer', 'member']

async function getBlob(env, key) {
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(key).first()
  return row?.value ?? null
}
async function putBlob(env, key, value) {
  await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, new Date().toISOString()).run()
}
async function setStatus(env, ok, message, parts, shape) {
  await putBlob(env, BOT_STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ok, message, parts, shape }))
}
const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

/** "a=1; b=2" -> Map(a -> 1, b -> 2) */
function parseCookie(text) {
  const m = new Map()
  for (const part of String(text).split(';')) {
    const i = part.indexOf('=')
    if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
  }
  return m
}
const cookieText = (m) => [...m].map(([k, v]) => `${k}=${v}`).join('; ')

/** The cookie string with the values of the Set-Cookie headers of a response put in (only cookies we already had); null when nothing changed. */
export function renewedCookie(cookie, response) {
  const list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  if (!list.length) return null
  const jar = parseCookie(cookie)
  let changed = false
  for (const line of list) {
    const first = line.split(';')[0]
    const i = first.indexOf('=')
    if (i <= 0) continue
    const name = first.slice(0, i).trim()
    const value = first.slice(i + 1).trim()
    if (jar.has(name) && jar.get(name) !== value && value !== '') {
      jar.set(name, value)
      changed = true
    }
  }
  return changed ? cookieText(jar) : null
}

/** What an unwanted answer said, in a few harmless words for the status line (OpenFront's error text or the Cloudflare mitigation header). */
async function why(res) {
  const mitigated = res.headers.get('cf-mitigated')
  let body = ''
  try {
    body = (await res.text()).replace(/<[^>]*>/g, ' ').replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)
  } catch {
    /* no body */
  }
  return [mitigated ? `cf-mitigated=${mitigated}` : '', body].filter(Boolean).join(' ')
}

/** A request that waits and tries again on 429 (at most 5 s, twice). */
async function get(f, url, jwt, tries = 0) {
  const res = await f(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${jwt}`, Origin: SITE, 'User-Agent': UA } })
  if (res.status !== 429 || tries >= 2) return res
  const asked = parseInt(res.headers.get('Retry-After') ?? '', 10)
  await new Promise((r) => setTimeout(r, Math.min(5000, (Number.isNaN(asked) ? 2 : asked) * 1000)))
  return get(f, url, jwt, tries + 1)
}

async function board(f, jwt, currency, period) {
  const rows = []
  for (let n = 1; n <= BOARD_PAGES; n++) {
    const res = await get(f, `${API}/clans/${TAG}/donations/leaderboard?currencyType=${currency}&period=${period}&page=${n}&limit=${LIMIT}`, jwt)
    if (res.status === 403) throw new Error('not_in_clan')
    if (res.status === 401) throw new Error('jwt_rejected')
    if (!res.ok) throw new Error(`openfront_${res.status} ${await why(res)}`.trim())
    const j = await res.json()
    const list = Array.isArray(j.results) ? j.results : []
    rows.push(...list)
    if (list.length < LIMIT || rows.length >= (j.total || 0)) break
  }
  return rows.map((r) => ({ playerId: r.playerId, username: r.username == null ? null : r.username, total: String(r.total), donations: r.donations }))
}

async function recent(f, jwt) {
  const rows = []
  for (let n = 1; n <= RECENT_PAGES; n++) {
    const res = await get(f, `${API}/clans/${TAG}/donations?page=${n}&limit=${LIMIT}`, jwt)
    if (!res.ok) break // the rankings are the main thing; without this list only the donation quests are switched off
    const j = await res.json()
    const list = Array.isArray(j.results) ? j.results : []
    for (const r of list) if (r.createdBy && r.createdAt) rows.push({ playerId: r.createdBy, currency: r.currencyType, amount: String(r.amount), at: r.createdAt })
    if (list.length < LIMIT) break
  }
  return rows
}

// ── clan members and games ──
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const iso = (v) => {
  const t = typeof v === 'number' ? v : Date.parse(String(v ?? ''))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const name = (v) => (typeof v === 'string' ? v.slice(0, 60) : null)

function cleanStats(s) {
  if (!s || typeof s !== 'object') return undefined
  const out = {}
  for (const [k, v] of Object.entries(s).slice(0, 12)) {
    const wins = num(v?.wins)
    const losses = num(v?.losses)
    if (wins != null && losses != null && /^[A-Za-z0-9_]{1,12}$/.test(k)) out[k] = { wins, losses }
  }
  return Object.keys(out).length ? out : undefined
}

/** One clan member, rebuilt field by field; null when it does not look like one. */
export function cleanMember(r) {
  if (!r || typeof r.publicId !== 'string' || !ID.test(r.publicId)) return null
  const m = { publicId: r.publicId, username: name(r.username), role: ROLES.includes(r.role) ? r.role : 'member', joinedAt: iso(r.joinedAt) }
  const stats = cleanStats(r.stats)
  if (stats) m.stats = stats
  const elo = num(r.eloContributed)
  if (elo != null) m.eloContributed = elo
  return m
}

/** One game the clan played, rebuilt field by field; null when it does not look like one. */
export function cleanGame(r) {
  if (!r || typeof r.gameId !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(r.gameId)) return null
  const clanPlayers = (Array.isArray(r.clanPlayers) ? r.clanPlayers : [])
    .slice(0, 100)
    .filter((p) => p && typeof p.publicId === 'string' && ID.test(p.publicId))
    .map((p) => ({ publicId: p.publicId, username: name(p.username), won: !!p.won }))
  const duration = num(r.durationSeconds)
  const total = num(r.totalPlayers)
  return {
    gameId: r.gameId,
    start: iso(r.start),
    map: name(r.map),
    result: r.result === 'victory' ? 'victory' : 'defeat',
    durationSeconds: duration != null && duration >= 0 && duration <= 172_800 ? Math.round(duration) : null,
    rankedType: typeof r.rankedType === 'string' && r.rankedType !== 'unranked' ? r.rankedType.slice(0, 20) : null,
    totalPlayers: total != null && total >= 0 && total <= 10_000 ? Math.round(total) : null,
    clanPlayers,
  }
}

/** Who joined, left or changed the role between two member lists (nothing on the very first run). */
export function diffMembers(prev, next, at) {
  if (!prev.length) return []
  const was = new Map(prev.map((m) => [m.publicId, m]))
  const now = new Set(next.map((m) => m.publicId))
  const events = []
  for (const m of next) {
    const p = was.get(m.publicId)
    if (!p) events.push({ at, type: 'joined', playerId: m.publicId, username: m.username, role: m.role })
    else if (p.role !== m.role) events.push({ at, type: 'role', playerId: m.publicId, username: m.username, role: m.role, from: p.role })
  }
  for (const p of prev) if (!now.has(p.publicId)) events.push({ at, type: 'left', playerId: p.publicId, username: p.username, role: p.role })
  return events
}

async function fetchMembers(f, jwt) {
  let limit = LIMIT
  let rows = []
  let total = 0
  let pending = null
  for (let page = 1; page <= MEMBER_PAGES; page++) {
    const res = await get(f, `${API}/clans/${TAG}/members?page=${page}&limit=${limit}`, jwt)
    if (res.status === 400 && limit > 10) {
      limit = 10 // an older limit of the API: start again with small pages
      rows = []
      page = 0
      continue
    }
    if (res.status === 403) throw new Error('not_in_clan')
    if (!res.ok) throw new Error(`members_${res.status} ${await why(res)}`.trim())
    const j = await res.json()
    const list = Array.isArray(j.results) ? j.results : []
    rows.push(...list)
    total = num(j.total) ?? total
    if (typeof j.pendingRequests === 'number') pending = j.pendingRequests
    if (list.length < limit || (total && rows.length >= total)) break
  }
  return { rows, total, pending }
}

async function syncMembers(env, f, jwt, shape) {
  const { rows, total, pending } = await fetchMembers(f, jwt)
  if (rows[0] && typeof rows[0] === 'object') shape.members = Object.keys(rows[0]).slice(0, 30)
  const members = rows.map(cleanMember).filter(Boolean)
  if (!members.length) throw new Error('members_empty')
  const before = parseJson(await getBlob(env, MEMBERS_KEY))
  const prev = Array.isArray(before?.members) ? before.members : []
  // a list that is much shorter than the last one is more likely a failed read than half the clan leaving
  if (prev.length && members.length < prev.length * 0.7) throw new Error('members_incomplete')
  const at = new Date().toISOString()
  const events = [...diffMembers(prev, members, at), ...(Array.isArray(before?.events) ? before.events : [])].slice(0, MAX_EVENTS)
  await putBlob(env, MEMBERS_KEY, JSON.stringify({ members, total: total || members.length, pendingRequests: pending, events, updated_at: at }))
}

async function syncGames(env, f, jwt, shape) {
  const rows = []
  let cursor = null
  for (let n = 0; n < GAME_PAGES; n++) {
    const res = await get(f, `${API}/clans/${TAG}/games${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, jwt)
    if (res.status === 403) throw new Error('not_in_clan')
    if (!res.ok) throw new Error(`games_${res.status} ${await why(res)}`.trim())
    const j = await res.json()
    rows.push(...(Array.isArray(j.results) ? j.results : []))
    if (typeof j.nextCursor !== 'string' || !j.nextCursor) break
    cursor = j.nextCursor
  }
  if (rows[0] && typeof rows[0] === 'object') shape.games = Object.keys(rows[0]).slice(0, 30)
  const fresh = rows.map(cleanGame).filter(Boolean)
  const before = parseJson(await getBlob(env, GAMES_KEY))
  const merged = new Map()
  // what was read now wins over what was stored; older games stay until the list is full
  for (const g of [...fresh, ...(Array.isArray(before?.games) ? before.games : [])]) if (!merged.has(g.gameId)) merged.set(g.gameId, g)
  const games = [...merged.values()].sort((a, b) => String(b.start ?? '').localeCompare(String(a.start ?? ''))).slice(0, MAX_GAMES)
  await putBlob(env, GAMES_KEY, JSON.stringify({ games, updated_at: new Date().toISOString() }))
}

/** A short fingerprint of the secret, so a stored renewed cookie is never mixed up with a new secret. */
async function fingerprint(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** One run of the bot. Returns { ok, message } (null when the bot is not set up); never throws. `f` is the fetch to use (tests pass their own). */
export async function syncClanDonors(env, f = fetch) {
  const seed = env.OPENFRONT_BOT_COOKIE
  if (!seed || !env.HOT_DB) return null
  const fail = async (message) => {
    await setStatus(env, false, message).catch(() => {})
    return { ok: false, message }
  }
  try {
    // a renewed cookie from an earlier run wins, as long as it belongs to the same secret (replacing the secret starts over)
    let cookie = seed
    const stored = await getBlob(env, COOKIE_KEY)
    if (stored) {
      try {
        const s = JSON.parse(stored)
        if (typeof s.cookie === 'string' && s.seed === (await fingerprint(seed))) cookie = s.cookie
      } catch {
        /* unreadable: use the secret */
      }
    }

    const login = await f(`${API}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie, Origin: SITE, Referer: `${SITE}/`, Accept: 'application/json', 'User-Agent': UA } })
    if (login.status === 401) return await fail('cookie_expired')
    if (!login.ok) return await fail(`login_${login.status} ${await why(login)}`.trim())
    const jwt = (await login.json())?.jwt
    if (typeof jwt !== 'string' || !jwt) return await fail('no_token')
    const next = renewedCookie(cookie, login)
    if (next) await putBlob(env, COOKIE_KEY, JSON.stringify({ seed: await fingerprint(seed), cookie: next }))

    // three jobs, each on its own: one failing does not stop the others (the first failure is what the status line shows)
    const parts = {}
    const shape = {}
    const part = async (key, job) => {
      try {
        await job()
        parts[key] = 'ok'
      } catch (err) {
        parts[key] = String(err?.message ?? err).slice(0, 160)
      }
    }
    await part('donors', async () => {
      const boards = { soft: {}, hard: {} }
      for (const c of CURRENCIES) for (const p of PERIODS) boards[c][p] = await board(f, jwt, c, p)
      const list = await recent(f, jwt)
      const out = await storeDonors(env, { boards, recent: list }, 'bot')
      if (out.response) throw new Error(`rejected_${out.response.status}`)
    })
    await part('members', () => syncMembers(env, f, jwt, shape))
    await part('games', () => syncGames(env, f, jwt, shape))
    const failed = Object.values(parts).find((v) => v !== 'ok')
    await setStatus(env, !failed, failed ?? 'ok', parts, shape)
    return { ok: !failed, message: failed ?? 'ok' }
  } catch (err) {
    return await fail(String(err?.message ?? err).slice(0, 160))
  }
}
