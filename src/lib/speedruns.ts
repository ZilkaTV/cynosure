// ── Speedrun mode ────────────────────────────────────────────────────────────
// Category: SOLO game · Map Australia · No Nations (bots are normal/allowed -
// only nations are disabled). A member pastes a game link; the site pulls the
// game from OpenFront, checks every condition, and - if valid and faster than
// their current best - records the time.

import { fetchGameDetail, fetchLastActionSeconds, SINGLEPLAYER_SPAWN_PHASE_TURNS, type GameDetail } from './openfront'
import { supabase } from './supabase'
import { CLAN_TAG } from '../config'
import type { SpeedrunReplayMetrics } from './replaySimCore'
import { createReplayWorker } from './replaySim'

export const SPEEDRUN_RULE = 'Solo game · Map Australia · No Nations'

// Tiles @ 3:00 - how much of the map the player controlled at the exact
// 3:00 mark. Tracked as its own best-ever value, independent of which game
// holds the best TIME: a run that doesn't beat the clock can still beat the
// tile share, and a member's current best-time game may simply predate this
// stat existing at all (confirmed report: showed up missing for a member
// whose stored best time was never re-submitted since). Every valid
// submission recomputes it and keeps the higher of the two, regardless of
// whether that submission was a new best time. Not an independent category
// with its own attempts counter - it rides along with whichever submission
// happens to improve it.
//
// The player's own in-game clock reads "3:00" only after the spawn-phase
// countdown has already run (see SINGLEPLAYER_SPAWN_PHASE_TURNS in
// openfront.ts - the same 100-turn/10s offset that had to be subtracted for
// speedrun *timing*, here added instead since this is the reverse
// direction: converting a displayed time back to a raw tick). Every
// speedrun submission is a Singleplayer game (verifySpeedrun requires it),
// so this offset always applies, unconditionally. Confirmed against both
// real submitted runs via the openfront-tools.frozenpenguin.media replay
// viewer's own "Besitz" (% owned) readout at its displayed 03:00 mark: raw
// tick 1800 (no offset) gave implausible ~9% for both, while tick 1900
// (with the offset) landed within about a percentage point of the
// viewer's own 11.0%/10.7%.
const TILES_AT_TICK = 3 * 60 * 10 + SINGLEPLAYER_SPAWN_PHASE_TURNS

export interface SpeedrunEntry {
  openfront_id: string
  game_id: string
  seconds: number
  attempts: number
  submitted_at: string
  tiles3min_percent: number | null
}

export function fmtPercent(p: number): string {
  return `${p.toFixed(1)}%`
}

// Segments that show up in game links but are never the game id itself (the
// replay tool's own URLs look like /w1/game/<id>?live - "live" used to get
// picked up as the id because it's the last URL segment).
const NON_ID_SEGMENTS = new Set(['live', 'replay', 'game', 'w', 'watch'])

/** Extract a game id from a raw id or any OpenFront / replay-tool link. */
export function parseGameId(input: string): string {
  const trimmed = input.trim()

  // Prefer an explicit /game/<id> path segment (used by openfront.io and the
  // frozenpenguin replay tool alike).
  const pathMatch = trimmed.match(/\/game\/([A-Za-z0-9]+)/)
  if (pathMatch) return pathMatch[1]

  // Prefer an explicit id=/gameid= query param.
  const queryMatch = trimmed.match(/[?&](?:id|gameid)=([A-Za-z0-9]+)/i)
  if (queryMatch) return queryMatch[1]

  // Fall back to the last path-like segment that isn't a known non-id word
  // (live, w0/w1/..., etc).
  const parts = trimmed
    .split(/[/#=?&\s]+/)
    .filter(Boolean)
    .filter((p) => !NON_ID_SEGMENTS.has(p.toLowerCase()) && !/^w\d+$/i.test(p))
  return parts.length ? parts[parts.length - 1] : trimmed
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

/**
 * Check a game meets the speedrun category. Also requires the winner to be
 * the submitting member themselves, playing under the [CYN] tag - otherwise
 * anyone could submit someone else's (or a stranger's) replay as their own.
 */
export function verifySpeedrun(
  d: GameDetail,
  inGameName: string,
): { ok: boolean; reason?: string; seconds: number; clientID?: string } {
  if (d.map !== 'Australia') return { ok: false, reason: `Map must be Australia (this game was ${d.map}).`, seconds: 0 }
  if (d.gameType !== 'Singleplayer') return { ok: false, reason: `Must be a solo (singleplayer) game (this was ${d.gameType}).`, seconds: 0 }
  if (d.nations !== 'disabled') return { ok: false, reason: 'Nations must be disabled ("No Nations").', seconds: 0 }
  if (d.winnerClientIds.length === 0) return { ok: false, reason: 'The game has no recorded winner - it wasn’t completed.', seconds: 0 }
  if (!d.durationSeconds) return { ok: false, reason: 'No duration recorded for this game.', seconds: 0 }

  // A solo (Singleplayer) game - already required above - only ever has one winner.
  const winner = d.players.find((p) => p.clientID === d.winnerClientIds[0])
  if (!winner || winner.username.trim().toLowerCase() !== inGameName.trim().toLowerCase()) {
    return { ok: false, reason: 'The winner of this game doesn’t match your registered in-game name - you can only submit your own runs.', seconds: 0 }
  }
  if (winner.clanTag !== CLAN_TAG) {
    return { ok: false, reason: 'You must be playing with the [CYN] tag for the run to count.', seconds: 0 }
  }

  return { ok: true, seconds: d.durationSeconds, clientID: winner.clientID }
}

export async function fetchSpeedruns(): Promise<Record<string, SpeedrunEntry>> {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('cyn_speedruns')
    .select('openfront_id, game_id, seconds, attempts, submitted_at, tiles3min_percent')
  if (error) return {}
  const map: Record<string, SpeedrunEntry> = {}
  for (const r of (data as SpeedrunEntry[]) ?? []) map[r.openfront_id] = r
  return map
}

/**
 * The game record carries the full lobby config, so cheats and handicaps can be seen directly: a run only
 * counts on the standard rules (Australia, normal size, FFA, 400 bots, nations off, no cheats, all units,
 * no random spawn, no timers or modifiers). Speed settings cannot help: the time is the game clock.
 */
export function checkSpeedrunConfig(config: Record<string, unknown> | undefined): string | null {
  if (!config) return 'The game record has no settings to verify.'
  const bad = (cond: boolean, msg: string) => (cond ? msg : null)
  return (
    bad(config.gameMode !== undefined && config.gameMode !== 'Free For All', 'The game mode must be Free For All.') ??
    bad(config.gameMapSize !== undefined && config.gameMapSize !== 'Normal', 'The map size must be Normal (no compact map).') ??
    bad(config.bots !== 400, 'The run must use 400 bots (the default).') ??
    bad(config.infiniteGold === true, 'Infinite gold is not allowed.') ??
    bad(config.infiniteTroops === true, 'Infinite troops are not allowed.') ??
    bad(config.instantBuild === true, 'Instant build is not allowed.') ??
    bad(config.randomSpawn === true, 'Random spawn is not allowed.') ??
    bad(Array.isArray(config.disabledUnits) && config.disabledUnits.length > 0, 'All units must be enabled.') ??
    bad(config.waterNukes === true, 'Water nukes must be off.') ??
    bad(config.goldMultiplier !== undefined || config.startingGold !== undefined, 'Gold multiplier and starting gold must stay at the defaults.') ??
    bad(config.maxTimerValue != null, 'A game timer is not allowed.') ??
    bad(config.customAllianceDuration !== undefined || config.doomsdayClock !== undefined || config.overtime !== undefined, 'No extra game modifiers are allowed.')
  )
}

async function fetchGameConfig(gameId: string): Promise<Record<string, unknown> | undefined> {
  try {
    const res = await fetch(`/api/of/public/game/${encodeURIComponent(gameId)}?turns=false`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return undefined
    return ((await res.json()) as { info?: { config?: Record<string, unknown> } }).info?.config
  } catch {
    return undefined
  }
}

export function replayToolUrl(gameId: string): string {
  return `https://openfront-tools.frozenpenguin.media?id=${encodeURIComponent(gameId)}`
}

export interface RecentSoloGame {
  gameId: string
  start: string
  map: string
  result: 'victory' | 'defeat' | 'incomplete'
}

/** The player's newest solo games (via the Worker, edge-cached for 15 s), newest first. */
export async function fetchRecentSoloGames(openfrontId: string): Promise<RecentSoloGame[]> {
  const res = await fetch(`/api/solo-latest?id=${encodeURIComponent(openfrontId)}`)
  if (!res.ok) throw new Error(`solo games ${res.status}`)
  return ((await res.json()) as { games: RecentSoloGame[] }).games
}

export interface SubmitResult {
  ok: boolean
  message: string
  seconds?: number
  best?: boolean
  /** Set when the game couldn't be auto-verified (old version) - link to check it manually. */
  replayUrl?: string
}

/**
 * Replays the game once, in a fresh instance of the replay Worker (clean JS realm - the engine cannot replay a second game
 * in the same realm, and the replay stays off the main thread). Null on any failure or after 3 minutes.
 */
function replaySpeedrun(gameId: string, onProgress?: (fraction: number) => void): Promise<SpeedrunReplayMetrics | null> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = createReplayWorker()
    } catch {
      resolve(null)
      return
    }
    const done = (value: SpeedrunReplayMetrics | null) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(value)
    }
    const timer = setTimeout(() => done(null), 180_000)
    worker.onmessage = (e: MessageEvent<{ type: string; result?: SpeedrunReplayMetrics | null; tick?: number; totalTicks?: number }>) => {
      if (e.data.type === 'speedrun-result') done(e.data.result ?? null)
      else if (e.data.type === 'speedrun-progress' && onProgress && e.data.tick && e.data.totalTicks) onProgress(Math.min(1, e.data.tick / e.data.totalTicks))
    }
    worker.onerror = () => done(null)
    worker.postMessage({ gameId, speedrunTilesAtTick: TILES_AT_TICK })
  })
}

export async function submitSpeedrun(
  openfrontId: string,
  gameLink: string,
  inGameName: string,
  onProgress?: (fraction: number) => void,
): Promise<SubmitResult> {
  const gameId = parseGameId(gameLink)
  if (!gameId) return { ok: false, message: 'Please paste a game link or id.' }

  const detail = await fetchGameDetail(gameId)
  if (!detail) {
    return {
      ok: false,
      message: 'Old version - please use the replay tool link below with the game id to verify manually.',
      replayUrl: replayToolUrl(gameId),
    }
  }

  const v = verifySpeedrun(detail, inGameName)
  if (!v.ok) return { ok: false, message: v.reason ?? 'This game does not meet the speedrun rules.' }

  // Settings check from the record itself (cheats, handicaps, bot count). If the record cannot be read the run is
  // refused rather than waved through.
  const configProblem = checkSpeedrunConfig(await fetchGameConfig(gameId))
  if (configProblem) return { ok: false, message: configProblem }

  // The clock must stop when the match is DECIDED, not when the connection closes or the player
  // stops clicking: OpenFront's `duration` runs until the connection closes (can be minutes
  // later), and the turn log keeps going for as long as the player keeps playing after the win
  // (a real run showed 5:21 in game but 5:34 by "last action"). Best source: replay the game with
  // the same engine and read the clock at the moment its own win check fired - shown in game as
  // the truncated seconds, hence floor. Falls back to the last real action (then to the reported
  // duration) when the game can't be replayed (old engine version, fetch problems).
  const replay = await replaySpeedrun(gameId, onProgress)
  const winSeconds = replay?.winSeconds ?? null
  const actualSeconds = winSeconds ?? (await fetchLastActionSeconds(gameId).catch(() => null)) ?? v.seconds
  v.seconds = winSeconds != null ? Math.floor(winSeconds) : Math.round(actualSeconds)

  if (!supabase) return { ok: true, message: `Verified (${fmtTime(v.seconds)})! Connect the backend to save times.`, seconds: v.seconds }

  const { data: existing } = await supabase
    .from('cyn_speedruns')
    .select('seconds, attempts, tiles3min_percent')
    .eq('openfront_id', openfrontId)
    .maybeSingle()

  const row = existing as { seconds: number; attempts: number; tiles3min_percent: number | null } | null
  const attempts = (row?.attempts ?? 0) + 1

  // Read this submission's own tile share at the 3:00 mark (see
  // TILES_AT_TICK) regardless of whether it ends up being a new best TIME -
  // it's tracked as its own best-ever value. A run under 3 minutes never
  // reaches that mark, so this can legitimately come back null.
  let tiles3minPercent: number | null = null
  if (v.clientID) tiles3minPercent = replay?.tilePercentByClientId?.[v.clientID] ?? null
  const bestTiles3minPercent =
    tiles3minPercent != null && (row?.tiles3min_percent == null || tiles3minPercent > row.tiles3min_percent)
      ? tiles3minPercent
      : (row?.tiles3min_percent ?? null)

  // Every valid run counts as an attempt (and updates submitted_at, so the
  // "posted a speedrun today" quest sees it), even if it doesn't beat the
  // best TIME - the tile-share best above is kept either way.
  if (row != null && row.seconds <= v.seconds) {
    await supabase
      .from('cyn_speedruns')
      .update({ attempts, submitted_at: new Date().toISOString(), tiles3min_percent: bestTiles3minPercent })
      .eq('openfront_id', openfrontId)
    return {
      ok: true,
      message: `Verified (${fmtTime(v.seconds)}), but your current best (${fmtTime(row.seconds)}) is faster.`,
      seconds: v.seconds,
      best: false,
    }
  }

  const { error } = await supabase.from('cyn_speedruns').upsert(
    {
      openfront_id: openfrontId,
      game_id: gameId,
      seconds: v.seconds,
      attempts,
      submitted_at: new Date().toISOString(),
      tiles3min_percent: bestTiles3minPercent,
    },
    { onConflict: 'openfront_id' },
  )
  if (error) return { ok: false, message: `Verified, but saving failed: ${error.message}` }

  return { ok: true, message: `New best time: ${fmtTime(v.seconds)}!`, seconds: v.seconds, best: true }
}
