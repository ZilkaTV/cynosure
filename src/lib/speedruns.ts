// ── Speedrun mode ────────────────────────────────────────────────────────────
// Category: SOLO game · Map Australia · No Nations (bots are normal/allowed -
// only nations are disabled). A member pastes a game link; the site pulls the
// game from OpenFront, checks every condition, and - if valid and faster than
// their current best - records the time.

import type { GameDetail } from './openfront'
import { supabase } from './supabase'
import { CLAN_TAG } from '../config'

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
// (the 3:00 checkpoint tick is computed by scripts/speedrun-replay-one.mjs, which runs the engine in the cloud)

export interface SpeedrunEntry {
  openfront_id: string
  game_id: string
  seconds: number
  attempts: number
  submitted_at: string
  tiles3min_percent: number | null
  /** The engine replay read the time and every rule passed (no speed manipulation possible). */
  verified?: boolean
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
  if (d.winnerClientIds.length === 0) return { ok: false, reason: 'The game has no recorded winner. It wasn’t completed.', seconds: 0 }
  if (!d.durationSeconds) return { ok: false, reason: 'No duration recorded for this game.', seconds: 0 }

  // A solo (Singleplayer) game - already required above - only ever has one winner.
  const winner = d.players.find((p) => p.clientID === d.winnerClientIds[0])
  if (!winner || winner.username.trim().toLowerCase() !== inGameName.trim().toLowerCase()) {
    return { ok: false, reason: 'The winner of this game doesn’t match your registered in-game name. You can only submit your own runs.', seconds: 0 }
  }
  if (winner.clanTag !== CLAN_TAG) {
    return { ok: false, reason: 'You must be playing with the [CYN] tag for the run to count.', seconds: 0 }
  }

  return { ok: true, seconds: d.durationSeconds, clientID: winner.clientID }
}

export async function fetchSpeedruns(): Promise<Record<string, SpeedrunEntry>> {
  if (!supabase) return {}
  let { data, error } = await supabase
    .from('cyn_speedruns')
    .select('openfront_id, game_id, seconds, attempts, submitted_at, tiles3min_percent, verified')
  // Until the verified column exists (worker/d1/002-speedrun-verified.sql) fall back to the old list of columns.
  if (error) ({ data, error } = await supabase.from('cyn_speedruns').select('openfront_id, game_id, seconds, attempts, submitted_at, tiles3min_percent'))
  if (error) return {}
  const map: Record<string, SpeedrunEntry> = {}
  for (const r of (data as SpeedrunEntry[]) ?? []) map[r.openfront_id] = { ...r, verified: Boolean(r.verified) }
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
 * Sends a game to the server. The server reads the game record from OpenFront itself, checks the rules, that the winner is
 * this member's own account and that nobody else submitted the game, and queues it; the engine check runs in the cloud
 * (scripts/verify-speedruns.mjs), which is the only thing that writes the board. Nothing the browser computes is trusted.
 */
export async function submitSpeedrun(
  _openfrontId: string,
  gameLink: string,
  _inGameName: string,
  _onProgress?: (fraction: number) => void,
): Promise<SubmitResult> {
  const gameId = parseGameId(gameLink)
  if (!gameId) return { ok: false, message: 'Please paste a game link or id.' }
  try {
    const res = await fetch('/api/speedrun/submit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
    if (res.status === 401) return { ok: false, message: body.message ?? 'Sign in with Discord to submit a run.' }
    if (!res.ok && body.ok === undefined) return { ok: false, message: body.message ?? 'The submission failed, try again in a minute.', replayUrl: replayToolUrl(gameId) }
    return { ok: Boolean(body.ok), message: body.message ?? (body.ok ? 'Run received.' : 'This game does not meet the speedrun rules.') }
  } catch {
    return { ok: false, message: 'The submission failed (no connection), try again.' }
  }
}

export interface PendingSpeedrun {
  openfront_id: string
  game_id: string
  at: string
  status: 'pending' | 'done' | 'refused'
  message: string | null
  seconds: number | null
}

/** Submissions waiting for the engine check, and the recent outcomes (refusals carry the reason). */
export async function fetchPendingSpeedruns(): Promise<PendingSpeedrun[]> {
  try {
    const res = await fetch('/api/speedrun/pending')
    return res.ok ? ((await res.json()) as { items: PendingSpeedrun[] }).items : []
  } catch {
    return []
  }
}
