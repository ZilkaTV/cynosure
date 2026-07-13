// ── Speedrun mode ────────────────────────────────────────────────────────────
// Category: SOLO game · Map Australia · No Nations. A member pastes a game link;
// the site pulls the game from OpenFront, checks every condition, and — if valid
// and faster than their current best — records the time.

import { fetchGameDetail, type GameDetail } from './openfront'
import { supabase } from './supabase'

export const SPEEDRUN_RULE = 'Solo game · Map Australia · No Nations'

export interface SpeedrunEntry {
  openfront_id: string
  game_id: string
  seconds: number
}

/** Extract a game id from a raw id or any OpenFront link. */
export function parseGameId(input: string): string {
  const parts = input.trim().split(/[/#=?&\s]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : input.trim()
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
  if (d.bots !== 0) return { ok: false, reason: `No bots allowed (this game had ${d.bots}).`, seconds: 0 }
  if (!d.winnerClientId) return { ok: false, reason: 'The game has no recorded winner — it wasn’t completed.', seconds: 0 }
  if (!d.durationSeconds) return { ok: false, reason: 'No duration recorded for this game.', seconds: 0 }
  return { ok: true, seconds: d.durationSeconds }
}

export async function fetchSpeedruns(): Promise<Record<string, SpeedrunEntry>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_speedruns').select('openfront_id, game_id, seconds')
  if (error) return {}
  const map: Record<string, SpeedrunEntry> = {}
  for (const r of (data as SpeedrunEntry[]) ?? []) map[r.openfront_id] = r
  return map
}

export interface SubmitResult {
  ok: boolean
  message: string
  seconds?: number
  best?: boolean
}

export async function submitSpeedrun(openfrontId: string, gameLink: string): Promise<SubmitResult> {
  const gameId = parseGameId(gameLink)
  if (!gameId) return { ok: false, message: 'Please paste a game link or id.' }

  const detail = await fetchGameDetail(gameId)
  if (!detail) {
    return {
      ok: false,
      message:
        'Couldn’t find this game on OpenFront. It may be from an older game version — those aren’t auto-verifiable yet (the frozenpenguin replay tool can still open them).',
    }
  }

  const v = verifySpeedrun(detail)
  if (!v.ok) return { ok: false, message: v.reason ?? 'This game does not meet the speedrun rules.' }

  if (!supabase) return { ok: true, message: `Verified (${fmtTime(v.seconds)})! Connect the backend to save times.`, seconds: v.seconds }

  const { data: existing } = await supabase
    .from('cyn_speedruns')
    .select('seconds')
    .eq('openfront_id', openfrontId)
    .maybeSingle()

  const prev = (existing as { seconds: number } | null)?.seconds
  if (prev != null && prev <= v.seconds) {
    return { ok: true, message: `Verified (${fmtTime(v.seconds)}), but your current best (${fmtTime(prev)}) is faster.`, seconds: v.seconds, best: false }
  }

  const { error } = await supabase.from('cyn_speedruns').upsert(
    { openfront_id: openfrontId, game_id: gameId, seconds: v.seconds, submitted_at: new Date().toISOString() },
    { onConflict: 'openfront_id' },
  )
  if (error) return { ok: false, message: `Verified, but saving failed: ${error.message}` }

  return { ok: true, message: `New best time: ${fmtTime(v.seconds)}! 🏁`, seconds: v.seconds, best: true }
}
