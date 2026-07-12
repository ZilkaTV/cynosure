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
        config?: { gameMap?: string }
        players?: GamePlayerStat[]
      }
    }
    const info = json.info
    if (info) {
      detail = {
        gameId: info.gameID ?? gameId,
        map: info.config?.gameMap ?? '?',
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
