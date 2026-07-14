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

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    if (Date.now() - env.ts > CACHE_TTL_MS) return null
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

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 429) throw new Error('rate-limited')
  if (!res.ok) throw new Error(`OpenFront API ${res.status}`)
  const json = await res.json()
  markFetched()
  return json
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

/**
 * A player's full game history: the default feed (FFA/Team) merged with the
 * ranked feed (1v1), de-duplicated by gameId. Cached per player.
 */
export async function fetchPlayerGames(publicId: string, maxPages = 25): Promise<PlayerGame[]> {
  const key = `${CACHE_NS}:games:${publicId}`
  const cached = cacheGet<PlayerGame[]>(key)
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

/** Full post-game report for one game (players + per-player stats). Cached. */
export async function fetchGameDetail(gameId: string): Promise<GameDetail | null> {
  const key = `${CACHE_NS}:detail:${gameId}`
  const cached = cacheGet<GameDetail | null>(key)
  if (cached !== null) return cached

  let detail: GameDetail | null = null
  try {
    const json = (await getJson(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=false`)) as {
      info?: {
        gameID?: string
        duration?: number
        num_turns?: number
        start?: number
        winner?: [string, string] | null
        config?: { gameMap?: string; gameType?: string; nations?: string; bots?: number }
        players?: GamePlayerStat[]
      }
    }
    const info = json.info
    if (info) {
      detail = {
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
    }
  } catch {
    detail = null
  }
  cacheSet(key, detail)
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

/**
 * The `duration` OpenFront reports is how long the connection stayed open,
 * NOT how long it took to win - a player can win, then leave the game/replay
 * running (watching, idle, disconnect delay), inflating `duration` well past
 * the actual result. Confirmed on a real submitted run: last real action at
 * turn 3771 (~6:17) but reported duration was 18:18.
 *
 * This walks the turn log backwards for the last turn with a real action
 * (anything besides "mark_disconnected", which fires continuously even while
 * idle) and converts its turn number to seconds using the server's fixed
 * tick rate, giving the actual time-to-decide instead of time-to-disconnect.
 */
export async function fetchLastActionSeconds(gameId: string): Promise<number | null> {
  const key = `${CACHE_NS}:lastaction:${gameId}`
  const cached = cacheGet<number | null>(key)
  if (cached !== null) return cached

  let seconds: number | null = null
  try {
    const json = (await getJson(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=true`)) as {
      turns?: { turnNumber: number; intents?: { type: string }[] }[]
    }
    const turns = json.turns ?? []
    for (let i = turns.length - 1; i >= 0; i--) {
      const real = (turns[i].intents ?? []).some((x) => x.type !== 'mark_disconnected')
      if (real) {
        seconds = turns[i].turnNumber / SERVER_TICKS_PER_SECOND
        break
      }
    }
  } catch {
    seconds = null
  }
  cacheSet(key, seconds)
  return seconds
}

export async function fetchGameClanTags(gameId: string): Promise<string[]> {
  const key = `${CACHE_NS}:game:${gameId}`
  const cached = cacheGet<string[]>(key)
  if (cached) return cached

  let tags: string[] = []
  try {
    const json = (await getJson(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=false`)) as {
      info?: { players?: Array<{ clanTag?: string | null }> }
    }
    tags = (json.info?.players ?? []).map((p) => p.clanTag ?? '').filter(Boolean)
  } catch {
    tags = []
  }
  cacheSet(key, tags)
  return tags
}
