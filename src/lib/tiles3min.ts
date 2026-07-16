// ── Tiles @ 3min mode ────────────────────────────────────────────────────────
// Same category as the time-based speedrun (Solo game · Map Australia · No
// Nations), but instead of "how fast did you win", this measures "how much
// of the map did you control at the exact 3:00 mark" - a snapshot, not a
// peak, taken via a headless replay (see replaySimCore.ts's
// computeTilePercentAtTick) since OpenFront's public API only ever exposes
// a game's *final* tile count, never a mid-game one.

import { fetchGameDetail, type GameDetail } from './openfront'
import { supabase } from './supabase'
import { CLAN_TAG } from '../config'
import { parseGameId, replayToolUrl } from './speedruns'

const SERVER_TICKS_PER_SECOND = 10
const SNAPSHOT_AT_SECONDS = 180
const SNAPSHOT_AT_TICK = SNAPSHOT_AT_SECONDS * SERVER_TICKS_PER_SECOND

export const TILES3MIN_RULE = 'Solo game · Map Australia · No Nations'

export interface Tiles3MinEntry {
  openfront_id: string
  game_id: string
  percent: number
  attempts: number
  submitted_at: string
}

export function fmtPercent(p: number): string {
  return `${p.toFixed(1)}%`
}

/**
 * Check a game meets the category (same rules as the time-speedrun) and is
 * long enough to even have a 3:00 mark. Unlike the time-speedrun this isn't
 * about winning, so it matches the submitter by their own in-game name
 * instead of requiring they be the winner.
 */
export function verifyTiles3Min(d: GameDetail, inGameName: string): { ok: boolean; reason?: string; clientID?: string } {
  if (d.map !== 'Australia') return { ok: false, reason: `Map must be Australia (this game was ${d.map}).` }
  if (d.gameType !== 'Singleplayer') return { ok: false, reason: `Must be a solo (singleplayer) game (this was ${d.gameType}).` }
  if (d.nations !== 'disabled') return { ok: false, reason: 'Nations must be disabled ("No Nations").' }
  if (!d.durationSeconds || d.durationSeconds < SNAPSHOT_AT_SECONDS) {
    return { ok: false, reason: `Game must last at least ${SNAPSHOT_AT_SECONDS / 60} minutes.` }
  }

  const me = d.players.find((p) => p.username.trim().toLowerCase() === inGameName.trim().toLowerCase())
  if (!me) {
    return { ok: false, reason: 'Couldn’t find your registered in-game name among this game’s players.' }
  }
  if (me.clanTag !== CLAN_TAG) {
    return { ok: false, reason: `You must be playing with the [${CLAN_TAG}] tag for the run to count.` }
  }

  return { ok: true, clientID: me.clientID }
}

export async function fetchTiles3Min(): Promise<Record<string, Tiles3MinEntry>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_tiles3min').select('openfront_id, game_id, percent, attempts, submitted_at')
  if (error) return {}
  const map: Record<string, Tiles3MinEntry> = {}
  for (const r of (data as Tiles3MinEntry[]) ?? []) map[r.openfront_id] = r
  return map
}

export interface SubmitTiles3MinResult {
  ok: boolean
  message: string
  percent?: number
  best?: boolean
  replayUrl?: string
}

export async function submitTiles3Min(openfrontId: string, gameLink: string, inGameName: string): Promise<SubmitTiles3MinResult> {
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

  const v = verifyTiles3Min(detail, inGameName)
  if (!v.ok || !v.clientID) return { ok: false, message: v.reason ?? 'This game does not meet the tiles @ 3min rules.' }

  const { computeTilePercentAtTick } = await import('./replaySimCore')
  const percentByClientId = await computeTilePercentAtTick(gameId, SNAPSHOT_AT_TICK)
  if (!percentByClientId || !(v.clientID in percentByClientId)) {
    return { ok: false, message: 'Couldn’t replay this game to verify your tile share - please try again shortly.' }
  }
  const percent = percentByClientId[v.clientID]

  if (!supabase) return { ok: true, message: `Verified (${fmtPercent(percent)})! Connect the backend to save runs.`, percent }

  const { data: existing } = await supabase
    .from('cyn_tiles3min')
    .select('percent, attempts')
    .eq('openfront_id', openfrontId)
    .maybeSingle()

  const row = existing as { percent: number; attempts: number } | null
  const attempts = (row?.attempts ?? 0) + 1

  if (row != null && row.percent >= percent) {
    await supabase.from('cyn_tiles3min').update({ attempts, submitted_at: new Date().toISOString() }).eq('openfront_id', openfrontId)
    return {
      ok: true,
      message: `Verified (${fmtPercent(percent)}), but your current best (${fmtPercent(row.percent)}) is higher.`,
      percent,
      best: false,
    }
  }

  const { error } = await supabase.from('cyn_tiles3min').upsert(
    { openfront_id: openfrontId, game_id: gameId, percent, attempts, submitted_at: new Date().toISOString() },
    { onConflict: 'openfront_id' },
  )
  if (error) return { ok: false, message: `Verified, but saving failed: ${error.message}` }

  return { ok: true, message: `New best: ${fmtPercent(percent)}!`, percent, best: true }
}
