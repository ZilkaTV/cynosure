#!/usr/bin/env node
// Feeds the activity statistics on the Live Ranked Queue page: how many ranked 1v1 / 2v2 games OpenFront as a whole had per day and per hour.
//
// Source: OpenFront's official public API - GET /public/games (finished games in a time window, only the list: start, end, number of players,
// time the lobby needed to fill). No player data at all, and nothing about running games: only counts of games that are already over.
//
// Stored as the blob "ranked-activity": { updated_at, days: { "YYYY-MM-DD": { a: 1v1 games, b: 2v2 games, h: [24 starts per UTC hour],
// s: games shorter than a minute (nobody showed up / gave up at once), f: median seconds the lobby needed to fill } } }, 90 days.
// The first run reads FIRST_DAYS days, every later run only the last REFRESH_DAYS (a day is recounted completely, so late finishers are included).
import { hotEnabled, hotGetBlob, hotPutBlob } from './lib/hotstore.mjs'

const API = 'https://api.openfront.io/public'
const UA = 'CynosureClanSite (cynclan.com)'
const KEY = 'ranked-activity'
const DAY = 86_400_000
const KEEP_DAYS = 90
const FIRST_DAYS = 60
const REFRESH_DAYS = 2
const LADDERS = ['1v1', '2v2']

if (!hotEnabled()) {
  console.error('HOT_API_SECRET missing')
  process.exit(1)
}

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, ((Number(res.headers.get('retry-after')) || 10) + 1) * 1000))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === tries - 1) throw err
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

// The list returns at most 1000 games per call: a window that comes back full is split in two.
async function slice(ladder, from, to, depth = 0) {
  const url = `${API}/games?start=${encodeURIComponent(new Date(from).toISOString())}&end=${encodeURIComponent(new Date(to).toISOString())}&type=Public&rankedType=${ladder}&limit=1000`
  const page = await getJson(url)
  if (!Array.isArray(page)) throw new Error('bad_list')
  if (page.length < 1000 || depth >= 8 || to - from < 60_000) return page
  const mid = Math.floor((from + to) / 2)
  const byId = new Map()
  for (const g of [...(await slice(ladder, from, mid, depth + 1)), ...(await slice(ladder, mid, to, depth + 1))]) byId.set(g.game, g)
  return [...byId.values()]
}

const median = (list) => {
  const s = list.filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y)
  return s.length ? Math.round((s[s.length >> 1] / 1000) * 10) / 10 : null
}

/** One whole UTC day, counted from the list. Throws when any part of it could not be read. */
async function countDay(dayStart, nowMs) {
  const out = { a: 0, b: 0, h: Array(24).fill(0), s: 0, f: null }
  const fills = []
  for (let part = 0; part < 4; part++) {
    const from = dayStart + part * 6 * 3_600_000
    const to = Math.min(from + 6 * 3_600_000, nowMs)
    if (from >= nowMs) break
    for (const ladder of LADDERS) {
      for (const g of await slice(ladder, from, to)) {
        const start = Date.parse(g.start)
        if (!Number.isFinite(start)) continue
        if (ladder === '1v1') out.a++
        else out.b++
        out.h[new Date(start).getUTCHours()]++
        const end = Date.parse(g.end)
        if (Number.isFinite(end) && end - start < 60_000) out.s++
        if (typeof g.lobbyFillTime === 'number') fills.push(g.lobbyFillTime)
      }
    }
  }
  out.f = median(fills)
  return out
}

async function main() {
  const nowMs = Date.now()
  const stored = await hotGetBlob(KEY).catch(() => null)
  const doc = stored && typeof stored === 'object' && stored.days && typeof stored.days === 'object' ? stored : { days: {} }
  const days = { ...doc.days }
  const todayStart = Math.floor(nowMs / DAY) * DAY
  const count = Object.keys(days).length === 0 ? FIRST_DAYS : REFRESH_DAYS
  const todo = []
  for (let i = count - 1; i >= 0; i--) todo.push(todayStart - i * DAY)
  let failed = 0
  let next = 0
  const run = async () => {
    while (next < todo.length) {
      const dayStart = todo[next++]
      try {
        days[new Date(dayStart).toISOString().slice(0, 10)] = await countDay(dayStart, nowMs)
      } catch (err) {
        failed++
        console.error('day failed', new Date(dayStart).toISOString().slice(0, 10), err.message)
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, run))
  const oldest = new Date(todayStart - (KEEP_DAYS - 1) * DAY).toISOString().slice(0, 10)
  for (const k of Object.keys(days)) if (k < oldest) delete days[k]
  await hotPutBlob(KEY, JSON.stringify({ updated_at: new Date().toISOString(), days }))
  console.log(JSON.stringify({ days: Object.keys(days).length, refreshed: todo.length - failed, failed }))
  if (failed === todo.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
