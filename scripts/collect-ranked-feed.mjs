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
import { hotEnabled, hotGetBlob } from './lib/hotstore.mjs'

const API = 'https://api.openfront.io/public'
const UA = 'CynosureClanSite (cynclan.com)'
const CURSOR_ID = 'ranked-feed-cursor'
const FIRST_RUN_LOOKBACK_MS = 6 * 3600_000
const KEEP_DAYS = 14
const MAX_DETAILS_PER_RUN = 150
const CONCURRENCY = 4

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
async function loadBoards() {
  const ranked = await hotGetBlob('ranked').catch(() => null)
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
  const out = players.map((p, i) => {
    const entry = p.publicID ? board[p.publicID] : null
    const entryNames = entry ? [normName(entry.accountUsername), normName(entry.username)] : []
    const ownName = entry && entryNames.includes(normName(p.username))
    if (entry) top++
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
    game_id: game.game,
    ladder: game.rankedType,
    ended_at: new Date(info.end ?? Date.parse(game.end)).toISOString(),
    duration_s: info.duration ?? Math.round((Date.parse(game.end) - Date.parse(game.start)) / 1000),
    map: info.config?.gameMap ?? null,
    top_count: top,
    players: out,
  }
}

async function main() {
  const boards = await loadBoards()
  if (!Object.keys(boards['1v1']).length && !Object.keys(boards['2v2']).length) throw new Error('no top-100 boards available')

  const cursorRow = (await usersDb.from('cyn_metrics_channel_state').select('last_message_id').eq('channel_id', CURSOR_ID).maybeSingle()).data
  const now = Date.now()
  const start = cursorRow?.last_message_id ? Math.max(Date.parse(cursorRow.last_message_id) - 3 * 60_000, now - 24 * 3600_000) : now - FIRST_RUN_LOOKBACK_MS
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
            const { error } = await usersDb.from('cyn_ranked_matches').upsert(row, { onConflict: 'game_id' })
            if (error) throw error
            stored++
          }
          newestHandled = Math.max(newestHandled, Date.parse(g.end))
        } catch (err) {
          failed++
          console.error(`game ${g.game}:`, err.message ?? err)
        }
      }),
    )
  }
  // Everything handled and nothing failed: the next window starts at "now". Otherwise it restarts from the newest
  // handled game (minus the 3-minute overlap above), so a failed or left-over game is tried again.
  if (failed === 0 && todo.length === pendingAll.length) newestHandled = Math.max(newestHandled, now - 60_000)
  await usersDb.from('cyn_metrics_channel_state').upsert({ channel_id: CURSOR_ID, last_message_id: new Date(newestHandled).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'channel_id' })

  const cutoff = new Date(now - KEEP_DAYS * 86400_000).toISOString()
  await usersDb.from('cyn_ranked_matches').delete().lt('ended_at', cutoff)
  console.log(JSON.stringify({ stored, skippedNoTop100: skipped, failed, leftOver: pendingAll.length - todo.length }))
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
