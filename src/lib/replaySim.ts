// ── Point-in-time tile ownership via headless replay ────────────────────────
// OpenFront's public API only exposes final tile counts (stats.finalTiles) -
// there's no endpoint for "how many tiles did X own at minute 3". This
// replays the actual game simulation (OpenFront's own engine, vendored into
// src/vendor/openfront-core - see that folder's README for why it's vendored
// instead of an npm/git dependency) tick by tick from OpenFront's own turn
// log, then reads real tile ownership straight out of the simulated state.
//
// Runs in the browser rather than a Vercel function: the vendored engine
// pulls in dompurify, which needs a `window` to construct (it's only ever
// called from client-facing code upstream, never from a server context). A
// Vercel Node function has no window without adding a jsdom dependency just
// to satisfy that one import, and the engine was designed to run client-side
// (in a Worker, in OpenFront's own client) in the first place. Running it in
// the browser also means the map files get cached per-visitor (IndexedDB)
// instead of needing shared storage across ephemeral serverless instances.
// The cost: a few seconds of the visitor's own CPU, only when they open a
// game's detail modal - not on every page load.

import { createGameRunner } from '../vendor/openfront-core/src/core/GameRunner'
import type { GameMapLoader, MapData } from '../vendor/openfront-core/src/core/game/GameMapLoader'
import type { MapManifest } from '../vendor/openfront-core/src/core/game/TerrainMapLoader'
import type { GameStartInfo, Turn } from '../vendor/openfront-core/src/core/Schemas'

const API_BASE = '/api/of'

// Same fixed tick rate as fetchLastActionSeconds in openfront.ts (OpenFront's
// ServerEnv.turnIntervalMs() - always 100ms). Kept as a private copy here
// rather than importing from openfront.ts, since that module doesn't export it.
const SERVER_TICKS_PER_SECOND = 10

// Map assets are fetched straight from OpenFront's repo at the same commit
// the vendored engine is pinned to, so terrain data always matches the code
// reading it. Pinned to the commit game URdAfzpM was actually played on
// (its raw API record includes gitCommit) rather than a current HEAD - see
// src/vendor/openfront-core/README.md for why that distinction matters:
// the simulation only reproduces a game bit-for-bit when the engine version
// matches what the real server ran, and this engine changes often enough
// (458 commits in ~2 months between this pin and today) that a replay
// against a mismatched version diverges within the first few seconds.
const VENDORED_COMMIT = 'aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d'
const AUSTRALIA_BASE = `https://raw.githubusercontent.com/openfrontio/OpenFrontIO/${VENDORED_COMMIT}/resources/maps/australia`

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

// ── Map file cache (IndexedDB - binaries are too big for localStorage) ──────

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

async function idbGet<T>(key: string): Promise<T | undefined> {
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

async function idbSet(key: string, value: unknown): Promise<void> {
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

async function cachedManifest(): Promise<MapManifest> {
  const cached = await idbGet<MapManifest>('australia:manifest')
  if (cached) return cached
  const res = await fetch(`${AUSTRALIA_BASE}/manifest.json`)
  if (!res.ok) throw new Error(`Failed to fetch manifest.json: ${res.status}`)
  const manifest = (await res.json()) as MapManifest
  await idbSet('australia:manifest', manifest)
  return manifest
}

// Cynosure's speedrun mode only ever uses the Australia map (SPEEDRUN_RULE in
// speedruns.ts), so that's the only map this loader knows how to serve.
function makeAustraliaMapLoader(): GameMapLoader {
  const mapData: MapData = {
    mapBin: () => cachedArrayBuffer(`${AUSTRALIA_BASE}/map.bin`, 'australia:map.bin'),
    map4xBin: () => cachedArrayBuffer(`${AUSTRALIA_BASE}/map4x.bin`, 'australia:map4x.bin'),
    map16xBin: () => cachedArrayBuffer(`${AUSTRALIA_BASE}/map16x.bin`, 'australia:map16x.bin'),
    manifest: cachedManifest,
    webpPath: '',
  }
  return { getMapData: () => mapData }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Map of clientID -> percent of land tiles owned at `atSeconds` into the
 * game. Returns null if the game couldn't be fetched or replayed. A single
 * call replays the whole game up to that point tick by tick, so it takes a
 * few seconds - callers should show a loading state.
 */
export async function getTilePercentAt(gameId: string, atSeconds: number): Promise<Record<string, number> | null> {
  try {
    const [raw, rawTurns] = await Promise.all([fetchRawInfo(gameId), fetchRawTurns(gameId)])
    if (!raw) return null

    const gameStart = buildGameStartInfo(raw)
    const targetTick = Math.round(atSeconds * SERVER_TICKS_PER_SECOND)

    // OpenFront's API only returns turns that carry intents or a periodic
    // desync-check hash (about 1 in every 20 ticks are present, not every
    // tick) - the gaps are real empty ticks, not missing data. GameRunner
    // advances its own tick counter once per addTurn/executeNextTick call
    // regardless of what turnNumber says, so skipping the gaps would replay
    // every intent dozens of ticks too early. Fill them in explicitly.
    const byTurnNumber = new Map<number, Turn>()
    for (const t of rawTurns) byTurnNumber.set(t.turnNumber, t)

    const runner = await createGameRunner(gameStart, undefined, makeAustraliaMapLoader(), () => {})
    for (let t = 0; t <= targetTick; t++) {
      runner.addTurn(byTurnNumber.get(t) ?? { turnNumber: t, intents: [] })
    }
    while (runner.game.ticks() < targetTick) {
      if (!runner.executeNextTick()) break
    }

    const totalLandTiles = runner.game.map().numLandTiles()
    const result: Record<string, number> = {}
    for (const player of runner.game.players()) {
      const clientId = player.clientID()
      if (clientId) result[clientId] = (player.numTilesOwned() / totalLandTiles) * 100
    }
    return result
  } catch (err) {
    console.error('Replay simulation failed', err)
    return null
  }
}
