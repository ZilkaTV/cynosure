// Boosters and the card collection.
//
//   GET  /api/boosters/me                 the own state: boosters on hand, is today's free one available, opened today
//   POST /api/boosters/open               opens one booster (the free one of the day first, then a booster on hand): 3 cards of members in random rarities
//   GET  /api/boosters/collection?id=ID   the cards a member collected (members of the site see each other's collections)
//   POST /api/boosters/grant              admins: puts boosters on hand for a member { openfront_id, count }
//   GET  /api/card-social                 how many comments and reactions each member wrote (the COM value of the card)
//
// The draw happens here, with the Worker's random numbers, so nobody can pick their cards. One free booster per day (Berlin time), a member's first
// visit puts one starter booster on hand. More boosters only come from an admin for now (there is no payment in the site).
import { readSession } from './session.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

export const RARITIES = [
  ['common', 55],
  ['rare', 26],
  ['epic', 12],
  ['ultra', 5],
  ['legendary', 2],
]
export const PACK_SIZE = 3
const STARTER_BOOSTERS = 1
const MAX_ON_HAND = 500
const ID = /^[A-Za-z0-9_-]{4,40}$/

/** A whole number 0..n-1 from the secure random source, without the bias of a plain modulo. */
export function randomInt(n) {
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % n
}

/** One rarity by its weights (the weights add up to 100). */
export function drawRarity(rand = randomInt) {
  let roll = rand(RARITIES.reduce((s, [, w]) => s + w, 0))
  for (const [name, weight] of RARITIES) {
    if (roll < weight) return name
    roll -= weight
  }
  return RARITIES[0][0]
}

/** The cards of one booster: members from the pool (the same member can come twice), each in its own random rarity. */
export function drawPack(pool, rand = randomInt) {
  if (!pool.length) return []
  return Array.from({ length: PACK_SIZE }, () => ({ card_id: pool[rand(pool.length)], rarity: drawRarity(rand) }))
}

/** The date in Berlin (YYYY-MM-DD): the free booster comes back at midnight there. */
export function berlinDay(ms = Date.now()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ms))
}
/** The moment (ms) the Berlin date changes next. */
export function nextBerlinMidnight(ms = Date.now()) {
  const today = berlinDay(ms)
  let lo = ms
  let hi = ms + 26 * 3_600_000
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2)
    if (berlinDay(mid) === today) lo = mid
    else hi = mid
  }
  return hi
}

function siteOriginAllowed(request, env) {
  const origin = request.headers.get('Origin')
  const own = env.SITE_ENV === 'dev' && origin === new URL(request.url).origin
  return !origin || own || /^https:\/\/(www\.)?cynclan\.com$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

async function stateOf(env, id) {
  // the first visit of a member puts the starter booster on hand
  await env.DB.prepare('INSERT OR IGNORE INTO cyn_booster_state (openfront_id, extra) VALUES (?, ?)').bind(id, STARTER_BOOSTERS).run()
  return env.DB.prepare('SELECT extra, last_free_day, last_open_at, opened_total FROM cyn_booster_state WHERE openfront_id = ?').bind(id).first()
}

function publicState(row, now = Date.now()) {
  const today = berlinDay(now)
  return {
    extra: row.extra,
    freeAvailable: row.last_free_day !== today,
    nextFreeAt: row.last_free_day !== today ? null : new Date(nextBerlinMidnight(now)).toISOString(),
    // the daily quest counts from midnight UTC, like all quests
    openedToday: !!row.last_open_at && row.last_open_at.slice(0, 10) === new Date(now).toISOString().slice(0, 10),
    openedTotal: row.opened_total,
  }
}

async function collectionOf(env, id) {
  const { results } = await env.DB.prepare('SELECT card_id, rarity, COUNT(*) AS n, MAX(pulled_at) AS last FROM cyn_card_pulls WHERE openfront_id = ? GROUP BY card_id, rarity ORDER BY last DESC LIMIT 3000').bind(id).all()
  return results ?? []
}

export async function handleBoosters(request, env) {
  if (!env.DB) return json(503, { error: 'not_configured' })
  const { pathname, searchParams } = new URL(request.url)
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'not_signed_in' })
  const me = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!me) return json(403, { error: 'members_only' })
  const myId = me.openfront_id

  if (pathname === '/api/card-social') {
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
    const counts = {}
    for (const sql of [
      'SELECT author_openfront_id AS id, COUNT(*) AS n FROM cyn_game_comments GROUP BY author_openfront_id',
      'SELECT author_openfront_id AS id, COUNT(*) AS n FROM cyn_profile_comments GROUP BY author_openfront_id',
      'SELECT from_openfront_id AS id, COUNT(*) AS n FROM cyn_kudos GROUP BY from_openfront_id',
    ]) {
      const { results } = await env.DB.prepare(sql).all()
      for (const r of results ?? []) counts[r.id] = (counts[r.id] ?? 0) + Number(r.n)
    }
    return new Response(JSON.stringify({ counts }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } })
  }

  if (pathname === '/api/boosters/me') {
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
    return json(200, publicState(await stateOf(env, myId)))
  }

  if (pathname === '/api/boosters/collection') {
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
    const id = searchParams.get('id') ?? myId
    if (!ID.test(id)) return json(400, { error: 'bad_id' })
    const state = await env.DB.prepare('SELECT opened_total FROM cyn_booster_state WHERE openfront_id = ?').bind(id).first()
    return json(200, { id, openedTotal: state?.opened_total ?? 0, cards: await collectionOf(env, id) })
  }

  if (pathname === '/api/boosters/open') {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
    if (!siteOriginAllowed(request, env)) return json(403, { error: 'bad_origin' })
    await stateOf(env, myId)
    const now = Date.now()
    const today = berlinDay(now)
    const stamp = new Date(now).toISOString()
    // the free booster of the day first; each step is one conditional update, so two clicks at once cannot take it twice
    let source = null
    const free = await env.DB.prepare('UPDATE cyn_booster_state SET last_free_day = ?, last_open_at = ?, opened_total = opened_total + 1 WHERE openfront_id = ? AND (last_free_day IS NULL OR last_free_day != ?)').bind(today, stamp, myId, today).run()
    if (free.meta?.changes === 1) source = 'free'
    else {
      const extra = await env.DB.prepare('UPDATE cyn_booster_state SET extra = extra - 1, last_open_at = ?, opened_total = opened_total + 1 WHERE openfront_id = ? AND extra > 0').bind(stamp, myId).run()
      if (extra.meta?.changes === 1) source = 'extra'
    }
    if (!source) return json(409, { error: 'no_booster' })
    const { results } = await env.DB.prepare('SELECT openfront_id FROM cyn_members').all()
    const pool = (results ?? []).map((r) => r.openfront_id)
    const cards = drawPack(pool)
    const boosterId = crypto.randomUUID()
    await env.DB.batch(cards.map((c) => env.DB.prepare('INSERT INTO cyn_card_pulls (openfront_id, booster_id, card_id, rarity, source, pulled_at) VALUES (?, ?, ?, ?, ?, ?)').bind(myId, boosterId, c.card_id, c.rarity, source, stamp)))
    return json(200, { boosterId, source, cards, state: publicState(await stateOf(env, myId), now) })
  }

  if (pathname === '/api/boosters/grant') {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
    if (!siteOriginAllowed(request, env)) return json(403, { error: 'bad_origin' })
    if (!(await env.DB.prepare('SELECT 1 AS x FROM cyn_event_admins WHERE user_id = ? LIMIT 1').bind(user.id).first())) return json(403, { error: 'admins_only' })
    let body
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'bad_json' })
    }
    const target = typeof body?.openfront_id === 'string' ? body.openfront_id : ''
    const count = Number(body?.count)
    if (!ID.test(target) || !Number.isInteger(count) || count < 1 || count > 50) return json(400, { error: 'bad_request' })
    if (!(await env.DB.prepare('SELECT 1 AS x FROM cyn_members WHERE openfront_id = ?').bind(target).first())) return json(404, { error: 'unknown_member' })
    await env.DB.prepare('INSERT INTO cyn_booster_state (openfront_id, extra) VALUES (?, ?) ON CONFLICT(openfront_id) DO UPDATE SET extra = MIN(?, extra + ?)').bind(target, Math.min(count, MAX_ON_HAND), MAX_ON_HAND, count).run()
    const row = await env.DB.prepare('SELECT extra FROM cyn_booster_state WHERE openfront_id = ?').bind(target).first()
    return json(200, { ok: true, extra: row?.extra ?? 0 })
  }

  return json(404, { error: 'not_found' })
}
