// ── OpenFront public API client ─────────────────────────────────────────────
// All data on this site comes straight from OpenFront's public API. There is
// no server in between: we fetch in the browser and cache results in
// localStorage (OpenFront rate-limits are strict and elo only updates hourly,
// so a 1-hour cache is both kind to the API and accurate).

import { CACHE_TTL_MS, CLAN_TAG, LEADERBOARD_SCAN_PAGES } from '../config'

// Same-origin proxy path (see vite.config.ts for dev, api/of/ for prod). This
// avoids CORS — the OpenFront API doesn't allow direct browser calls — and lets
// the server share one cache across visitors, which keeps us under rate limits.
const API_BASE = '/api/of'

// ── Types (mirroring the documented API shapes) ─────────────────────────────

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
  start: string // ISO timestamp
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

export interface ClanLeaderboardEntry {
  clanTag: string
  games: number
  wins: number
  losses: number
  playerSessions: number
  weightedWins: number
  weightedLosses: number
  weightedWLRatio: number
}

// ── localStorage cache ──────────────────────────────────────────────────────

// Bump when the cache shape or fetch logic changes so stale entries are ignored.
const CACHE_NS = 'of:v2'

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
    /* quota / private mode — ignore, we just re-fetch next time */
  }
}

export function clearOpenFrontCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('of:'))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 429) throw new Error('rate-limited')
  if (!res.ok) throw new Error(`OpenFront API ${res.status}`)
  return res.json()
}

// ── Ranked 1v1 leaderboard (this is where elo lives) ────────────────────────

async function fetchRankedPage(page: number): Promise<RankedEntry[]> {
  const json = (await getJson(`${API_BASE}/leaderboard/ranked?page=${page}`)) as
    | { '1v1'?: RankedEntry[]; message?: string }
    | undefined
  return json?.['1v1'] ?? []
}

/**
 * Scan the top of the ranked ladder and return every player carrying the CYN
 * tag, keyed by public id. Cached for CACHE_TTL_MS.
 */
export async function fetchCynRanked(): Promise<Record<string, RankedEntry>> {
  const key = `${CACHE_NS}:ranked:${CLAN_TAG}`
  const cached = cacheGet<Record<string, RankedEntry>>(key)
  if (cached) return cached

  const byId: Record<string, RankedEntry> = {}
  for (let page = 1; page <= LEADERBOARD_SCAN_PAGES; page++) {
    let entries: RankedEntry[]
    try {
      entries = await fetchRankedPage(page)
    } catch {
      break // rate-limited or error — keep whatever we have
    }
    if (entries.length === 0) break
    for (const e of entries) {
      if (e.clanTag === CLAN_TAG) byId[e.public_id] = e
    }
  }
  cacheSet(key, byId)
  return byId
}

// ── Per-player game history ─────────────────────────────────────────────────

/**
 * Fetch a player's public game history (paginated via nextCursor), capped so a
 * single visitor never hammers the API. Cached per player.
 */
export async function fetchPlayerGames(publicId: string, maxPages = 12): Promise<PlayerGame[]> {
  const key = `${CACHE_NS}:games:${publicId}`
  const cached = cacheGet<PlayerGame[]>(key)
  if (cached) return cached

  const all: PlayerGame[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${API_BASE}/public/player/${encodeURIComponent(publicId)}/games`, window.location.origin)
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
  cacheSet(key, all)
  return all
}

// ── Clan aggregate (lifetime team-game W/L, decayed) ────────────────────────

export async function fetchClanLeaderboardEntry(): Promise<ClanLeaderboardEntry | null> {
  const key = `${CACHE_NS}:clanlb:${CLAN_TAG}`
  const cached = cacheGet<ClanLeaderboardEntry | null>(key)
  if (cached !== null) return cached

  let entry: ClanLeaderboardEntry | null = null
  try {
    const json = (await getJson(`${API_BASE}/public/clans/leaderboard`)) as {
      clans?: ClanLeaderboardEntry[]
    }
    entry = json.clans?.find((c) => c.clanTag === CLAN_TAG) ?? null
  } catch {
    entry = null
  }
  cacheSet(key, entry)
  return entry
}
