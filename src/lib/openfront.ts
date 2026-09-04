// ── OpenFront public API client ─────────────────────────────────────────────
// All data comes straight from OpenFront's public API, fetched in the browser
// through a same-origin proxy (see vite.config.ts / api/of.js) and cached in
// localStorage. The proxy also shares one CDN cache across visitors, which
// keeps us under OpenFront's strict rate limits.

import { CACHE_TTL_MS } from '../config'
import { supabase } from './supabase'

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
  // OpenFront's newer account-username system: `base.dddd` where the 4-digit
  // suffix marks an unverified/unclaimed account (verified accounts render
  // bare, no suffix). `null` on older/never-set accounts. See
  // splitAccountUsername below for parsing it into base + discriminator.
  accountUsername: string | null
  clanTag: string | null
}

// Mirrors OpenFront's own src/client/components/ui/UsernameText.ts: the
// suffix is always exactly 4 digits and a base can never itself contain a
// dot, so a trailing ".dddd" is unambiguous.
const ACCOUNT_USERNAME_DISCRIMINATOR = /^(.+)\.(\d{4})$/

/** Splits an OpenFront account username into its base name and 4-digit unverified-account suffix, if any. */
export function splitAccountUsername(accountUsername: string): { base: string; discriminator: string | null } {
  const match = ACCOUNT_USERNAME_DISCRIMINATOR.exec(accountUsername)
  if (!match) return { base: accountUsername, discriminator: null }
  return { base: match[1], discriminator: match[2] }
}

export interface PlayerGame {
  gameId: string
  start: string
  durationSeconds: number
  map: string
  mode: 'Free For All' | 'Team' | string
  type: 'Public' | 'Private' | 'Singleplayer' | string
  playerTeams: string | null
  rankedType: 'unranked' | '1v1' | '2v2' | string
  result: 'victory' | 'defeat' | 'incomplete'
  totalPlayers: number | null
  username: string
  clanTag: string | null
}

// ── Cache ─────────────────────────────────────────────────────────────────

// Bumped v3 -> v4: a since-fixed bug (clearOpenFrontCache wiping the
// permanent :lastgood:/:detail: caches it should never have touched) could
// have poisoned any browser's locally-cached game counts during the window
// it was live. Every key here is namespaced under CACHE_NS, so bumping this
// orphans every old entry at once - a plain reload self-heals for everyone,
// no manual cache-clearing or Refresh-button click needed. Safe to bump
// again in the same situation in the future.
const CACHE_NS = 'of:v4'
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

// Clears only the short-TTL freshness caches (games/rankedmap/ffalb/roster-
// cache-row), never the PERMANENT per-browser safety nets (`:lastgood:` -
// mergeAndCacheGames's own union of every game this browser has ever seen
// for a member, and `:detail:` - cached game details). Those two are
// designed to only ever grow, never shrink; wiping them here (as this used
// to do unconditionally) combined with fetchPlayerGamesBatch/
// fetchGameDetailsBatch no longer live-fetching to refill them was a real
// bug - confirmed directly against production data that a member's own
// browser-local history (accumulated from past live fetches, sometimes
// ahead of the shared cyn_member_games_cache row) got permanently discarded
// on every automatic background refresh, visibly undercounting wins that
// were never actually lost anywhere else.
/**
 * `includePermanent` also wipes the `:lastgood:`/`:detail:` caches described
 * above - normally never done (see that comment for why), but this is the
 * one legitimate exception: a last-resort recovery from `QuotaExceededError`
 * (see profiles.ts's saveLocalProfile) where the browser's per-origin
 * storage is genuinely full and something has to give. Safe specifically
 * now (unlike when that comment was written) because buildRoster no longer
 * depends on this browser's own local history catching OpenFront up live -
 * it reads cyn_roster_cache/cyn_member_games_cache/cyn_game_detail_cache
 * instead, so wiping this local copy just means re-fetching from those
 * shared caches, not losing data.
 */
export function clearOpenFrontCache(includePermanent = false) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_NS) && (includePermanent || (!k.includes(':lastgood:') && !k.includes(':detail:'))))
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

interface RosterCacheRow {
  ranked_1v1: Record<string, RankedEntry>
  ranked_2v2: Record<string, RankedEntry>
  ffa_leaderboard: Record<string, number>
}

// Both leaderboard maps below now come from ONE shared row (see
// cyn_roster_cache in supabase/schema.sql) instead of scanning
// OpenFront/trackerfront live on a cache miss - the 5-minute cron
// (scripts/refresh-details.mjs) already does that scan every run anyway (for
// elo snapshots) and writes the result here, so the browser never needs to.
// Fetched once and reused by both fetchRankedMap and fetchFfaLeaderboard
// below rather than one query each.
let rosterCacheRow: Promise<RosterCacheRow | null> | null = null

async function fetchRosterCacheRow(): Promise<RosterCacheRow | null> {
  if (!rosterCacheRow) {
    rosterCacheRow = (async () => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('cyn_roster_cache')
        .select('ranked_1v1, ranked_2v2, ffa_leaderboard')
        .eq('id', 1)
        .maybeSingle()
      if (error || !data) return null
      return data as RosterCacheRow
    })()
  }
  return rosterCacheRow
}

/** Map of public_id → ranked entry for everyone on each ladder (top 100). */
export async function fetchRankedMap(): Promise<{ oneVOne: Record<string, RankedEntry>; twoVTwo: Record<string, RankedEntry> }> {
  const key = `${CACHE_NS}:rankedmap2`
  const cached = cacheGet<{ oneVOne: Record<string, RankedEntry>; twoVTwo: Record<string, RankedEntry> }>(key)
  if (cached) return cached

  const row = await fetchRosterCacheRow()
  const result = { oneVOne: row?.ranked_1v1 ?? {}, twoVTwo: row?.ranked_2v2 ?? {} }
  cacheSet(key, result)
  return result
}

// ── trackerfront FFA leaderboard (for FFA ship badges) ──────────────────────

/** Map of display_name → FFA leaderboard position (global top 100). Cached. */
export async function fetchFfaLeaderboard(): Promise<Record<string, number>> {
  const key = `${CACHE_NS}:ffalb`
  const cached = cacheGet<Record<string, number>>(key)
  if (cached) return cached

  const row = await fetchRosterCacheRow()
  const byName = row?.ffa_leaderboard ?? {}
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
      // A page request failing here (rate limit surviving all of getJson's
      // retries, a network blip) used to just silently stop pagination and
      // hand back whatever had been collected so far - a plausible-looking
      // but truncated list, indistinguishable from "that's really all of
      // them". fetchPlayerGames unions this against every previously-seen
      // game, so an early break here only ever risks missing brand-new
      // games for this one refresh, never erasing ones already known.
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

// Shared per-member game-list cache (see supabase/schema.sql). Profiling a
// fully cold roster build (empty localStorage, 8 members) found this - not
// game-detail lookups - is the actual dominant cost of a first/cold page
// load: about half of OpenFront's own paginated `/games` responses came back
// 429 under that load, each one paying getJson's retry backoff before
// eventually succeeding, for a combined ~25-35s just to list everyone's
// games. scripts/refresh-details.mjs (a GitHub Actions cron, "every ~5
// minutes" but only guaranteed to run "at least this often" - real gaps of
// 50-90+ minutes have been observed) fetches every member's game list anyway
// (to know which games need detail caching) and writes that list here, so a
// visitor's browser can read it back in one query instead of repeating the
// same rate-limited pagination itself. Trusted regardless of how old the row
// is - see fetchSharedPlayerGamesBatch's own comment for why an age check
// here caused more harm than it prevented.
interface SharedGamesRow {
  openfront_id: string
  games: PlayerGame[]
}

// No staleness check on this row (there used to be one, 1 hour): this used
// to make sense when a "too old" row fell back to a live fetch, getting
// fresher data as a consequence - but fetchPlayerGamesBatch/fetchPlayerGames
// no longer live-fetch at all (see their own comments), so discarding a
// stale-but-real row just replaced it with NOTHING instead of something
// fresher. Confirmed directly to cause exactly that in production: the
// 5-minute cron (refresh-details-cron.yml) is only GUARANTEED to run "at
// least this often" by GitHub Actions, and real gaps of 50-90+ minutes
// between runs were observed - past the old 1-hour cutoff, every member's
// row was being discarded at once, showing 0 wins clan-wide. Since this
// table only ever grows (see saveSharedPlayerGames/refresh-details.mjs's own
// union-before-upsert), trusting it regardless of age is always at least as
// correct as the alternative, and the cron still keeps it fresh whenever it
// does manage to run.
async function fetchSharedPlayerGamesBatch(publicIds: string[]): Promise<Map<string, PlayerGame[]>> {
  const result = new Map<string, PlayerGame[]>()
  if (!supabase || publicIds.length === 0) return result
  const { data, error } = await supabase.from('cyn_member_games_cache').select('openfront_id, games').in('openfront_id', publicIds)
  if (error || !data) return result
  for (const row of data as SharedGamesRow[]) result.set(row.openfront_id, row.games)
  return result
}

// Unions with whatever's currently in the shared row before overwriting -
// without this, a browser whose own view of a player's history is narrower
// than what's already shared (its local cache is stale, or this pass's own
// live-fetch pagination cap came up short) would silently shrink the shared
// cache on write, making previously-counted wins disappear clan-wide.
// Confirmed directly against real data: cyn_member_snapshots' clan-wide
// all_wins total dropped on multiple real days, including one with the
// exact same member count both days - not a missing-coverage artifact, an
// actual shrink. mergeAndCacheGames's own local "lastGood" merge (see
// above) only protects THIS browser's local cache from this; the shared
// Supabase row needs its own read-before-write for the same guarantee.
async function saveSharedPlayerGames(publicId: string, games: PlayerGame[]): Promise<void> {
  if (!supabase) return
  try {
    const { data } = await supabase.from('cyn_member_games_cache').select('games').eq('openfront_id', publicId).maybeSingle()
    const existing = ((data as { games?: PlayerGame[] } | null)?.games ?? []) as PlayerGame[]
    const byGame = new Map(games.map((g) => [g.gameId, g] as const))
    for (const g of existing) if (!byGame.has(g.gameId)) byGame.set(g.gameId, g)
    await supabase
      .from('cyn_member_games_cache')
      .upsert({ openfront_id: publicId, games: [...byGame.values()], updated_at: new Date().toISOString() }, { onConflict: 'openfront_id' })
  } catch {
    // best-effort - a failed upload just means the next fetch (by anyone) tries again
  }
}

// Layers in every game this player has ever had successfully fetched before
// (no-expiry local cache) on top of whatever this pass found - a fetch that
// breaks off early after a failed page (see fetchGamesPaged) or a stale
// shared-cache miss only ever adds what it managed to get this time, it
// never removes anything a past successful fetch already found. This is
// what actually stops a member's win/loss counts from randomly dropping on
// one refresh and reappearing on the next: the visible list can only grow,
// never shrink, across refreshes.
function mergeAndCacheGames(publicId: string, freshGames: PlayerGame[]): PlayerGame[] {
  const lastGoodKey = `${CACHE_NS}:games:lastgood:${publicId}`
  const lastGood = cachePermGet<PlayerGame[]>(lastGoodKey)
  const byGame = new Map(freshGames.map((g) => [g.gameId, g] as const))
  if (lastGood.hit) {
    for (const g of lastGood.data) if (!byGame.has(g.gameId)) byGame.set(g.gameId, g)
  }
  const merged = [...byGame.values()]
  cacheSet(`${CACHE_NS}:games:${publicId}`, merged)
  cachePermSet(lastGoodKey, merged)
  return merged
}

async function fetchPlayerGamesLive(publicId: string, maxPages: number): Promise<PlayerGame[]> {
  const [main, ranked] = await Promise.all([
    fetchGamesPaged(publicId, null, maxPages),
    fetchGamesPaged(publicId, 'ranked', Math.ceil(maxPages / 2)),
  ])
  const byGame = new Map<string, PlayerGame>()
  for (const g of [...main, ...ranked]) byGame.set(g.gameId, g)
  const merged = mergeAndCacheGames(publicId, [...byGame.values()])
  saveSharedPlayerGames(publicId, merged)
  return merged
}

/**
 * A player's full game history: the default feed (FFA/Team) merged with the
 * ranked feed (1v1), de-duplicated by gameId. Cached per player.
 */
export async function fetchPlayerGames(publicId: string, maxPages = 25): Promise<PlayerGame[]> {
  const key = `${CACHE_NS}:games:${publicId}`
  const cached = cacheGet<PlayerGame[]>(key, GAMES_CACHE_TTL_MS)
  if (cached) return cached

  const shared = await fetchSharedPlayerGamesBatch([publicId])
  const sharedGames = shared.get(publicId)
  if (sharedGames) return mergeAndCacheGames(publicId, sharedGames)

  return fetchPlayerGamesLive(publicId, maxPages)
}

/**
 * Bulk variant of fetchPlayerGames for buildRoster's up-front pass: resolves
 * every member still missing from their own local cache in ONE shared-cache
 * query instead of one live, rate-limited OpenFront pagination per member.
 *
 * Deliberately never falls back to a live fetch (unlike fetchPlayerGames,
 * used only for the single-member registration check) - this is the roster
 * page's hot path, hit by every visitor on every load. A member still
 * missing from the shared cache (brand new, or the 5-minute cron just
 * hasn't reached them yet) simply contributes no games THIS load; the cron
 * fills them in shortly after and the next load picks it up. That trade
 * (occasionally slightly stale over never live-fetching) is what actually
 * bounds page load time - see supabase/schema.sql's cyn_roster_cache notes
 * for the matching fix on the leaderboard side.
 */
export async function fetchPlayerGamesBatch(publicIds: string[]): Promise<Record<string, PlayerGame[]>> {
  const result: Record<string, PlayerGame[]> = {}
  const stillNeeded: string[] = []
  for (const id of publicIds) {
    const cached = cacheGet<PlayerGame[]>(`${CACHE_NS}:games:${id}`, GAMES_CACHE_TTL_MS)
    if (cached) result[id] = cached
    else stillNeeded.push(id)
  }
  if (stillNeeded.length === 0) return result

  const shared = await fetchSharedPlayerGamesBatch(stillNeeded)
  for (const id of stillNeeded) {
    const games = shared.get(id)
    if (games) result[id] = mergeAndCacheGames(id, games)
  }
  return result
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
 * Reads a game's detail from the shared cyn_game_detail_cache table, if any
 * visitor (or the daily Vercel Cron backfill) has already fetched it - see
 * supabase/schema.sql. A finished game's own record never changes, so
 * there's no version/TTL to invalidate against here, unlike the Max Tiles
 * cache: once a row exists, it's simply correct forever.
 */
async function fetchSharedGameDetail(gameId: string): Promise<GameDetail | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('cyn_game_detail_cache').select('detail').eq('game_id', gameId).maybeSingle()
  if (error || !data) return null
  return (data as { detail: GameDetail }).detail
}

/** Bulk variant of fetchSharedGameDetail - one query for many games instead of one round-trip per game. */
async function fetchSharedGameDetailsBatch(gameIds: string[]): Promise<Map<string, GameDetail>> {
  const result = new Map<string, GameDetail>()
  if (!supabase || gameIds.length === 0) return result
  const { data, error } = await supabase.from('cyn_game_detail_cache').select('game_id, detail').in('game_id', gameIds)
  if (error || !data) return result
  for (const row of data as { game_id: string; detail: GameDetail }[]) result.set(row.game_id, row.detail)
  return result
}

function saveSharedGameDetail(gameId: string, detail: GameDetail): void {
  if (!supabase) return
  supabase
    .from('cyn_game_detail_cache')
    .upsert({ game_id: gameId, detail }, { onConflict: 'game_id' })
    .then(() => {}, () => {}) // best-effort - a failed upload just means the next fetch (by anyone) tries again
}

/**
 * Full post-game report for one game (players + per-player stats). A
 * finished game's own record never changes, so this is cached forever, not
 * on the usual TTL - see the note above cachePermGet. Checked in order:
 * this browser's own permanent cache, then the cyn_game_detail_cache table
 * shared across every visitor (and kept warm by a daily Cron backfill - see
 * api/cron/refresh-details.js), and only as a last resort a live fetch from
 * OpenFront's own rate-limited API. A genuinely-absent game (no `info` in an
 * otherwise successful response) is a stable "no" worth caching too; a
 * network/rate-limit failure is not, so it's retried on the next call
 * instead of getting stuck.
 */
// The actual "go ask OpenFront" path, shared by fetchGameDetail and
// fetchGameDetailsBatch below - assumes the caller already checked both the
// local permanent cache and the shared cyn_game_detail_cache table (or its
// batch equivalent) and found nothing, so it only ever does the expensive
// live fetch, never a redundant re-check of either cache.
async function fetchGameDetailLive(gameId: string): Promise<GameDetail | null> {
  const key = `${CACHE_NS}:detail:${gameId}`
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
  if (detail) saveSharedGameDetail(gameId, detail)
  return detail
}

export async function fetchGameDetail(gameId: string): Promise<GameDetail | null> {
  const key = `${CACHE_NS}:detail:${gameId}`
  const cached = cachePermGet<GameDetail | null>(key)
  if (cached.hit) return cached.data

  const shared = await fetchSharedGameDetail(gameId)
  if (shared) {
    cachePermSet(key, shared)
    return shared
  }

  return fetchGameDetailLive(gameId)
}

/**
 * Bulk variant of fetchGameDetail for buildRoster's up-front pass: resolves
 * every game still missing from the browser's own permanent cache with ONE
 * shared-cache query instead of one Supabase round-trip per game (this used
 * to be a plain Promise.all of individual fetchGameDetail calls, which meant
 * a roster with e.g. 150 games needing detail fired 150 separate Supabase
 * requests just to find out most of them were already sitting in the shared
 * cache).
 *
 * Deliberately never falls back to a live fetch (unlike single-item
 * fetchGameDetail, used only when a visitor clicks one specific game) - same
 * reasoning as fetchPlayerGamesBatch above: this is the roster hot path, and
 * every caller already treats a missing entry in the returned map as "no
 * detail available" (renders "-" for kills/gold) rather than an error, so
 * this degrades gracefully. scripts/refresh-details.mjs's wantDetail
 * selection mirrors buildRoster's own (see RECENT_DETAIL_COUNT in
 * src/lib/stats.ts) so a game missing here should only ever be a brief,
 * self-healing gap until the next cron tick.
 */
export async function fetchGameDetailsBatch(gameIds: string[]): Promise<Map<string, GameDetail | null>> {
  const result = new Map<string, GameDetail | null>()
  const needsLookup: string[] = []
  for (const id of gameIds) {
    const cached = cachePermGet<GameDetail | null>(`${CACHE_NS}:detail:${id}`)
    if (cached.hit) result.set(id, cached.data)
    else needsLookup.push(id)
  }
  if (needsLookup.length === 0) return result

  const shared = await fetchSharedGameDetailsBatch(needsLookup)
  for (const id of needsLookup) {
    const detail = shared.get(id)
    if (detail) {
      cachePermSet(`${CACHE_NS}:detail:${id}`, detail)
      result.set(id, detail)
    }
  }
  return result
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
