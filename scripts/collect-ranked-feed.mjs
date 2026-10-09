#!/usr/bin/env node
// Feeds the "Live Ranked Queue" page: finished ranked 1v1 / 2v2 games in which at least one top-100 player took part.
//
// Source: OpenFront's official public API - GET /public/games (list of finished games in a time window) and
// GET /public/game/:id (players + winner). The top-100 boards come from the Worker's own copy (blob "ranked"/"roster").
//
// Privacy by construction: only display-ready player entries are stored. A player whose in-game name is NOT the name
// of their ranked account (someone playing under another name) is stored with the in-game name and a rank BAND only -
// never the public id, the account name, the exact rank or the Elo. Only players using their own name get the exact rank.
// A salted hash of the public id is kept so "how many different top-100 players were active" can be counted.
import crypto from 'node:crypto'
import { usersDb, usersDbEnabled } from './lib/usersdb.mjs'
import { hotEnabled, hotGetBlob, hotPutBlob } from './lib/hotstore.mjs'

const API = 'https://api.openfront.io/public'
const UA = 'CynosureClanSite (cynclan.com)'
const CURSOR_ID = 'ranked-feed-cursor'
const FIRST_RUN_LOOKBACK_MS = 6 * 3600_000
const KEEP_DAYS = 14
const MAX_DETAILS_PER_RUN = 450
const CONCURRENCY = 10

if (!usersDbEnabled() || !hotEnabled()) {
  console.error('HOT_API_SECRET missing')
  process.exit(1)
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
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

// The list endpoint returns at most 1000 games per call (and only 50 without a limit): ask in slices and split a slice
// again when it comes back full, so no game is missed after a longer gap.
async function fetchGames(fromMs, toMs, depth = 0) {
  const url = `${API}/games?start=${encodeURIComponent(new Date(fromMs).toISOString())}&end=${encodeURIComponent(new Date(toMs).toISOString())}&type=Public&limit=1000`
  const page = await getJson(url)
  if (page.length < 1000 || depth >= 6 || toMs - fromMs < 60_000) return page
  const mid = Math.floor((fromMs + toMs) / 2)
  const byId = new Map()
  for (const g of [...(await fetchGames(fromMs, mid, depth + 1)), ...(await fetchGames(mid, toMs, depth + 1))]) byId.set(g.game, g)
  return [...byId.values()]
}

// ── top-100 boards ──────────────────────────────────────────────────────────
const WORKER = process.env.HOT_API_BASE || 'https://cynosure.xa9087dwbu5631opu09x357q2.workers.dev'

/** The top-100 boards right now: the Worker scans them itself (GitHub's runners get OpenFront's bot challenge there). */
async function fetchLiveBoards() {
  const res = await fetch(`${WORKER}/api/internal/hot/ranked-live`, { headers: { Authorization: `Bearer ${process.env.HOT_API_SECRET}`, 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`ranked-live ${res.status}`)
  return await res.json()
}

async function loadBoards(live) {
  const ranked = live ?? (await hotGetBlob('ranked').catch(() => null))
  const roster = await hotGetBlob('roster').catch(() => null)
  const pick = (k) => (ranked?.[k] && Object.keys(ranked[k]).length ? ranked[k] : roster?.[k]) ?? {}
  return { '1v1': pick('ranked_1v1'), '2v2': pick('ranked_2v2') }
}

const normName = (s) => String(s ?? '').toLowerCase().replace(/\.\d{3,4}$/, '').replace(/\s+/g, ' ').trim()
const band = (rank) => (rank <= 25 ? 'Top 25' : rank <= 50 ? 'Top 50' : rank <= 75 ? 'Top 75' : 'Top 100')
const hashId = (id) => crypto.createHmac('sha256', process.env.HOT_API_SECRET).update(`ranked-feed:${id}`).digest('hex').slice(0, 10)

function buildMatch(game, detail, board) {
  const info = detail.info
  const players = info.players ?? []
  const winner = Array.isArray(info.winner) ? info.winner : []
  const winnerIds = new Set(winner[0] === 'team' ? winner.slice(2) : winner[0] === 'player' ? [winner[1]] : [])
  let top = 0
  const owners = []
  const out = players.map((p, i) => {
    const entry = p.publicID ? board[p.publicID] : null
    const entryNames = entry ? [normName(entry.accountUsername), normName(entry.username)] : []
    const ownName = entry && entryNames.includes(normName(p.username))
    if (entry) top++
    if (ownName) owners.push({ k: hashId(p.publicID), pid: p.publicID })
    return {
      n: String(p.username ?? '').slice(0, 40),
      t: p.clanTag ?? null,
      s: p.teamIndex ?? i,
      w: winnerIds.has(p.clientID),
      ...(entry ? { k: hashId(p.publicID) } : {}),
      ...(ownName ? { r: entry.rank, e: entry.elo, id: p.publicID } : entry ? { b: band(entry.rank) } : {}),
    }
  })
  if (top === 0) return null
  return {
    owners,
    game_id: game.game,
    ladder: game.rankedType,
    ended_at: new Date(info.end ?? Date.parse(game.end)).toISOString(),
    duration_s: info.duration ?? Math.round((Date.parse(game.end) - Date.parse(game.start)) / 1000),
    map: info.config?.gameMap ?? null,
    top_count: top,
    players: out,
  }
}

let backfillOnce = true

// ── Elo changes ─────────────────────────────────────────────────────────────
// OpenFront publishes no Elo change per game, but the top-100 boards move when a game ends. Every pass compares the
// boards with the previous pass and remembers each change as an event; a finished game then takes the next unused event
// of each of its own-name players (same ladder, within a few minutes after the game ended) as that player's Elo change.
// Kept server-side in the blob "ranked-elo" (public ids included - never shown): { snap, events, pending }.
const EVENT_KEEP_MS = 3 * 3600_000
const PENDING_KEEP_MS = 25 * 60_000
const compactBoards = (doc) => ({ '1v1': Object.fromEntries(Object.entries(doc.ranked_1v1 ?? {}).map(([id, e]) => [id, e.elo])), '2v2': Object.fromEntries(Object.entries(doc.ranked_2v2 ?? {}).map(([id, e]) => [id, e.elo])) })
let eloState = null

async function loadEloState() {
  if (!eloState) eloState = (await hotGetBlob('ranked-elo').catch(() => null)) ?? { snap: null, events: [], pending: [] }
  return eloState
}

function diffBoards(state, live, nowMs) {
  const next = compactBoards(live)
  if (state.snap) {
    for (const l of ['1v1', '2v2']) {
      for (const [pid, elo] of Object.entries(next[l])) {
        const before = state.snap[l]?.[pid]
        if (before != null && before !== elo) state.events.push({ pid, l, from: before, to: elo, t: nowMs })
      }
    }
  }
  state.snap = next
  state.events = state.events.filter((e) => nowMs - e.t < EVENT_KEEP_MS)
}

/** Hands out events to waiting games; returns { gameId -> { k -> change } } for the games that got new changes. */
function resolvePending(state, nowMs) {
  const updates = {}
  for (const g of [...state.pending].sort((a, b) => a.ended - b.ended)) {
    for (const o of g.ps) {
      if (o.d !== undefined) continue
      const ev = state.events.find((e) => !e.used && e.pid === o.pid && e.l === g.l && e.t >= g.ended - 120_000 && e.t <= g.ended + 15 * 60_000)
      if (!ev) continue
      ev.used = true
      o.d = ev.to - ev.from
      ;(updates[g.id] ??= {})[o.k] = o.d
    }
  }
  state.pending = state.pending.filter((g) => nowMs - g.ended < PENDING_KEEP_MS && g.ps.some((o) => o.d === undefined))
  return updates
}

async function main() {
  const live = await fetchLiveBoards().catch((err) => {
    console.error('live boards unavailable, using the stored copy:', err.message ?? err)
    return null
  })
  const boards = await loadBoards(live)
  const state = await loadEloState()
  if (live) diffBoards(state, live, Date.now())
  if (!Object.keys(boards['1v1']).length && !Object.keys(boards['2v2']).length) throw new Error('no top-100 boards available')

  const cursorRow = (await usersDb.from('cyn_metrics_channel_state').select('last_message_id').eq('channel_id', CURSOR_ID).maybeSingle()).data
  const now = Date.now()
  // RANKED_FEED_BACKFILL_HOURS: the first pass of a manual run looks that far back instead of starting at the cursor.
  const backfillMs = backfillOnce ? Number(process.env.RANKED_FEED_BACKFILL_HOURS || 0) * 3600_000 : 0
  backfillOnce = false
  const start = backfillMs > 0 ? now - Math.min(backfillMs, 24 * 3600_000) : cursorRow?.last_message_id ? Math.max(Date.parse(cursorRow.last_message_id) - 3 * 60_000, now - 24 * 3600_000) : now - FIRST_RUN_LOOKBACK_MS
  const list = await fetchGames(start, now)
  const ranked = list.filter((g) => g.rankedType === '1v1' || g.rankedType === '2v2')
  console.log(`window ${new Date(start).toISOString()} -> now: ${list.length} public games, ${ranked.length} ranked`)

  const have = new Set()
  for (let i = 0; i < ranked.length; i += 80) {
    const { data } = await usersDb.from('cyn_ranked_matches').select('game_id').in('game_id', ranked.slice(i, i + 80).map((g) => g.game))
    for (const r of data ?? []) have.add(r.game_id)
  }
  const pendingAll = ranked.filter((g) => !have.has(g.game)).sort((a, b) => Date.parse(a.end) - Date.parse(b.end))
  const todo = pendingAll.slice(0, MAX_DETAILS_PER_RUN)

  let stored = 0
  let skipped = 0
  let failed = 0
  let newestHandled = start
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (g) => {
        try {
          const detail = await getJson(`${API}/game/${encodeURIComponent(g.game)}?turns=false`)
          const row = buildMatch(g, detail, boards[g.rankedType] ?? {})
          if (!row) skipped++
          else {
            const { owners, ...dbRow } = row
            const { error } = await usersDb.from('cyn_ranked_matches').upsert(dbRow, { onConflict: 'game_id' })
            if (error) throw error
            stored++
            if (owners.length) state.pending.push({ id: row.game_id, l: row.ladder, ended: Date.parse(row.ended_at), ps: owners })
          }
          newestHandled = Math.max(newestHandled, Date.parse(g.end))
        } catch (err) {
          failed++
          console.error(`game ${g.game}:`, err.message ?? err)
        }
      }),
    )
  }
  // Elo changes that became known: write them into the stored games, then keep the state for the next pass.
  const updates = resolvePending(state, Date.now())
  for (const [gameId, byK] of Object.entries(updates)) {
    const { data: row } = await usersDb.from('cyn_ranked_matches').select('players').eq('game_id', gameId).maybeSingle()
    if (!row) continue
    const players = row.players.map((p) => (p.k && byK[p.k] !== undefined ? { ...p, d: byK[p.k] } : p))
    await usersDb.from('cyn_ranked_matches').update({ players }).eq('game_id', gameId)
  }
  await hotPutBlob('ranked-elo', JSON.stringify(state)).catch((err) => console.error('could not save the Elo state:', err.message ?? err))

  // Everything handled and nothing failed: the next window starts at "now". Otherwise it restarts from the newest
  // handled game (minus the 3-minute overlap above), so a failed or left-over game is tried again.
  if (failed === 0 && todo.length === pendingAll.length) newestHandled = Math.max(newestHandled, now - 60_000)
  await usersDb.from('cyn_metrics_channel_state').upsert({ channel_id: CURSOR_ID, last_message_id: new Date(newestHandled).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'channel_id' })

  const cutoff = new Date(now - KEEP_DAYS * 86400_000).toISOString()
  await usersDb.from('cyn_ranked_matches').delete().lt('ended_at', cutoff)
  console.log(JSON.stringify({ stored, skippedNoTop100: skipped, failed, leftOver: pendingAll.length - todo.length, elo: { liveBoards: Boolean(live), events: state.events.length, pending: state.pending.length, resolved: Object.keys(updates).length } }))
  process.exitCode = failed > 4 && failed > todo.length / 2 ? 1 : 0
}

// RANKED_FEED_LOOP_MS > 0: keep polling once a minute for that long, so the page is at most about a minute behind
// while the workflow (dispatched every 10 minutes) is running.
const loopMs = Number(process.env.RANKED_FEED_LOOP_MS || 0)
const until = Date.now() + loopMs
for (;;) {
  await main().catch((err) => {
    console.error('collect-ranked-feed failed:', err)
    process.exitCode = 1
  })
  if (Date.now() + 60_000 >= until) break
  await new Promise((r) => setTimeout(r, 60_000))
}
