// ── OpenFront public API client ─────────────────────────────────────────────
// All data comes straight from OpenFront's public API, fetched in the browser
// through a same-origin proxy (see vite.config.ts / api/of.js) and cached in
// localStorage. The proxy also shares one CDN cache across visitors, which
// keeps us under OpenFront's strict rate limits.

import { CACHE_TTL_MS, LEADERBOARD_SCAN_PAGES } from '../config'

const API_BASE = '/api/of'

// ── Types ───────────────────────────────────────────────────────────────────

export interface RankedEntry {
  rank: number
  elo: number
  peakElo: number | null
  wins: number
  losses: number
  total: number
  public_id: string
  username: string
  clanTag: string | null
}

export interface PlayerGame {
  gameId: string
  start: string
  durationSeconds: number
  map: string
  mode: 'Free For All' | 'Team' | string
  type: 'Public' | 'Private' | 'Singleplayer' | string
  playerTeams: string | null
  rankedType: 'unranked' | '1v1' | string
  result: 'victory' | 'defeat' | 'incomplete'
  totalPlayers: number | null
  username: string
  clanTag: string | null
}

// ── Cache ─────────────────────────────────────────────────────────────────

const CACHE_NS = 'of:v3'
const LAST_FETCH_KEY = `${CACHE_NS}:lastFetch`

interface CacheEnvelope<T> {
  ts: number
  data: T
}

function cacheGet<T>(key: string, ttlMs: number = CACHE_TTL_MS): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    if (Date.now() - env.ts > ttlMs) return null
    return env.data
  } catch {
    return null
  }
}

function cacheSet<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data } satisfies CacheEnvelope<T>))
  } catch {
    /* quota / private mode */
  }
}

// A completed game's own data (its player list, per-player stats, last real
// action) never changes - re-fetching it every CACHE_TTL_MS like the rest of
// this cache (built for genuinely time-varying data: rankings, in-progress
// game lists) is needless repeat load on OpenFront's API for an answer that
// was already known. Cached with no expiry via `cachePermGet`/`cachePermSet`
// below, used by fetchGameDetail/fetchLastActionSeconds/fetchGameClanTags -
// each of those still only *writes* here on a genuinely successful fetch, so
// a rate-limited/failed attempt is retried on the next visit rather than
// getting stuck (there's nothing stable to cache from a failure).
//
// Distinguishing "never fetched" from "fetched and the real answer is null"
// (fetchLastActionSeconds legitimately returns null for some games) needs an
// explicit wrapper - `data !== null` can't tell those apart, since null is
// itself a valid permanent answer here.
interface PermCacheEnvelope<T> {
  data: T
}

function cachePermGet<T>(key: string): { hit: true; data: T } | { hit: false } {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { hit: false }
    const env = JSON.parse(raw) as PermCacheEnvelope<T>
    return { hit: true, data: env.data }
  } catch {
    return { hit: false }
  }
}

function cachePermSet<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data } satisfies PermCacheEnvelope<T>))
  } catch {
    /* quota / private mode */
  }
}

function markFetched() {
  try {
    localStorage.setItem(LAST_FETCH_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/** Timestamp (ms) of the most recent successful network fetch, if any. */
export function getLastUpdated(): number | null {
  try {
    const v = localStorage.getItem(LAST_FETCH_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function clearOpenFrontCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_NS))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

// Bulk callers (buildRoster's game-detail lookups in particular - up to ~140
// of them from one roster build, confirmed directly) fire many requests
// concurrently via Promise.all with no throttling of their own. A burst that
// size reliably trips OpenFront's rate limit, and a single 429 anywhere in
// it used to just silently produce a permanent-for-that-load `null` (a
// member's kills/gold quietly showing "-" with no error, no indication it
// was ever attempted, and no retry).
//
// Fixed structurally at this one shared layer rather than by throttling each
// current bulk caller individually (which a future one could just as easily
// forget to do): every call to getJson passes through a small global
// concurrency gate first, so no matter how many logical requests any part of
// the app fires at once, at most MAX_CONCURRENT_REQUESTS ever reach the
// network simultaneously - the rate limit that caused this can't be
// retriggered by request *volume* again. A 429 that still gets through
// (OpenFront tightening its limit further, multiple browser tabs contending,
// etc.) is retried with backoff on top of that.
const MAX_CONCURRENT_REQUESTS = 6
const RATE_LIMIT_RETRIES = 4
const RATE_LIMIT_BASE_DELAY_MS = 500

let activeRequests = 0
const requestQueue: (() => void)[] = []

function acquireRequestSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++
    return Promise.resolve()
  }
  return new Promise((resolve) => requestQueue.push(resolve))
}

function releaseRequestSlot() {
  const next = requestQueue.shift()
  if (next) next() // slot passes straight to the next waiter - activeRequests stays the same
  else activeRequests--
}

async function getJson(url: string): Promise<unknown> {
  await acquireRequestSlot()
  try {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (res.status === 429) {
        if (attempt >= RATE_LIMIT_RETRIES) throw new Error('rate-limited')
        await new Promise((r) => setTimeout(r, RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt))
        continue
      }
      if (!res.ok) throw new Error(`OpenFront API ${res.status}`)
      const json = await res.json()
      markFetched()
      return json
    }
  } finally {
    releaseRequestSlot()
  }
}

// ── Ranked leaderboard (the only source of elo - top 100 players) ───────────

async function fetchRankedPage(page: number): Promise<RankedEntry[]> {
  const json = (await getJson(`${API_BASE}/leaderboard/ranked?page=${page}`)) as { '1v1'?: RankedEntry[] }
  return json?.['1v1'] ?? []
}

/** Map of public_id → ranked entry for everyone on the ladder (top 100). */
export async function fetchRankedMap(): Promise<Record<string, RankedEntry>> {
  const key = `${CACHE_NS}:rankedmap`
  const cached = cacheGet<Record<string, RankedEntry>>(key)
  if (cached) return cached

  const byId: Record<string, RankedEntry> = {}
  for (let page = 1; page <= LEADERBOARD_SCAN_PAGES; page++) {
    let entries: RankedEntry[]
    try {
      entries = await fetchRankedPage(page)
    } catch {
      break
    }
    if (entries.length === 0) break
    for (const e of entries) byId[e.public_id] = e
  }
  cacheSet(key, byId)
  return byId
}

// ── trackerfront FFA leaderboard (for FFA ship badges) ──────────────────────

/** Map of display_name → FFA leaderboard position (global top 100). Cached. */
export async function fetchFfaLeaderboard(): Promise<Record<string, number>> {
  const key = `${CACHE_NS}:ffalb`
  const cached = cacheGet<Record<string, number>>(key)
  if (cached) return cached

  const byName: Record<string, number> = {}
  try {
    const json = (await getJson('/api/tf/api/public/leaderboard')) as Array<{ position: number; display_name: string }>
    for (const e of json ?? []) if (e.display_name) byName[e.display_name] = e.position
  } catch {
    /* leave empty - ship badges just stay unearned */
  }
  cacheSet(key, byName)
  return byName
}

// ── Per-player game history ─────────────────────────────────────────────────

async function fetchGamesPaged(publicId: string, filter: string | null, maxPages: number): Promise<PlayerGame[]> {
  const all: PlayerGame[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${API_BASE}/public/player/${encodeURIComponent(publicId)}/games`, window.location.origin)
    if (filter) url.searchParams.set('filter', filter)
    if (cursor) url.searchParams.set('cursor', cursor)
    let json: { results?: PlayerGame[]; nextCursor?: string | null }
    try {
      json = (await getJson(url.toString())) as typeof json
    } catch {
      break
    }
    all.push(...(json.results ?? []))
    cursor = json.nextCursor ?? null
    if (!cursor) break
  }
  return all
}

// A finished game can take a while to even appear here in the first place -
// OpenFront's own duration for a game reflects how long the connection
// stayed open (see fetchLastActionSeconds below), which suggests a game's
// record isn't necessarily finalized/listable until every player has
// actually left, not the moment the match is decided. That part is outside
// this site's control. What IS controllable is not stacking a long local
// cache on top of that: the general CACHE_TTL_MS (1 hour) was originally
// sized around elo updating hourly, not around how often a player's own
// list of played games changes, which is far more frequent. A shorter TTL
// here is safe now that bulk fetches are rate-limit-protected (see getJson's
// concurrency gate + retry in this file) - it was never the bottleneck.
const GAMES_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * A player's full game history: the default feed (FFA/Team) merged with the
 * ranked feed (1v1), de-duplicated by gameId. Cached per player.
 */
export async function fetchPlayerGames(publicId: string, maxPages = 25): Promise<PlayerGame[]> {
  const key = `${CACHE_NS}:games:${publicId}`
  const cached = cacheGet<PlayerGame[]>(key, GAMES_CACHE_TTL_MS)
  if (cached) return cached

  const [main, ranked] = await Promise.all([
    fetchGamesPaged(publicId, null, maxPages),
    fetchGamesPaged(publicId, 'ranked', Math.ceil(maxPages / 2)),
  ])
  const byGame = new Map<string, PlayerGame>()
  for (const g of [...main, ...ranked]) byGame.set(g.gameId, g)
  const merged = [...byGame.values()]
  cacheSet(key, merged)
  return merged
}

// ── Game detail (players + their clan tags, for team co-op detection) ───────

export interface GamePlayerStat {
  clientID: string
  username: string
  clanTag: string | null
  stats?: {
    attacks?: string[]
    gold?: string[]
    kills?: { victim: string; tick: string }[]
    killedAt?: string | null
    finalTiles?: string | null
    conquests?: string[]
  }
}

export interface GameDetail {
  gameId: string
  map: string
  gameType: string // "Public" | "Singleplayer" | "Private"
  nations: string // "enabled" | "disabled"
  bots: number
  durationSeconds: number
  numTurns: number
  winnerClientId: string | null
  start: number
  players: GamePlayerStat[]
}

/**
 * Full post-game report for one game (players + per-player stats). A
 * finished game's own record never changes, so this is cached forever, not
 * on the usual TTL - see the note above cachePermGet. A genuinely-absent
 * game (no `info` in an otherwise successful response) is a stable "no"
 * worth caching too; a network/rate-limit failure is not, so it's retried
 * on the next call instead of getting stuck.
 */
export async function fetchGameDetail(gameId: string): Promise<GameDetail | null> {
  const key = `${CACHE_NS}:detail:${gameId}`
  const cached = cachePermGet<GameDetail | null>(key)
  if (cached.hit) return cached.data

  const json = (await getJson(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=false`).catch(() => null)) as {
    info?: {
      gameID?: string
      duration?: number
      num_turns?: number
      start?: number
      winner?: [string, string] | null
      config?: { gameMap?: string; gameType?: string; nations?: string; bots?: number }
      players?: GamePlayerStat[]
    }
  } | null
  if (json === null) return null // fetch failed - not cached, try again next time

  const info = json.info
  const detail: GameDetail | null = info
    ? {
        gameId: info.gameID ?? gameId,
        map: info.config?.gameMap ?? '?',
        gameType: info.config?.gameType ?? '?',
        nations: info.config?.nations ?? '?',
        bots: info.config?.bots ?? 0,
        durationSeconds: info.duration ?? 0,
        numTurns: info.num_turns ?? 0,
        winnerClientId: Array.isArray(info.winner) ? info.winner[1] ?? null : null,
        start: info.start ?? 0,
        players: info.players ?? [],
      }
    : null
  cachePermSet(key, detail)
  return detail
}

// OpenFront's server ticks the simulation on a fixed 100ms interval
// (ServerEnv.turnIntervalMs() in their source - always 10 turns/second),
// it's not something to derive per-game. Deriving it from num_turns/duration
// instead is wrong whenever `duration` includes anything beyond pure
// ticking, which is exactly what happened on a real submitted run: that game
// computed to only 8.78 turns/sec that way, turning turn 3771 into 7:09
// instead of the correct 6:17.
const SERVER_TICKS_PER_SECOND = 10

// Every game starts with a spawn-phase countdown (picking where to land)
// before the match clock a player actually experiences starts moving - the
// engine's own config (Config.numSpawnPhaseTurns()) returns 100 turns (10s)
// for a Singleplayer game specifically, which every speedrun submission is
// (verifySpeedrun requires it). That countdown is included in a turn's raw
// turnNumber, so converting turnNumber straight to seconds over-counts every
// run by exactly this much - confirmed against two real submitted runs
// (previously stored as 6:17/5:45, real in-game times 6:07/5:35 - both off
// by precisely 10s, i.e. 100 ticks).
export const SINGLEPLAYER_SPAWN_PHASE_TURNS = 100

/**
 * The `duration` OpenFront reports is how long the connection stayed open,
 * NOT how long it took to win - a player can win, then leave the game/replay
 * running (watching, idle, disconnect delay), inflating `duration` well past
 * the actual result. Confirmed on a real submitted run: last real action at
 * turn 3771 (~6:17 before the spawn-phase correction, 6:07 after) but
 * reported duration was 18:18.
 *
 * This walks the turn log backwards for the last turn with a real action
 * (anything besides "mark_disconnected", which fires continuously even while
 * idle), converts its turn number to seconds using the server's fixed tick
 * rate, and subtracts the spawn-phase countdown - giving the actual
 * time-to-decide a player would see on their own in-game clock, not
 * time-to-disconnect and not time-including-the-pre-match-countdown.
 */
export async function fetchLastActionSeconds(gameId: string): Promise<number | null> {
  const key = `${CACHE_NS}:lastaction:${gameId}`
  const cached = cachePermGet<number | null>(key)
  if (cached.hit) return cached.data

  const json = (await getJson(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=true`).catch(() => null)) as {
    turns?: { turnNumber: number; intents?: { type: string }[] }[]
  } | null
  if (json === null) return null // fetch failed - not cached, try again next time

  const turns = json.turns ?? []
  let seconds: number | null = null
  for (let i = turns.length - 1; i >= 0; i--) {
    const real = (turns[i].intents ?? []).some((x) => x.type !== 'mark_disconnected')
    if (real) {
      seconds = Math.max(0, turns[i].turnNumber - SINGLEPLAYER_SPAWN_PHASE_TURNS) / SERVER_TICKS_PER_SECOND
      break
    }
  }
  cachePermSet(key, seconds)
  return seconds
}

export async function fetchGameClanTags(gameId: string): Promise<string[]> {
  const key = `${CACHE_NS}:game:${gameId}`
  const cached = cachePermGet<string[]>(key)
  if (cached.hit) return cached.data

  const json = (await getJson(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=false`).catch(() => null)) as {
    info?: { players?: Array<{ clanTag?: string | null }> }
  } | null
  if (json === null) return [] // fetch failed - not cached, try again next time

  const tags = (json.info?.players ?? []).map((p) => p.clanTag ?? '').filter(Boolean)
  cachePermSet(key, tags)
  return tags
}
