// ── Game nights (casual RSVP) ───────────────────────────────────────────────
// Lightweight "who's in tonight" coordination, distinct from the formal
// tournament/scrim system in events.ts (cyn_event_teams/cyn_event_submissions
// - admin-reviewed, point-scoring). Any signed-in member can propose one and
// RSVP going/maybe/not_going - matches the common guild/clan-platform RSVP
// pattern this site didn't have before.

import { supabase } from './supabase'

export interface GameNight {
  id: number
  startsAt: string
  note: string | null
  createdBy: string
  createdAt: string
}

export type RsvpStatus = 'going' | 'maybe' | 'not_going'

export interface GameNightWithRsvps extends GameNight {
  rsvps: Record<string, RsvpStatus> // openfront_id -> status
}

interface GameNightRow {
  id: number
  starts_at: string
  note: string | null
  created_by: string
  created_at: string
}

interface RsvpRow {
  game_night_id: number
  openfront_id: string
  status: RsvpStatus
}

/** Upcoming + recently-past game nights (last 24h kept visible so a "tonight" post doesn't vanish mid-evening), newest-starting first. */
export async function fetchGameNights(): Promise<GameNightWithRsvps[]> {
  if (!supabase) return []
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: nights, error: nightsErr }, { data: rsvps, error: rsvpErr }] = await Promise.all([
    supabase.from('cyn_game_nights').select('id, starts_at, note, created_by, created_at').gte('starts_at', since).order('starts_at', { ascending: true }),
    supabase.from('cyn_game_night_rsvps').select('game_night_id, openfront_id, status'),
  ])
  if (nightsErr || !nights) return []

  const rsvpsByNight = new Map<number, Record<string, RsvpStatus>>()
  for (const r of (rsvpErr ? [] : (rsvps as RsvpRow[]) ?? [])) {
    const m = rsvpsByNight.get(r.game_night_id) ?? {}
    m[r.openfront_id] = r.status
    rsvpsByNight.set(r.game_night_id, m)
  }

  return (nights as GameNightRow[]).map((n) => ({
    id: n.id,
    startsAt: n.starts_at,
    note: n.note,
    createdBy: n.created_by,
    createdAt: n.created_at,
    rsvps: rsvpsByNight.get(n.id) ?? {},
  }))
}

export interface GameNightResult {
  ok: boolean
  message: string
}

export async function createGameNight(startsAt: string, note: string, createdBy: string): Promise<GameNightResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  if (!startsAt) return { ok: false, message: 'Pick a date/time first.' }

  await supabase.auth.getSession()

  const { error } = await supabase.from('cyn_game_nights').insert({ starts_at: new Date(startsAt).toISOString(), note: note.trim() || null, created_by: createdBy })
  if (error) {
    if (error.code === '42501' || error.message.includes('row-level security')) {
      return { ok: false, message: 'Your session expired - sign out and back in with Discord, then try again.' }
    }
    return { ok: false, message: `Couldn't create: ${error.message}` }
  }
  return { ok: true, message: 'Game night posted!' }
}

export async function deleteGameNight(id: number): Promise<GameNightResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_game_nights').delete().eq('id', id)
  if (error) return { ok: false, message: `Couldn't remove: ${error.message}` }
  return { ok: true, message: 'Removed.' }
}

export async function setRsvp(gameNightId: number, openfrontId: string, status: RsvpStatus): Promise<GameNightResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }

  await supabase.auth.getSession()

  const { error } = await supabase
    .from('cyn_game_night_rsvps')
    .upsert({ game_night_id: gameNightId, openfront_id: openfrontId, status, updated_at: new Date().toISOString() }, { onConflict: 'game_night_id,openfront_id' })
  if (error) {
    if (error.code === '42501' || error.message.includes('row-level security')) {
      return { ok: false, message: 'Your session expired - sign out and back in with Discord, then try again.' }
    }
    return { ok: false, message: `Couldn't save: ${error.message}` }
  }
  return { ok: true, message: 'RSVP saved.' }
}
