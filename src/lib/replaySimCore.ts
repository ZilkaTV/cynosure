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

// A game only replays bit-for-bit against the exact engine commit it was
// actually played on (see src/vendor/openfront-core/README.md) - the engine
// changes upstream often enough that a single global pin inevitably goes
// stale for some games while being correct for others. Confirmed directly:
// two real speedrun submissions (games 4pQDDgSw, URdAfzpM) both carry
// gitCommit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d, a different real game
// (Md4w7sVS) carries dcc18d5231af6253b0e991bf04a4c764982fe262, and a real
// Team game (GWMNzCWe) carries 16be9d7c15d7abc115691def3a0b2aa559664705 -
// no single pin gets all three right. Rather than chase a moving target
// with one vendored tree (re-vendoring to fix one game's replay just breaks
// another), this keeps a small matrix of vendored engine trees, one per
// commit we've actually needed, and picks the one matching each game's own
// gitCommit at replay time. A commit with no matching vendored tree fails
// closed (returns null) instead of silently replaying against the wrong
// engine version and producing plausible-looking but wrong numbers.
export const KNOWN_ENGINE_COMMITS = [
  'dcc18d5231af6253b0e991bf04a4c764982fe262',
  'aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d',
  '16be9d7c15d7abc115691def3a0b2aa559664705',
  'fe5d7708e03ac08c1a62c2eb694e58d564f86ab4',
  '53e1a5b03e35c27a3130c1c534f9416b8d6c724f',
  'f0da41820727cfccc27320d7eb97fbd188488e47',
  '3687eee03bec116b7d19f470bffdd62648180372',
  'b716adb7e2f1396e8b5ae80730ac052e6f5638ce',
  '580460c9692aea2bdc1dce97eba1bbee378e270d',
  'b22f422728f35127e5596c4b58ce193a100cc5ba',
  '0c4c7d7993c91bd058af2790c5b9f7b48fa8e90b',
  '7d1c2edfb68e6d4ce6575eea0270f87832a17eda',
  'efa4dadeb6f66fd37be68202fc4dc1d58740ce5e',
  'dd1277e245b532bf0a41ab12618489d0f6749e31',
  '3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd',
  '7a7ca5be8ff8af4403595e4766b2669ab8124407',
  'dcbfdbbdc91431a8442fb9e9cccd35f832acc82f',
  '0668045fa926eaa6d6995561a8e13fd8126895b6',
  'e9e10703e8188f2a34defdeda9598778a934094a',
  'ad765842bac44be72a8dc91a9e23369f8fa57744',
  '20c813f06a403da294760fc6089b222179b6a66b',
  '87f1a5278c8e1409ce0cdcf183d30a6d806364d2',
  'bebc953804e5ef2834642a21bb602eb9014a3a12',
  '2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b',
  'd53d6c339fefe0291782e1530242a771a44c9e91',
  '3229956f09a0307c7ed1d31e07aed9a9f9356cbd',
  '90513c0bffeb8e74a83e76c7a99e3b136f433f87',
  '0cb90ccb74787e8384f030517423826fe9f607a9',
  '88cc95d8b6d74d951546da341be809bfb3cab960',
  '8b45be57542f5f8cce8380c4a75d816674a1dabe',
] as const
export type EngineCommit = (typeof KNOWN_ENGINE_COMMITS)[number]

async function loadCreateGameRunner(commit: EngineCommit) {
  switch (commit) {
    case 'dcc18d5231af6253b0e991bf04a4c764982fe262':
      return (await import('../vendor/openfront-core/src/core/GameRunner')).createGameRunner
    case 'aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d':
      return (await import('../vendor/openfront-core-aeb8d60/src/core/GameRunner')).createGameRunner
    case '16be9d7c15d7abc115691def3a0b2aa559664705':
      return (await import('../vendor/openfront-core-16be9d7/src/core/GameRunner')).createGameRunner
    case 'fe5d7708e03ac08c1a62c2eb694e58d564f86ab4':
      return (await import('../vendor/openfront-core-fe5d770/src/core/GameRunner')).createGameRunner
    case '53e1a5b03e35c27a3130c1c534f9416b8d6c724f':
      return (await import('../vendor/openfront-core-53e1a5b/src/core/GameRunner')).createGameRunner
    case 'f0da41820727cfccc27320d7eb97fbd188488e47':
      return (await import('../vendor/openfront-core-f0da418/src/core/GameRunner')).createGameRunner
    case '3687eee03bec116b7d19f470bffdd62648180372':
      return (await import('../vendor/openfront-core-3687eee/src/core/GameRunner')).createGameRunner
    case 'b716adb7e2f1396e8b5ae80730ac052e6f5638ce':
      return (await import('../vendor/openfront-core-b716adb/src/core/GameRunner')).createGameRunner
    case '580460c9692aea2bdc1dce97eba1bbee378e270d':
      return (await import('../vendor/openfront-core-580460c/src/core/GameRunner')).createGameRunner
    case 'b22f422728f35127e5596c4b58ce193a100cc5ba':
      return (await import('../vendor/openfront-core-b22f422/src/core/GameRunner')).createGameRunner
    case '0c4c7d7993c91bd058af2790c5b9f7b48fa8e90b':
      return (await import('../vendor/openfront-core-0c4c7d7/src/core/GameRunner')).createGameRunner
    case '7d1c2edfb68e6d4ce6575eea0270f87832a17eda':
      return (await import('../vendor/openfront-core-7d1c2ed/src/core/GameRunner')).createGameRunner
    case 'efa4dadeb6f66fd37be68202fc4dc1d58740ce5e':
      return (await import('../vendor/openfront-core-efa4dad/src/core/GameRunner')).createGameRunner
    case 'dd1277e245b532bf0a41ab12618489d0f6749e31':
      return (await import('../vendor/openfront-core-dd1277e/src/core/GameRunner')).createGameRunner
    case '3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd':
      return (await import('../vendor/openfront-core-3fa1a8e/src/core/GameRunner')).createGameRunner
    case '7a7ca5be8ff8af4403595e4766b2669ab8124407':
      return (await import('../vendor/openfront-core-7a7ca5b/src/core/GameRunner')).createGameRunner
    case 'dcbfdbbdc91431a8442fb9e9cccd35f832acc82f':
      return (await import('../vendor/openfront-core-dcbfdbb/src/core/GameRunner')).createGameRunner
    case '0668045fa926eaa6d6995561a8e13fd8126895b6':
      return (await import('../vendor/openfront-core-0668045/src/core/GameRunner')).createGameRunner
    case 'e9e10703e8188f2a34defdeda9598778a934094a':
      return (await import('../vendor/openfront-core-e9e1070/src/core/GameRunner')).createGameRunner
    case 'ad765842bac44be72a8dc91a9e23369f8fa57744':
      return (await import('../vendor/openfront-core-ad76584/src/core/GameRunner')).createGameRunner
    case '20c813f06a403da294760fc6089b222179b6a66b':
      return (await import('../vendor/openfront-core-20c813f/src/core/GameRunner')).createGameRunner
    case '87f1a5278c8e1409ce0cdcf183d30a6d806364d2':
      return (await import('../vendor/openfront-core-87f1a52/src/core/GameRunner')).createGameRunner
    case 'bebc953804e5ef2834642a21bb602eb9014a3a12':
      return (await import('../vendor/openfront-core-bebc953/src/core/GameRunner')).createGameRunner
    case '2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b':
      return (await import('../vendor/openfront-core-2d5baaf/src/core/GameRunner')).createGameRunner
    case 'd53d6c339fefe0291782e1530242a771a44c9e91':
      return (await import('../vendor/openfront-core-d53d6c3/src/core/GameRunner')).createGameRunner
    case '3229956f09a0307c7ed1d31e07aed9a9f9356cbd':
      return (await import('../vendor/openfront-core-3229956/src/core/GameRunner')).createGameRunner
    case '90513c0bffeb8e74a83e76c7a99e3b136f433f87':
      return (await import('../vendor/openfront-core-90513c0/src/core/GameRunner')).createGameRunner
    case '0cb90ccb74787e8384f030517423826fe9f607a9':
      return (await import('../vendor/openfront-core-0cb90cc/src/core/GameRunner')).createGameRunner
    case '88cc95d8b6d74d951546da341be809bfb3cab960':
      return (await import('../vendor/openfront-core-88cc95d/src/core/GameRunner')).createGameRunner
    case '8b45be57542f5f8cce8380c4a75d816674a1dabe':
      return (await import('../vendor/openfront-core-8b45be5/src/core/GameRunner')).createGameRunner
  }
}

// Bump this whenever computeGameTileStats's own math changes (not just the
// vendored engine commit), OR when trust in previously-cached results
// itself changes - e.g. the 2 -> 3 bump wasn't a formula change, it was
// because a corrupted result was found in the shared cache (see the worker
// serialization + coverage-check fix alongside that) and every visitor's
// own local IndexedDB copy needed a clean slate too, not just the shared
// table - a visitor with a bad result already cached locally would keep
// reading it forever otherwise, since the local cache is checked before
// the shared one. replaySim.ts folds this into its cache key alongside the
// resolved engine commit (see resolveEngineCommit), so a bump invalidates
// every previously cached result (local AND shared) at once, no manual
// per-visitor cache-clearing needed.
//
// 3 -> 4: buildGameStartInfo now populates GameStartInfo.tribes from
// OpenFront's own `info.tribes` (purchased bot-tribe names), which it never
// did before - see buildGameStartInfo's own comment for why that's not a
// no-op (it changes how many PRNG draws TribeSpawner consumes on any game
// with purchased tribes, shifting every bot spawned after the first one).
// Every previously cached result was computed without this, so all of them
// need to be treated as stale, not just newly-failing ones.
//
// 4 -> 5: buildFullPlayerRoster no longer pads raw.players with extra
// clientIDs pulled from turn 0's mark_disconnected intents - that padding
// was itself wrong (see its own comment: proven against OpenFront's own
// recorded per-turn state hash on two real games), and shifted every
// nation/bot PRNG draw after it on any game with a stray early-disconnected
// connection. Also: buildGameStartInfo now spreads the game's full recorded
// config through instead of a hand-picked field subset, and blanks clanTag
// when the host disabled clan tags/anonymized names, matching what the real
// server actually handed its own engine. Measured on a 50-game sample:
// 17/50 passing before this version, 27/50 after.
export const COMPUTE_LOGIC_VERSION = 5

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
  // OpenFront's own recorded tile count for this player when the game ended
  // (a bigint-as-string, like the rest of that stats block) - used only to
  // sanity-check our simulated result against, not otherwise consumed.
  stats?: { finalTiles?: string }
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
  // Only the fields the engine's own gameplay logic is known to branch on
  // are named above (and were being individually allowlisted into
  // GameStartInfo.config below) - everything else GameConfigSchema defines
  // (spawnImmunityDuration, maxTimerValue, doomsdayClock, goldMultiplier,
  // startingGold, customAllianceDuration, disableClanTags, anonymizeNames,
  // rankedType, disableAlliances, waterNukes, hostCheats, ...) was silently
  // dropped, each defaulting to whatever Config.ts falls back to instead of
  // the real game's actual value - see buildGameStartInfo, which now spreads
  // the whole raw config through instead of naming a subset.
  [otherConfigField: string]: unknown
}

interface RawGameInfo {
  gameID: string
  lobbyCreatedAt: number
  num_turns: number
  config: RawGameConfig
  players: RawPlayer[]
  // Purchased bot-tribe names for this game (a monetization feature) - fed
  // into the real server's GameStartInfo.tribes and consumed by
  // TribeSpawner.spawnTribes's `purchasedNames` param. See buildGameStartInfo.
  tribes?: { name: string }[]
}

interface RawGameRecord {
  info: RawGameInfo
  gitCommit: string | null
}

async function fetchRawRecord(gameId: string): Promise<RawGameRecord | null> {
  const res = await fetch(`${API_BASE}/public/game/${encodeURIComponent(gameId)}?turns=false`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { info?: RawGameInfo; gitCommit?: string }
  if (!json.info) return null
  return { info: json.info, gitCommit: json.gitCommit ?? null }
}

/**
 * Which vendored engine tree (if any) matches the exact commit a game was
 * played on - meant to be called before deciding a cache key, so a caller
 * never has to check a cache under the wrong commit or run a
 * doomed-to-be-wrong replay against a commit we don't have vendored at all.
 *
 * Cached in IndexedDB forever once resolved: a finished game's gitCommit
 * never changes, but every caller here (getGameTileStats AND every prefetch
 * queue entry - see prefetchGameTileStats in replaySim.ts, which resolves
 * up to 40 games per Home page load) used to pay a fresh, uncached
 * `?turns=false` fetch every single time, even for a game whose Max Tiles
 * result was already fully cached downstream. Confirmed directly: on
 * Cynosure's live site this showed up as a ~30s tail of sequential
 * `/api/of/public/game/<id>` requests after every page load, the actual
 * source of visitors' "over 10 seconds to load" complaints even though the
 * visible stats table itself rendered in under a second. Only a *resolved*
 * commit is cached - a null result (fetch failure, or a commit we haven't
 * vendored yet) must stay uncached, since the auto-vendor pipeline adds new
 * commits over time and a permanently-cached null would keep a game stuck
 * "unavailable" even after we start supporting its commit.
 */
export async function resolveEngineCommit(gameId: string): Promise<EngineCommit | null> {
  const cacheKey = `commit:${gameId}`
  const cached = await idbGet<EngineCommit>(cacheKey)
  if (cached) return cached

  const record = await fetchRawRecord(gameId)
  const commit = record?.gitCommit
  if (!commit) return null
  const resolved = (KNOWN_ENGINE_COMMITS as readonly string[]).includes(commit) ? (commit as EngineCommit) : null
  if (resolved) await idbSet(cacheKey, resolved)
  return resolved
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
 * The real engine seeds a PseudoRandom off gameStart.gameID and then draws
 * one ID per entry in `players` (humans first, then nations/bots) - see
 * GameRunner.ts's createGameRunner and NationCreation.ts's
 * createNationsForGame. That makes every generated nation/bot clientID a
 * function of exactly how many `random.nextID()` calls came before it, which
 * means `players` has to be exactly the same SET the real server passed to
 * GameStartInfo, or every ID after any gap/extra comes out different from
 * the real game - silently, since nothing throws, it just replays as if
 * against a different seed.
 *
 * This used to pad raw.players (OpenFront's own summary endpoint) with every
 * extra clientID named in turn 0's mark_disconnected intents, on the theory
 * that someone who disconnected in the first second or two of a public FFA
 * never gets a stats entry and so falls out of raw.players. That theory is
 * wrong, proven directly: OpenFront's turn log carries a per-turn state hash
 * (Schemas.ts TurnSchema.hash, "the hash of the game state at the end of the
 * turn", computed as GameImpl.hash() - `1 + sum of every player's
 * simpleHash(id) * (troops+tiles) + unit hashes`, which only depends on
 * *how many* players of each type exist, not which clientID got which slot).
 * Replaying two real games (8Z6BYvK9, Pp2SddEj - the exact game this
 * padding was originally "confirmed" on) and comparing our simulated tick-0
 * hash against the real recorded turn-0 hash: using raw.players verbatim
 * (unpadded) reproduces the real hash EXACTLY on both; padding in the extra
 * mark_disconnected-only clientIDs (as this function used to) does not, on
 * either. raw.players already *is* the complete initial roster - the extra
 * mark_disconnected clientIDs are connections that never made it into the
 * actual game (e.g. rejected/abandoned before the match started), and
 * padding them in was itself the bug: every game with any such stray
 * connection replayed one nation/bot ID assignment too far off from the
 * real game, which cascades (via AttackExecution resolving attack targets
 * by this same internal ID, not clientID) into humans' recorded attacks
 * silently landing on the wrong target for the rest of the game.
 */
function buildFullPlayerRoster(raw: RawGameInfo): RawPlayer[] {
  return raw.players
}

/**
 * Build a GameStartInfo from OpenFront's raw game record. PseudoRandom seeds
 * off gameStart.gameID (simpleHash), so bot spawn placement/behaviour only
 * reproduces deterministically if this id matches the real game id exactly
 * AND `players` is exactly the real initial roster (see buildFullPlayerRoster
 * above) AND `tribes` carries every purchased bot-tribe name the real game
 * had (see below) - all three feed the same PRNG-draw-count chain that
 * TribeSpawner/NationCreation rely on being bit-for-bit identical to the
 * real game.
 *
 * `raw.tribes` (present directly on OpenFront's own `?turns=false` summary,
 * confirmed on real game zYgvvy1A: `info.tribes` = 10 purchased names) is
 * OpenFront's own purchased-tribe-name list for the game - exactly what the
 * real server would have put in GameStartInfo.tribes. Leaving this unset
 * (as this code did until now) isn't a no-op: TribeSpawner.spawnTribes only
 * runs its `purchasedNames`-assignment shuffle (a `random.shuffleArray` over
 * every remaining bot slot) when `purchasedNames.length > 0`, and every slot
 * that WOULD have received a purchased name instead falls through to
 * `randomTribeName()`, which draws extra `nextInt()` calls the real game
 * never did. Either difference shifts every subsequent `nextID()`/spawn
 * draw for every bot spawned after the divergence point on that (separately
 * seeded, `simpleHash(gameID) + 2`) PRNG stream - i.e. every bot in a
 * heavily-bots game potentially ends up in a different spot with a
 * different name than the real game, which cascades into wrong tile
 * ownership for any human player whose early game played out near one.
 * Confirmed directly on zYgvvy1A (400 bots, 10 purchased tribe names): two
 * players' simulated peak tiles were undercounted 10x-100x vs OpenFront's
 * own recorded finalTiles before this fix.
 *
 * `config` used to be built by naming a specific subset of GameConfigSchema
 * fields (gameMap/difficulty/bots/etc) and silently dropping everything
 * else - so any game where the host actually set one of the dropped fields
 * (spawnImmunityDuration, maxTimerValue, doomsdayClock, goldMultiplier,
 * startingGold, customAllianceDuration, disableAlliances, waterNukes,
 * rankedType, disableClanTags, anonymizeNames, hostCheats, ...) replayed
 * against Config.ts's DEFAULT for that field instead of the real game's
 * value. None of those consume PRNG draws (so they don't explain the
 * ID-shift bug class the tribes/roster fixes above address), but several
 * change simulated gameplay outcomes directly - e.g. a shorter real
 * maxTimerValue means the real game was decided by whoever led when the
 * clock ran out, while a replay that doesn't know about that timer just
 * keeps simulating until someone crosses the 80% FFA win threshold (or the
 * unrelated 170-minute hard cap), which can easily be a different player
 * entirely. `raw.config` is already OpenFront's own full wire GameConfig
 * (the RawGameConfig type above only *names* the fields this code branches
 * on elsewhere - see its comment), so spreading it through instead of
 * re-listing a subset is strictly more correct, not just more concise.
 */
function buildGameStartInfo(raw: RawGameInfo): GameStartInfo {
  const config = {
    ...raw.config,
    disabledUnits: raw.config.disabledUnits ?? [],
  } as unknown as GameStartInfo['config']

  // The real server blanks clanTag (and, separately, friends) before ever
  // handing GameStartInfo to the engine to simulate with, whenever the host
  // disabled clan tags or turned on name anonymization - identically for
  // every client, because Team-mode games feed clanTag into deterministic
  // team assignment (TeamAssignment.ts's clan-grouping). See the newer
  // vendored trees' Util.ts toWireGameStartInfo, which documents this exact
  // requirement for replays ("or team games ... diverge from the recorded
  // hashes") but was never actually called from here. `friends` isn't
  // populated from real data below regardless (OpenFront's summary API
  // doesn't expose it), so it's already effectively always blanked; only
  // clanTag blanking is live behavior here. Singleplayer records were
  // simulated (and archived) with the real values, no server in the loop,
  // so they're excluded to match.
  const blankClanTags =
    raw.config.gameType !== 'Singleplayer' && Boolean(raw.config.disableClanTags ?? raw.config.anonymizeNames)

  return {
    gameID: raw.gameID,
    lobbyCreatedAt: raw.lobbyCreatedAt,
    config,
    players: buildFullPlayerRoster(raw).map((p) => ({
      clientID: p.clientID,
      username: p.username,
      clanTag: blankClanTags ? null : p.clanTag,
      isLobbyCreator: true,
      friends: [],
    })),
    tribes: raw.tribes ?? [],
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

// Map binaries/manifests are fetched straight from raw.githubusercontent.com
// (see makeMapLoader) - a plain CDN fetch with no retry of its own. A single
// transient blip (a dropped connection, a momentary rate-limit) used to burn
// an entire multi-minute replay for nothing: the fetch throws, the outer
// try/catch in computeGameTileStats logs it and returns null, and that null
// is indistinguishable from a genuine replay divergence to every caller
// (including scripts/backfill-tile-stats.mjs's own retry loop, which then
// re-runs the *whole* replay from scratch rather than just the one flaky
// fetch). Retrying a handful of times here, only at the point of failure, is
// far cheaper and fixes exactly the transient case without masking a real
// divergence (a persistently-failing fetch - a genuinely missing map file -
// still throws after exhausting retries, same as before).
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      lastErr = new Error(`Failed to fetch ${url}: ${res.status}`)
      // A 4xx (e.g. 404 - the map genuinely doesn't exist at this commit)
      // won't succeed on retry - only back off and retry on likely-transient
      // failures (5xx, rate limiting).
      if (res.status < 500 && res.status !== 429) throw lastErr
    } catch (err) {
      lastErr = err
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * attempt))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function cachedArrayBuffer(url: string, key: string): Promise<Uint8Array> {
  const cached = await idbGet<ArrayBuffer>(key)
  if (cached) return new Uint8Array(cached)
  const res = await fetchWithRetry(url)
  const buf = await res.arrayBuffer()
  await idbSet(key, buf)
  return new Uint8Array(buf)
}

async function cachedManifest(slug: string, base: string): Promise<MapManifest> {
  const cached = await idbGet<MapManifest>(`${slug}:manifest`)
  if (cached) return cached
  const res = await fetchWithRetry(`${base}/manifest.json`)
  const manifest = (await res.json()) as MapManifest
  await idbSet(`${slug}:manifest`, manifest)
  return manifest
}

/** Loads whichever map the game actually used (see mapSlug) - fails (throws/404s) if that map didn't exist yet at the given commit. */
function makeMapLoader(gameMapName: string, commit: EngineCommit): GameMapLoader {
  const slug = mapSlug(gameMapName)
  const base = `https://raw.githubusercontent.com/openfrontio/OpenFrontIO/${commit}/resources/maps/${slug}`
  const mapData: MapData = {
    mapBin: () => cachedArrayBuffer(`${base}/map.bin`, `${commit}:${slug}:map.bin`),
    map4xBin: () => cachedArrayBuffer(`${base}/map4x.bin`, `${commit}:${slug}:map4x.bin`),
    map16xBin: () => cachedArrayBuffer(`${base}/map16x.bin`, `${commit}:${slug}:map16x.bin`),
    manifest: () => cachedManifest(`${commit}:${slug}`, base),
    webpPath: '',
  }
  return { getMapData: () => mapData }
}

// ── Shared setup (fetch + feed the full turn log into a fresh runner) ───────
// Both computeGameTileStats (full replay, running peaks) and
// computeTilePercentAtTick (a single snapshot at a given tick) need the
// exact same game constructed and pre-loaded with every turn - factored out
// so the two stay in lockstep instead of risking drift between two copies.

async function loadRunner(gameId: string) {
  const [record, rawTurns] = await Promise.all([fetchRawRecord(gameId), fetchRawTurns(gameId)])
  if (!record) return null
  const { info: raw, gitCommit } = record

  if (!gitCommit || !(KNOWN_ENGINE_COMMITS as readonly string[]).includes(gitCommit)) {
    console.error(
      `Game ${gameId} was played on engine commit ${gitCommit ?? '(unknown)'}, which isn't one of the vendored ` +
        `engine trees (${KNOWN_ENGINE_COMMITS.join(', ')}) - refusing to replay it against a mismatched engine ` +
        `rather than produce a plausible-looking but wrong result.`,
    )
    return null
  }
  const commit = gitCommit as EngineCommit

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

  // gameStart/turns are typed against the dcc18d5 tree's Schemas (the static
  // import at the top of this file), but createGameRunner here may be the
  // aeb8d60 tree's version instead, whose equivalent types differ in a few
  // fields (e.g. a kick_player intent's target field was renamed between
  // commits) - a real, confirmed difference, not a type-safety gap being
  // papered over. It doesn't matter at runtime: both gameStart and every
  // turn are just OpenFront's own untransformed JSON for a game actually
  // played on `commit`, so they already match whichever shape that engine
  // tree expects - only TS's structural typing sees two nominally different
  // trees and can't verify that across a dynamic, commit-selected import.
  const createGameRunner = await loadCreateGameRunner(commit)
  const runner = await createGameRunner(gameStart as never, undefined, makeMapLoader(raw.config.gameMap, commit) as never, () => {})
  for (let t = 0; t <= lastTick; t++) {
    runner.addTurn((byTurnNumber.get(t) ?? { turnNumber: t, intents: [] }) as never)
  }

  return { raw, runner, lastTick, commit }
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
    const loaded = await loadRunner(gameId)
    if (!loaded) return null
    const { raw, runner, lastTick } = loaded

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

    // Cross-check against OpenFront's own recorded finalTiles (available per
    // player straight from the same public API call this replay already
    // used) - a player's simulated PEAK can never be lower than their real
    // recorded end-of-game count, so a wide gap means this replay diverged
    // from the real game somewhere and produced numbers nobody should trust.
    // Confirmed directly: a real divergence undercounted by 5-50x on
    // multiple games while completing "successfully" with no thrown error -
    // this is the only signal that catches that class of bug. Generous
    // tolerance (half the real value) for legitimate small differences in
    // exactly which tick the winner gets declared on; still easily catches
    // an order-of-magnitude undercount.
    const MIN_PLAUSIBLE_FRACTION = 0.5
    for (const p of raw.players) {
      const reported = Number(p.stats?.finalTiles ?? 0)
      if (!(reported > 0)) continue
      const ours = maxTiles[p.clientID] ?? 0
      if (ours < reported * MIN_PLAUSIBLE_FRACTION) {
        console.error(
          `Replay simulation for ${gameId} diverged: ${p.clientID} peaked at ${ours} tiles in our sim vs ${reported} reported by OpenFront - treating as failed`,
        )
        return null
      }
    }

    return { maxTiles, maxPercent, finalTiles }
  } catch (err) {
    console.error('Replay simulation failed', err)
    return null
  }
}

/**
 * Replays a game up to (and stopping exactly at) one specific tick and
 * returns every player's land share at that instant - e.g. tick 1800 for
 * "tile % at 3:00". Unlike computeGameTileStats this never runs to the
 * game's end or its winner: it only ever simulates as many ticks as
 * requested, so it's cheap even for a game that later runs for 20+ minutes.
 * Returns null if the game couldn't be fetched/replayed, or didn't last
 * long enough to reach that tick at all.
 */
export async function computeTilePercentAtTick(gameId: string, atTick: number): Promise<Record<string, number> | null> {
  try {
    const loaded = await loadRunner(gameId)
    if (!loaded) return null
    const { runner, lastTick } = loaded
    if (lastTick < atTick) return null

    let tick = 0
    while (tick < atTick && runner.executeNextTick()) tick++
    if (tick < atTick) return null

    const totalLandTiles = runner.game.map().numLandTiles()
    const denom = Math.max(1, totalLandTiles - runner.game.numTilesWithFallout())
    const percentByClientId: Record<string, number> = {}
    for (const player of runner.game.players()) {
      const clientId = player.clientID()
      if (!clientId) continue
      percentByClientId[clientId] = (player.numTilesOwned() / denom) * 100
    }
    return percentByClientId
  } catch (err) {
    console.error('Tile-percent-at-tick replay failed', err)
    return null
  }
}
