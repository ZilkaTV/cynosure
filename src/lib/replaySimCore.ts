// ── Point-in-time tile ownership via headless replay (core engine) ─────────
// The actual simulation logic, kept environment-agnostic (no `window`/
// `document` references) so it can run either inside a Web Worker (the
// normal path - see replaySim.worker.ts) or, if module workers aren't
// available, directly on the main thread as a fallback (see replaySim.ts).
//
// OpenFront's public API only exposes final tile counts (stats.finalTiles) -
// there's no endpoint for "how many tiles did X own at minute 3". This
// replays the actual game simulation (OpenFront's own engine, vendored into
// src/vendor/openfront-core - see that folder's README for why it's vendored
// instead of an npm/git dependency) tick by tick from OpenFront's own turn
// log, then reads real tile ownership straight out of the simulated state.

import { createGameRunner } from '../vendor/openfront-core/src/core/GameRunner'
import type { GameMapLoader, MapData } from '../vendor/openfront-core/src/core/game/GameMapLoader'
import type { MapManifest } from '../vendor/openfront-core/src/core/game/TerrainMapLoader'
import type { GameStartInfo, Turn } from '../vendor/openfront-core/src/core/Schemas'

const API_BASE = '/api/of'

// Every Nth tick is sampled for the running max-tiles check - the tick
// execution itself (game logic) dominates the cost, not the ownership read,
// so this doesn't meaningfully speed up a replay, but it keeps the O(players)
// bookkeeping work down on very long games without losing real precision
// (a player's territory doesn't meaningfully swing within half a second).
const SAMPLE_EVERY_N_TICKS = 5

// Hard wall-clock ceiling on a single replay. Some games (100+ bots, tens of
// thousands of ticks) are heavy enough that the tick loop could realistically
// run for many minutes - rather than let it hang indefinitely (which reads
// as "broken" to a visitor watching a spinner), give up cleanly after this
// long and let the UI show an error state instead. Not cached as a permanent
// failure - reopening the game just tries again.
const MAX_COMPUTE_MS = 3 * 60 * 1000

// Map assets are fetched straight from OpenFront's repo at the same commit
// the vendored engine is pinned to, so terrain data always matches the code
// reading it. Pinned to the commit game GEiyYVf3 was actually played on
// (its raw API record includes gitCommit) rather than a current HEAD - see
// src/vendor/openfront-core/README.md for why that distinction matters:
// the simulation only reproduces a game bit-for-bit when the engine version
// matches what the real server ran, and this engine changes often enough
// that a replay against a mismatched version diverges (or crashes) within
// the first few seconds. The same drift applies to maps: a game played on a
// newer commit can use a map that didn't exist yet at this pin (or was
// renamed), in which case the fetch below 404s and computeGameTileStats
// fails closed (returns null) rather than silently replaying with the wrong
// terrain. This pin will drift again as the live server moves on - see the
// README's "Why this specific commit" section for the expected re-vendoring
// maintenance cadence.
export const VENDORED_COMMIT = 'dcc18d5231af6253b0e991bf04a4c764982fe262'

// Bump this whenever computeGameTileStats's own math changes (not just the
// vendored engine commit) - e.g. the maxPercent independent-tracking fix
// below. replaySim.ts folds this into its cache key alongside
// VENDORED_COMMIT, so a logic-only fix also invalidates previously cached
// (and now known-stale) results instead of leaving them stuck forever.
export const COMPUTE_LOGIC_VERSION = 2

/** "Nile Delta" -> "niledelta", matching OpenFront's resources/maps/<slug> folder names. */
function mapSlug(gameMapName: string): string {
  return gameMapName.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ── Raw OpenFront API shapes (looser than openfront.ts's GameDetail - we
// need config fields GameDetail doesn't parse, like difficulty/gameMode/
// randomSpawn, to build a GameStartInfo the engine will actually accept) ────

interface RawPlayer {
  clientID: string
  username: string
  clanTag: string | null
}

interface RawGameConfig {
  gameMap: string
  difficulty: string
  donateGold: boolean
  donateTroops: boolean
  gameType: string
  gameMode: string
  gameMapSize: string
  nations: string | number
  bots: number
  infiniteGold: boolean
  infiniteTroops: boolean
  instantBuild: boolean
  randomSpawn: boolean
  disabledUnits?: string[]
  playerTeams?: string | number
}

interface RawGameInfo {
  gameID: string
  lobbyCreatedAt: number
  num_turns: number
  config: RawGameConfig
  players: RawPlayer[]
}

async function fetchRawInfo(gameId: string): Promise<RawGameInfo | null> {
  const res = await fetch(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=false`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { info?: RawGameInfo }
  return json.info ?? null
}

async function fetchRawTurns(gameId: string): Promise<Turn[]> {
  const res = await fetch(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=true`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return []
  const json = (await res.json()) as { turns?: Turn[] }
  return json.turns ?? []
}

/**
 * Build a GameStartInfo from OpenFront's raw game record. PseudoRandom seeds
 * off gameStart.gameID (simpleHash), so bot spawn placement/behaviour only
 * reproduces deterministically if this id matches the real game id exactly.
 */
function buildGameStartInfo(raw: RawGameInfo): GameStartInfo {
  const config = {
    gameMap: raw.config.gameMap,
    difficulty: raw.config.difficulty,
    donateGold: raw.config.donateGold,
    donateTroops: raw.config.donateTroops,
    gameType: raw.config.gameType,
    gameMode: raw.config.gameMode,
    gameMapSize: raw.config.gameMapSize,
    nations: raw.config.nations,
    bots: raw.config.bots,
    infiniteGold: raw.config.infiniteGold,
    infiniteTroops: raw.config.infiniteTroops,
    instantBuild: raw.config.instantBuild,
    randomSpawn: raw.config.randomSpawn,
    disabledUnits: raw.config.disabledUnits ?? [],
    playerTeams: raw.config.playerTeams,
    // Every other GameConfig field is optional and unset for a plain public
    // game record (host cheats, doomsday clock, gold/timer overrides, etc).
  } as unknown as GameStartInfo['config']

  return {
    gameID: raw.gameID,
    lobbyCreatedAt: raw.lobbyCreatedAt,
    config,
    players: raw.players.map((p) => ({
      clientID: p.clientID,
      username: p.username,
      clanTag: p.clanTag,
      isLobbyCreator: true,
      friends: [],
    })),
  } as unknown as GameStartInfo
}

// ── Map file cache (IndexedDB - binaries are too big for localStorage).
// `indexedDB` is available both on `window` and inside a Worker's global
// scope, so this works unchanged in either environment. ────────────────────

const IDB_NAME = 'cyn-replay-maps'
const IDB_STORE = 'files'

function openMapDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openMapDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openMapDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* quota / private mode - just refetch next time */
  }
}

async function cachedArrayBuffer(url: string, key: string): Promise<Uint8Array> {
  const cached = await idbGet<ArrayBuffer>(key)
  if (cached) return new Uint8Array(cached)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const buf = await res.arrayBuffer()
  await idbSet(key, buf)
  return new Uint8Array(buf)
}

async function cachedManifest(slug: string, base: string): Promise<MapManifest> {
  const cached = await idbGet<MapManifest>(`${slug}:manifest`)
  if (cached) return cached
  const res = await fetch(`${base}/manifest.json`)
  if (!res.ok) throw new Error(`Failed to fetch manifest.json: ${res.status}`)
  const manifest = (await res.json()) as MapManifest
  await idbSet(`${slug}:manifest`, manifest)
  return manifest
}

/** Loads whichever map the game actually used (see mapSlug) - fails (throws/404s) if that map didn't exist yet at VENDORED_COMMIT. */
function makeMapLoader(gameMapName: string): GameMapLoader {
  const slug = mapSlug(gameMapName)
  const base = `https://raw.githubusercontent.com/openfrontio/OpenFrontIO/${VENDORED_COMMIT}/resources/maps/${slug}`
  const mapData: MapData = {
    mapBin: () => cachedArrayBuffer(`${base}/map.bin`, `${slug}:map.bin`),
    map4xBin: () => cachedArrayBuffer(`${base}/map4x.bin`, `${slug}:map4x.bin`),
    map16xBin: () => cachedArrayBuffer(`${base}/map16x.bin`, `${slug}:map16x.bin`),
    manifest: () => cachedManifest(slug, base),
    webpPath: '',
  }
  return { getMapData: () => mapData }
}

// ── Public API ────────────────────────────────────────────────────────────

export interface GameTileStats {
  /** clientID -> peak tiles owned at any point during the game. */
  maxTiles: Record<string, number>
  /** clientID -> peak percent of the map's land tiles owned at any point. */
  maxPercent: Record<string, number>
  /** clientID -> tiles owned when the game ended (from the simulated final state). */
  finalTiles: Record<string, number>
}

export interface ReplayProgress {
  tick: number
  totalTicks: number
}

export interface ComputeOptions {
  /** How many ticks between progress reports/cooperative yields. */
  yieldEveryTicks: number
  onProgress?: (p: ReplayProgress) => void
}

/**
 * Replays a full game tick by tick to find each player's peak tile count
 * (a true running max, not a single checkpoint) plus their tile count at
 * the end - both unavailable from OpenFront's public API, which only
 * exposes a single final-tiles number per player (and even that is missing
 * for some players). Returns null if the game couldn't be fetched or
 * replayed, or if it's too heavy to finish within the time ceiling.
 */
export async function computeGameTileStats(gameId: string, opts: ComputeOptions): Promise<GameTileStats | null> {
  const startedAt = Date.now()
  try {
    const [raw, rawTurns] = await Promise.all([fetchRawInfo(gameId), fetchRawTurns(gameId)])
    if (!raw) return null

    const gameStart = buildGameStartInfo(raw)
    const lastTick = raw.num_turns

    // OpenFront's API only returns turns that carry intents or a periodic
    // desync-check hash (about 1 in every 20 ticks are present, not every
    // tick) - the gaps are real empty ticks, not missing data. GameRunner
    // advances its own tick counter once per addTurn/executeNextTick call
    // regardless of what turnNumber says, so skipping the gaps would replay
    // every intent dozens of ticks too early. Fill them in explicitly.
    const byTurnNumber = new Map<number, Turn>()
    for (const t of rawTurns) byTurnNumber.set(t.turnNumber, t)

    const runner = await createGameRunner(gameStart, undefined, makeMapLoader(raw.config.gameMap), () => {})
    for (let t = 0; t <= lastTick; t++) {
      runner.addTurn(byTurnNumber.get(t) ?? { turnNumber: t, intents: [] })
    }

    // Total land tiles is fixed for the map, but the *ownable* share of it
    // shrinks over the game as nukes leave lingering fallout - the engine's
    // own win check (WinCheckExecution.checkWinnerFFA: `numLandTiles() -
    // numTilesWithFallout()`) and the in-client/replay-viewer "% of map"
    // stat both measure a player's share against that shrinking
    // non-fallout denominator, not raw land tiles. Matching that (instead
    // of dividing by the constant numLandTiles) is the difference between
    // this coming out close to the real confirmed result and badly
    // undercounting on any heavily-nuked game - confirmed by direct
    // comparison against game GEiyYVf3 (real result ~80.2%; dividing by
    // raw land tiles here gave ~46%, dividing by non-fallout land tiles
    // gave ~81%). numTilesWithFallout() changes every tick, so it's
    // recomputed at each sample rather than cached alongside totalLandTiles.
    const totalLandTiles = runner.game.map().numLandTiles()
    const nonFalloutLandTiles = () => Math.max(1, totalLandTiles - runner.game.numTilesWithFallout())
    const maxTiles: Record<string, number> = {}
    const maxPercent: Record<string, number> = {}

    let tick = 0
    while (runner.executeNextTick()) {
      tick++
      if (tick % opts.yieldEveryTicks === 0) {
        opts.onProgress?.({ tick, totalTicks: lastTick })
        await new Promise((r) => setTimeout(r, 0))
        if (Date.now() - startedAt > MAX_COMPUTE_MS) {
          console.error(`Replay simulation for ${gameId} exceeded ${MAX_COMPUTE_MS}ms, giving up`)
          return null
        }
      }
      if (tick % SAMPLE_EVERY_N_TICKS !== 0) continue
      const denom = nonFalloutLandTiles()
      for (const player of runner.game.players()) {
        const clientId = player.clientID()
        if (!clientId) continue
        const owned = player.numTilesOwned()
        if (maxTiles[clientId] === undefined || owned > maxTiles[clientId]) {
          maxTiles[clientId] = owned
        }
        // Tracked independently from maxTiles: the denominator (non-fallout
        // land) shrinks over the game as nukes spread, so a player's peak
        // *percentage* doesn't necessarily land on the same tick as their
        // peak *raw tile count* - gating this update behind "owned just hit
        // a new high" (as a single combined check used to do) can miss a
        // later tick where they held fewer tiles but a shrunk denominator
        // still made that a higher percentage.
        const percent = (owned / denom) * 100
        if (maxPercent[clientId] === undefined || percent > maxPercent[clientId]) {
          maxPercent[clientId] = percent
        }
      }
      // OpenFront's own win check (WinCheckExecution) has just decided the
      // match at this tick - the turn log often runs on well past this
      // point (players who stick around keep playing in what's already a
      // decided game), but none of that changes who won or their peak
      // share, so simulating it is pure wasted CPU/time. Stopping here
      // instead of at the log's real end is a deliberate, usually large
      // saving (a match decided a third of the way through a long log
      // currently still gets replayed to the end for nothing).
      if (runner.game.getWinner()) break
    }

    const finalTiles: Record<string, number> = {}
    const finalDenom = nonFalloutLandTiles()
    for (const player of runner.game.players()) {
      const clientId = player.clientID()
      if (!clientId) continue
      const owned = player.numTilesOwned()
      finalTiles[clientId] = owned
      // The last tick isn't necessarily a sampled one - make sure it's
      // still reflected in the max (tracked independently, see above).
      if (maxTiles[clientId] === undefined || owned > maxTiles[clientId]) {
        maxTiles[clientId] = owned
      }
      const percent = (owned / finalDenom) * 100
      if (maxPercent[clientId] === undefined || percent > maxPercent[clientId]) {
        maxPercent[clientId] = percent
      }
    }

    // Sanity check: a game with N registered (human) players should end
    // with tile data for close to all of them - a result covering only a
    // small fraction is a sign the replay was somehow cut short or
    // corrupted (observed once in production: 39 of 125 players, everyone
    // including the actual winner reading near-zero) rather than a
    // legitimate small game. Fail closed instead of returning - and,
    // upstream, permanently caching - obviously-wrong data.
    const coverage = raw.players.length > 0 ? Object.keys(maxPercent).length / raw.players.length : 1
    if (coverage < 0.5) {
      console.error(
        `Replay simulation for ${gameId} only covered ${Object.keys(maxPercent).length}/${raw.players.length} players - treating as failed`,
      )
      return null
    }

    return { maxTiles, maxPercent, finalTiles }
  } catch (err) {
    console.error('Replay simulation failed', err)
    return null
  }
}
