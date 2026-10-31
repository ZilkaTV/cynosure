// The CYN bot: an OpenFront account that is a member of the clan and reads the donations by itself, so nobody has to keep the userscript running.
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

async function getBlob(env, key) {
  const row = await env.HOT_DB.prepare('SELECT value FROM blobs WHERE key = ?').bind(key).first()
  return row?.value ?? null
}
async function putBlob(env, key, value) {
  await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, new Date().toISOString()).run()
}
async function setStatus(env, ok, message) {
  await putBlob(env, BOT_STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ok, message }))
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

    const boards = { soft: {}, hard: {} }
    for (const c of CURRENCIES) for (const p of PERIODS) boards[c][p] = await board(f, jwt, c, p)
    const list = await recent(f, jwt)
    const out = await storeDonors(env, { boards, recent: list }, 'bot')
    if (out.response) return await fail(`rejected_${out.response.status}`)
    await setStatus(env, true, 'ok')
    return { ok: true, message: 'ok' }
  } catch (err) {
    return await fail(String(err?.message ?? err).slice(0, 160))
  }
}
