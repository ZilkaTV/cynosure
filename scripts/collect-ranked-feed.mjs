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
// The games list filters by a game's START time, and a ranked game runs for minutes - so every pass looks this far back and
// remembers which games it already handled (state.checked) instead of fetching them again.
const GAME_LOOKBACK_MS = 35 * 60_000
const MAX_DETAILS_PER_RUN = 300
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
  // Only ranked games, one ladder per request (the API filters by rankedType), instead of every public game.
  const all = []
  for (const rankedType of ['1v1', '2v2']) all.push(...(await fetchLadder(rankedType, fromMs, toMs, depth)))
  return all
}

async function fetchLadder(rankedType, fromMs, toMs, depth) {
  const url = `${API}/games?start=${encodeURIComponent(new Date(fromMs).toISOString())}&end=${encodeURIComponent(new Date(toMs).toISOString())}&type=Public&rankedType=${rankedType}&limit=1000`
  const page = await getJson(url)
  if (page.length < 1000 || depth >= 6 || toMs - fromMs < 60_000) return page
  const mid = Math.floor((fromMs + toMs) / 2)
  const byId = new Map()
  for (const g of [...(await fetchLadder(rankedType, fromMs, mid, depth + 1)), ...(await fetchLadder(rankedType, mid, toMs, depth + 1))]) byId.set(g.game, g)
  return [...byId.values()]
}

// ── top-100 boards ──────────────────────────────────────────────────────────
const WORKER = process.env.HOT_API_BASE || 'https://cynosure.xa9087dwbu5631opu09x357q2.workers.dev'

/** The top-100 boards right now: the Worker scans them itself (GitHub's runners get OpenFront's bot challenge there). */
let lastLiveAt = 0
let lastLiveDoc = null

async function fetchLiveBoards() {
  // The boards change at most hourly, so one scan a minute is plenty even though the games are polled every 20 seconds.
  if (lastLiveDoc && Date.now() - lastLiveAt < 55_000) return lastLiveDoc
  lastLiveAt = Date.now()
  const res = await fetch(`${WORKER}/api/internal/hot/ranked-live`, { headers: { Authorization: `Bearer ${process.env.HOT_API_SECRET}`, 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`ranked-live ${res.status} ${(await res.text()).slice(0, 120)}`)
  lastLiveDoc = await res.json()
  return lastLiveDoc
}

async function loadBoards(live) {
  const ranked = live ?? (await hotGetBlob('ranked').catch(() => null))
  const roster = await hotGetBlob('roster').catch(() => null)
  const pick = (k) => (ranked?.[k] && Object.keys(ranked[k]).length ? ranked[k] : roster?.[k]) ?? {}
  return { '1v1': pick('ranked_1v1'), '2v2': pick('ranked_2v2') }
}

const normName = (s) => String(s ?? '').toLowerCase().replace(/\.\d{3,4}$/, '').replace(/\s+/g, ' ').trim()
const hashId = (id) => crypto.createHmac('sha256', process.env.HOT_API_SECRET).update(`ranked-feed:${id}`).digest('hex').slice(0, 10)

// The map column holds "<map> · <Normal|Compact>" (the map size of the lobby); older rows without the size are filled in
// by backfillMapSize below.
const mapLabel = (config) => (config?.gameMap ? `${config.gameMap} · ${config.gameMapSize === 'Compact' ? 'Compact' : 'Normal'}` : null)

async function backfillMapSize(limit = 40) {
  const { data } = await usersDb.from('cyn_ranked_matches').select('game_id, map').order('ended_at', { ascending: false }).limit(1500)
  const todo = (data ?? []).filter((r) => r.map && !r.map.includes(' · ')).slice(0, limit)
  for (const r of todo) {
    try {
      const detail = await getJson(`${API}/game/${encodeURIComponent(r.game_id)}?turns=false`)
      const label = mapLabel(detail.info?.config)
      if (label) await usersDb.from('cyn_ranked_matches').update({ map: label }).eq('game_id', r.game_id)
    } catch (err) {
      console.error(`map size ${r.game_id}:`, err.message ?? err)
    }
  }
  return todo.length
}

function buildMatch(game, detail, board, known) {
  const info = detail.info
  const players = info.players ?? []
  const winner = Array.isArray(info.winner) ? info.winner : []
  const winnerIds = new Set(winner[0] === 'team' ? winner.slice(2) : winner[0] === 'player' ? [winner[1]] : [])
  let top = 0
  const owners = []
  const out = players.map((p, i) => {
    const entry = p.publicID ? board[p.publicID] : null
    // A player who dropped out of the board for a moment (or whose board page failed) still counts as top 100 for a day.
    const isTop = Boolean(entry) || Boolean(p.publicID && known?.[p.publicID])
    const entryNames = entry ? [normName(entry.accountUsername), normName(entry.username)] : []
    const ownName = entry && entryNames.includes(normName(p.username))
    if (isTop) top++
    if (ownName) owners.push({ k: hashId(p.publicID), pid: p.publicID, w: winnerIds.has(p.clientID) })
    return {
      n: String(p.username ?? '').slice(0, 40),
      t: p.clanTag ?? null,
      s: p.teamIndex ?? i,
      w: winnerIds.has(p.clientID),
      ...(isTop ? { k: hashId(p.publicID) } : {}),
      ...(ownName ? { r: entry.rank, e: entry.elo, id: p.publicID } : isTop ? { b: 'Top 100' } : {}),
    }
  })
  if (top === 0) return null
  return {
    owners,
    game_id: game.game,
    ladder: game.rankedType,
    ended_at: new Date(info.end ?? Date.parse(game.end)).toISOString(),
    duration_s: info.duration ?? Math.round((Date.parse(game.end) - Date.parse(game.start)) / 1000),
    map: mapLabel(info.config),
    top_count: top,
    players: out,
  }
}

let backfillOnce = true

// ── Elo changes ─────────────────────────────────────────────────────────────
// OpenFront publishes no Elo change per game, and its public top-100 boards are cached for up to an hour
// (Cache-Control: max-age=3600): they change in one step, for everybody who played since the previous step. So every
// pass compares the boards with the previous pass; when a ladder's board moved, each player's change over that period
// is matched with the games the player finished in that period. Exactly one game: that game gets the exact change.
// Several games: the latest of them carries the total and the number of games (shown as a sum). Only players using their
// own name are tracked. Kept server-side in the blob "ranked-elo" (public ids included - never shown):
//   { snap, lastChange, batches, pending }
const PENDING_KEEP_MS = 110 * 60_000
const MAX_ELO_PER_GAME = 30
const BATCH_DELAY_MS = 3 * 60_000
const compactBoards = (doc) => ({ '1v1': Object.fromEntries(Object.entries(doc.ranked_1v1 ?? {}).map(([id, e]) => [id, e.elo])), '2v2': Object.fromEntries(Object.entries(doc.ranked_2v2 ?? {}).map(([id, e]) => [id, e.elo])) })
let eloState = null

async function loadEloState() {
  if (!eloState) {
    const saved = await hotGetBlob('ranked-elo').catch(() => null)
    eloState = { snap: null, lastChange: {}, batches: [], pending: [], known: { '1v1': {}, '2v2': {} }, checked: {}, ...(saved ?? {}) }
  }
  return eloState
}

function diffBoards(state, live, nowMs) {
  const next = compactBoards(live)
  if (state.snap) {
    for (const l of ['1v1', '2v2']) {
      const list = []
      for (const [pid, elo] of Object.entries(next[l])) {
        const before = state.snap[l]?.[pid]
        if (before != null && before !== elo) list.push({ pid, from: before, to: elo })
      }
      if (list.length === 0) continue
      // The board that just changed covers everything since the previous change (first time: the last ~65 minutes).
      const since = state.lastChange[l] ?? nowMs - 65 * 60_000
      state.lastChange[l] = nowMs
      state.batches.push({ l, since: since - 5 * 60_000, at: nowMs, list })
    }
  }
  state.snap = next
  // Remember who was in the top 100 during the last day (see buildMatch).
  for (const l of ['1v1', '2v2']) {
    state.known[l] ??= {}
    for (const pid of Object.keys(next[l])) state.known[l][pid] = nowMs
    for (const [pid, t] of Object.entries(state.known[l])) if (nowMs - t > 24 * 3600_000) delete state.known[l][pid]
  }
}

/** Matches board changes with games (after a short delay so freshly finished games are stored); returns { gameId -> { k -> {d, c} } }. */
function resolveBatches(state, nowMs) {
  const updates = {}
  const open = []
  for (const batch of state.batches) {
    if (nowMs - batch.at < BATCH_DELAY_MS) {
      open.push(batch)
      continue
    }
    for (const entry of batch.list) {
      const games = state.pending
        .filter((g) => g.l === batch.l && g.ended >= batch.since && g.ended <= batch.at && g.ps.some((o) => o.pid === entry.pid))
        .sort((x, y) => x.ended - y.ended)
      if (games.length === 0) continue
      const d = entry.to - entry.from
      const outcomeOf = (g) => g.ps.find((o) => o.pid === entry.pid)?.w
      // Several games in the period: the net change belongs to a game of the matching outcome - a net loss to the
      // latest game the player lost, a net gain to the latest game they won (never a win that "lost" points).
      let last = games[games.length - 1]
      if (games.length > 1 && d !== 0) {
        const match = [...games].reverse().find((g) => outcomeOf(g) === (d > 0))
        if (match) last = match
        else if (games.some((g) => outcomeOf(g) !== undefined)) continue // every game points the other way
      }
      const me = last.ps.find((o) => o.pid === entry.pid)
      // One game, but the change points the wrong way (a winner who lost points, a loser who gained): the player also
      // finished a game that is not stored (played under another name), so this game cannot be given the change.
      if (games.length === 1 && me.w !== undefined && (me.w ? d < 0 : d > 0)) continue
      // One game moves a rating by 30 at most; more than that means games we did not see (played under another name).
      if (Math.abs(d) > MAX_ELO_PER_GAME * games.length) continue
      ;(updates[last.id] ??= {})[me.k] = { d, ...(games.length > 1 ? { c: games.length } : {}) }
    }
  }
  state.batches = open
  state.pending = state.pending.filter((g) => nowMs - g.ended < PENDING_KEEP_MS)
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
  const start = backfillMs > 0 ? now - Math.min(backfillMs, 24 * 3600_000) : cursorRow?.last_message_id ? Math.max(Date.parse(cursorRow.last_message_id) - GAME_LOOKBACK_MS, now - 24 * 3600_000) : now - FIRST_RUN_LOOKBACK_MS
  const list = await fetchGames(start, now)
  const ranked = list.filter((g) => g.rankedType === '1v1' || g.rankedType === '2v2')
  console.log(`window ${new Date(start).toISOString()} -> now: ${list.length} public games, ${ranked.length} ranked`)

  const have = new Set()
  for (let i = 0; i < ranked.length; i += 80) {
    const { data } = await usersDb.from('cyn_ranked_matches').select('game_id').in('game_id', ranked.slice(i, i + 80).map((g) => g.game))
    for (const r of data ?? []) have.add(r.game_id)
  }
  const pendingAll = ranked.filter((g) => !have.has(g.game) && !state.checked[g.game]).sort((a, b) => Date.parse(a.end) - Date.parse(b.end))
  // Fresh games (ended in the last 20 minutes) always go first so the page stays current even while an older backlog is
  // being worked off; the backlog is then handled oldest-first with whatever capacity is left.
  const freshSince = now - 20 * 60_000
  const fresh = pendingAll.filter((g) => Date.parse(g.end) >= freshSince)
  const backlog = pendingAll.filter((g) => Date.parse(g.end) < freshSince)
  const backlogTodo = backlog.slice(0, Math.max(0, MAX_DETAILS_PER_RUN - fresh.length))
  const todo = [...fresh, ...backlogTodo]
  const freshIds = new Set(fresh.map((g) => g.game))

  let stored = 0
  let skipped = 0
  let failed = 0
  let newestHandled = start
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (g) => {
        try {
          const detail = await getJson(`${API}/game/${encodeURIComponent(g.game)}?turns=false`)
          const row = buildMatch(g, detail, boards[g.rankedType] ?? {}, state.known?.[g.rankedType])
          if (!row) skipped++
          else {
            const { owners, ...dbRow } = row
            const { error } = await usersDb.from('cyn_ranked_matches').upsert(dbRow, { onConflict: 'game_id' })
            if (error) throw error
            stored++
            // A cancelled 2v2 changes nobody's Elo; a 1v1 that did not take place still can (a player who never spawned loses
            // points unless OpenFront saw connection problems) - the board change tells which.
            const abandoned = (row.duration_s ?? 0) < 45 || !row.players.some((p) => p.w)
            if (owners.length && !(row.ladder === '2v2' && abandoned)) state.pending.push({ id: row.game_id, l: row.ladder, ended: Date.parse(row.ended_at), ps: owners })
          }
          state.checked[g.game] = now
          // Only the old backlog moves the cursor (it is handled oldest-first, by start time).
          if (!freshIds.has(g.game)) newestHandled = Math.max(newestHandled, Date.parse(g.start))
        } catch (err) {
          failed++
          console.error(`game ${g.game}:`, err.message ?? err)
        }
      }),
    )
  }
  // Elo changes that became known: write them into the stored games, then keep the state for the next pass.
  const updates = resolveBatches(state, Date.now())
  for (const [gameId, byK] of Object.entries(updates)) {
    const { data: row } = await usersDb.from('cyn_ranked_matches').select('players').eq('game_id', gameId).maybeSingle()
    if (!row) continue
    const players = row.players.map((p) => (p.k && byK[p.k] !== undefined ? { ...p, ...byK[p.k] } : p))
    await usersDb.from('cyn_ranked_matches').update({ players }).eq('game_id', gameId)
  }
  for (const [id, t] of Object.entries(state.checked)) if (Date.now() - t > 4 * 3600_000) delete state.checked[id]
  await hotPutBlob('ranked-elo', JSON.stringify(state)).catch((err) => console.error('could not save the Elo state:', err.message ?? err))

  // Everything handled and nothing failed: the next window starts at "now". Otherwise it restarts from the newest
  // handled game (minus the 3-minute overlap above), so a failed or left-over game is tried again.
  if (failed === 0 && backlogTodo.length === backlog.length) newestHandled = Math.max(newestHandled, now - 60_000)
  await usersDb.from('cyn_metrics_channel_state').upsert({ channel_id: CURSOR_ID, last_message_id: new Date(newestHandled).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'channel_id' })

  // Housekeeping (old rows, map size of old rows) scans the table, so it runs about once an hour, not every pass
  // (D1's free plan counts every row a query scans: 5 million a day).
  let sized = 0
  if (!state.lastMaintenance || now - state.lastMaintenance > 55 * 60_000) {
    sized = await backfillMapSize()
    const cutoff = new Date(now - KEEP_DAYS * 86400_000).toISOString()
    await usersDb.from('cyn_ranked_matches').delete().lt('ended_at', cutoff)
    state.lastMaintenance = now
    await hotPutBlob('ranked-elo', JSON.stringify(state)).catch(() => {})
  }
  console.log(JSON.stringify({ stored, skippedNoTop100: skipped, failed, leftOver: backlog.length - backlogTodo.length, mapSizeBackfilled: sized, fresh: fresh.length, ms: Date.now() - now, elo: { liveBoards: Boolean(live), batches: state.batches.length, pending: state.pending.length, resolved: Object.keys(updates).length } }))
  process.exitCode = failed > 4 && failed > todo.length / 2 ? 1 : 0
}

// RANKED_FEED_LOOP_MS > 0: keep polling every 20 seconds for that long, so the page is at most about half a minute behind
// while the workflow (dispatched every 10 minutes) is running.
const loopMs = Number(process.env.RANKED_FEED_LOOP_MS || 0)
const until = Date.now() + loopMs
for (;;) {
  await main().catch((err) => {
    console.error('collect-ranked-feed failed:', err)
    process.exitCode = 1
  })
  if (Date.now() + 20_000 >= until) break
  await new Promise((r) => setTimeout(r, 20_000))
}
