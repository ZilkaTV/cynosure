// ── Speedrun mode ────────────────────────────────────────────────────────────
// Category: SOLO game · Map Australia · No Nations (bots are normal/allowed -
// only nations are disabled). A member pastes a game link; the site pulls the
// game from OpenFront, checks every condition, and - if valid and faster than
// their current best - records the time.

import { fetchGameDetail, type GameDetail } from './openfront'
import { supabase } from './supabase'

export const SPEEDRUN_RULE = 'Solo game · Map Australia · No Nations'

export interface SpeedrunEntry {
  openfront_id: string
  game_id: string
  seconds: number
  attempts: number
  submitted_at: string
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

/** Check a game meets the speedrun category. */
export function verifySpeedrun(d: GameDetail): { ok: boolean; reason?: string; seconds: number } {
  if (d.map !== 'Australia') return { ok: false, reason: `Map must be Australia (this game was ${d.map}).`, seconds: 0 }
  if (d.gameType !== 'Singleplayer') return { ok: false, reason: `Must be a solo (singleplayer) game (this was ${d.gameType}).`, seconds: 0 }
  if (d.nations !== 'disabled') return { ok: false, reason: 'Nations must be disabled ("No Nations").', seconds: 0 }
  if (!d.winnerClientId) return { ok: false, reason: 'The game has no recorded winner - it wasn’t completed.', seconds: 0 }
  if (!d.durationSeconds) return { ok: false, reason: 'No duration recorded for this game.', seconds: 0 }
  return { ok: true, seconds: d.durationSeconds }
}

export async function fetchSpeedruns(): Promise<Record<string, SpeedrunEntry>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_speedruns').select('openfront_id, game_id, seconds, attempts, submitted_at')
  if (error) return {}
  const map: Record<string, SpeedrunEntry> = {}
  for (const r of (data as SpeedrunEntry[]) ?? []) map[r.openfront_id] = r
  return map
}

export function replayToolUrl(gameId: string): string {
  return `https://openfront-tools.frozenpenguin.media?id=${encodeURIComponent(gameId)}`
}

export interface SubmitResult {
  ok: boolean
  message: string
  seconds?: number
  best?: boolean
  /** Set when the game couldn't be auto-verified (old version) - link to check it manually. */
  replayUrl?: string
}

export async function submitSpeedrun(openfrontId: string, gameLink: string): Promise<SubmitResult> {
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

  const v = verifySpeedrun(detail)
  if (!v.ok) return { ok: false, message: v.reason ?? 'This game does not meet the speedrun rules.' }

  if (!supabase) return { ok: true, message: `Verified (${fmtTime(v.seconds)})! Connect the backend to save times.`, seconds: v.seconds }

  const { data: existing } = await supabase
    .from('cyn_speedruns')
    .select('seconds, attempts')
    .eq('openfront_id', openfrontId)
    .maybeSingle()

  const row = existing as { seconds: number; attempts: number } | null
  const attempts = (row?.attempts ?? 0) + 1

  // Every valid run counts as an attempt (and updates submitted_at, so the
  // "posted a speedrun today" quest sees it), even if it doesn't beat the best.
  if (row != null && row.seconds <= v.seconds) {
    await supabase.from('cyn_speedruns').update({ attempts, submitted_at: new Date().toISOString() }).eq('openfront_id', openfrontId)
    return {
      ok: true,
      message: `Verified (${fmtTime(v.seconds)}), but your current best (${fmtTime(row.seconds)}) is faster.`,
      seconds: v.seconds,
      best: false,
    }
  }

  const { error } = await supabase.from('cyn_speedruns').upsert(
    { openfront_id: openfrontId, game_id: gameId, seconds: v.seconds, attempts, submitted_at: new Date().toISOString() },
    { onConflict: 'openfront_id' },
  )
  if (error) return { ok: false, message: `Verified, but saving failed: ${error.message}` }

  return { ok: true, message: `New best time: ${fmtTime(v.seconds)}!`, seconds: v.seconds, best: true }
}
