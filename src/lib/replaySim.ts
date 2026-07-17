// ── Point-in-time tile ownership via headless replay (main-thread API) ─────
// The heavy tick-by-tick simulation itself lives in replaySimCore.ts and
// normally runs inside replaySim.worker.ts - entirely off the main thread,
// so replaying even a big, bot-heavy game never lags the page. If module
// workers aren't available for some reason, this falls back to running the
// same computation right here with a periodic yield, same as before.
//
// This module also owns the parts that must live on the main thread anyway:
// sharing one computation per gameId across every caller (so switching tabs
// or reopening a game never starts a duplicate replay), the permanent
// IndexedDB result cache, the shared Supabase cache (see below), and
// progress subscriptions for the UI.

import {
  computeGameTileStats,
  idbGet,
  idbSet,
  resolveEngineCommit,
  COMPUTE_LOGIC_VERSION,
  type EngineCommit,
  type GameTileStats,
  type ReplayProgress,
} from './replaySimCore'
import { supabase } from './supabase'

export type { GameTileStats, ReplayProgress }

// A finished game's tile stats never change *for the engine commit it was
// actually played on and a given computation logic version*, so completed
// results are cached forever (no TTL) in the same IndexedDB store the map
// binaries use - keyed to the game's own resolved commit (see
// resolveEngineCommit in replaySimCore.ts - different games can and do
// resolve to different commits) and COMPUTE_LOGIC_VERSION, so re-vendoring
// the engine or fixing a bug in how the numbers are derived (both happen
// periodically) doesn't leave every visitor stuck with a stale, wrong
// result computed against a since-replaced version; it just quietly
// recomputes once instead.
function statsKey(gameId: string, commit: EngineCommit): string {
  return `stats:${commit}:${COMPUTE_LOGIC_VERSION}:${gameId}`
}

// ── Shared cache (Supabase, when configured) ────────────────────────────
// The IndexedDB cache above is per-visitor - every browser that opens a
// game's report for the first time pays for the same replay. Since the
// result is identical for everyone (same game, same engine version), it's
// stored centrally too: the first visitor to compute a given game (at this
// VENDORED_COMMIT/COMPUTE_LOGIC_VERSION) uploads it, and every visitor after
// that - any browser, any device - gets it back on the next read, never
// recomputing at all. Falls back to IndexedDB-only (still correct, just not
// shared) if Supabase isn't configured.

interface SharedRow {
  max_tiles: Record<string, number>
  max_percent: Record<string, number>
  final_tiles: Record<string, number>
}

async function fetchShared(gameId: string, commit: EngineCommit): Promise<GameTileStats | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('cyn_game_tile_stats')
    .select('max_tiles, max_percent, final_tiles')
    .eq('game_id', gameId)
    .eq('vendored_commit', commit)
    .eq('compute_logic_version', COMPUTE_LOGIC_VERSION)
    .maybeSingle()
  if (error || !data) return null
  const row = data as SharedRow
  return { maxTiles: row.max_tiles, maxPercent: row.max_percent, finalTiles: row.final_tiles }
}

async function saveShared(gameId: string, commit: EngineCommit, stats: GameTileStats): Promise<void> {
  if (!supabase) return
  // Upsert, not insert-only: computeGameTileStats now fails closed on an
  // obviously-incomplete result (see its own coverage check), but a
  // corrupted row still reached this table once in production before that
  // existed - upserting means a later, correct recomputation can replace a
  // bad row instead of being permanently locked out by it.
  await supabase
    .from('cyn_game_tile_stats')
    .upsert(
      {
        game_id: gameId,
        vendored_commit: commit,
        compute_logic_version: COMPUTE_LOGIC_VERSION,
        max_tiles: stats.maxTiles,
        max_percent: stats.maxPercent,
        final_tiles: stats.finalTiles,
      },
      { onConflict: 'game_id,vendored_commit,compute_logic_version' },
    )
    .then(() => {}, () => {}) // best-effort - a failed upload just means the next visitor computes it fresh too
}

// Computation is keyed by gameId at module scope (not tied to any component)
// so switching games or closing the modal doesn't stop it, and reopening the
// same game while it's still running reattaches to the SAME run instead of
// starting a second one from scratch.
const inFlight = new Map<string, Promise<GameTileStats | null>>()
const progressListeners = new Map<string, Set<(p: ReplayProgress) => void>>()
const lastProgress = new Map<string, ReplayProgress>()

function notifyProgress(gameId: string, p: ReplayProgress) {
  lastProgress.set(gameId, p)
  progressListeners.get(gameId)?.forEach((fn) => fn(p))
}

/** Subscribe to tick progress for a game currently being replayed. Fires immediately with the last known progress, if any. */
export function subscribeReplayProgress(gameId: string, fn: (p: ReplayProgress) => void): () => void {
  if (!progressListeners.has(gameId)) progressListeners.set(gameId, new Set())
  progressListeners.get(gameId)!.add(fn)
  const last = lastProgress.get(gameId)
  if (last) fn(last)
  return () => progressListeners.get(gameId)?.delete(fn)
}

// ── Worker plumbing ─────────────────────────────────────────────────────

interface WorkerResultMsg {
  type: 'result'
  gameId: string
  stats: GameTileStats | null
}
interface WorkerProgressMsg {
  type: 'progress'
  gameId: string
  tick: number
  totalTicks: number
}

let worker: Worker | null | undefined // undefined = not yet tried, null = unsupported/failed
const pendingResolvers = new Map<string, (stats: GameTileStats | null) => void>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./replaySim.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResultMsg | WorkerProgressMsg>) => {
      const data = e.data
      if (data.type === 'progress') {
        notifyProgress(data.gameId, { tick: data.tick, totalTicks: data.totalTicks })
      } else if (data.type === 'result') {
        pendingResolvers.get(data.gameId)?.(data.stats)
        pendingResolvers.delete(data.gameId)
      }
    }
    worker.onerror = (e) => {
      console.error('Replay worker error, failing pending replays', e)
      for (const resolve of pendingResolvers.values()) resolve(null)
      pendingResolvers.clear()
    }
  } catch (err) {
    console.error('Replay worker unavailable, falling back to main thread', err)
    worker = null
  }
  return worker
}

async function runReplay(gameId: string): Promise<GameTileStats | null> {
  const w = getWorker()
  if (!w) {
    // Main-thread fallback: a tighter yield interval while the tab is
    // visible keeps things responsive, same trade-off the worker path no
    // longer needs to make.
    return computeGameTileStats(gameId, {
      yieldEveryTicks: document.hidden ? 200 : 40,
      onProgress: (p) => notifyProgress(gameId, p),
    })
  }
  return new Promise((resolve) => {
    pendingResolvers.set(gameId, resolve)
    w.postMessage({ gameId })
  })
}

/**
 * Replays a full game tick by tick to find each player's peak tile count
 * (a true running max, not a single checkpoint) plus their tile count at
 * the end - both unavailable from OpenFront's public API, which only
 * exposes a single final-tiles number per player (and even that is missing
 * for some players). Returns null if the game couldn't be fetched or
 * replayed. Runs off the main thread (see above), is shared across every
 * caller asking for the same gameId, and its result is cached permanently,
 * so a visitor closing and reopening the same game's detail modal never
 * pays for the replay twice.
 */
export function getGameTileStats(gameId: string): Promise<GameTileStats | null> {
  const running = inFlight.get(gameId)
  if (running) return running

  const p = (async () => {
    // Resolved first, before touching any cache: which engine commit (if
    // any) actually matches this specific game. Different games can and do
    // resolve to different commits (see replaySimCore.ts), so the cache key
    // below is per-game, not a single fixed value - and a game whose commit
    // we don't have vendored at all is reported as unavailable rather than
    // computed against the wrong engine.
    const commit = await resolveEngineCommit(gameId)
    if (!commit) return null

    const cached = await idbGet<GameTileStats>(statsKey(gameId, commit))
    if (cached) return cached

    const shared = await fetchShared(gameId, commit)
    if (shared) {
      await idbSet(statsKey(gameId, commit), shared)
      return shared
    }

    const result = await runReplay(gameId)
    if (result) {
      await idbSet(statsKey(gameId, commit), result)
      await saveShared(gameId, commit, result)
    }
    return result
  })().finally(() => {
    inFlight.delete(gameId)
    progressListeners.delete(gameId)
    lastProgress.delete(gameId)
  })

  inFlight.set(gameId, p)
  return p
}

let prefetchChain: Promise<unknown> = Promise.resolve()

/**
 * Queues Max Tiles computations for games a visitor is likely to open soon
 * (e.g. the games listed on the Overview/profile pages), so by the time
 * they actually click into one, it's often already cached instead of
 * making them wait. Fire-and-forget - callers don't await this.
 *
 * Deliberately sequential, not one Promise.all: OpenFront's public API is
 * strictly rate-limited, and firing off a full game+turns fetch for every
 * visible row at once would compete with (and could break) every other
 * live fetch on the page. Each already-cached game resolves near-instantly
 * anyway, so the queue only actually pays the full cost for genuinely new
 * games.
 */
export function prefetchGameTileStats(gameIds: string[]): void {
  for (const gameId of gameIds) {
    prefetchChain = prefetchChain.then(() => getGameTileStats(gameId)).catch(() => {})
  }
}
