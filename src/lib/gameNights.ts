// ── Game nights (casual RSVP) ───────────────────────────────────────────────
// Lightweight "who's in tonight" coordination, distinct from the formal
// tournament/scrim system in events.ts (cyn_event_teams/cyn_event_submissions
// - admin-reviewed, point-scoring). Any signed-in member can propose one and
// RSVP going/maybe/not_going - matches the common guild/clan-platform RSVP
// pattern this site didn't have before.

import { useCallback, useEffect, useState } from 'react'
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

// ── shared store ────────────────────────────────────────────────────────────
// The sidebar card, the Metrics card and the tab-title reminder all show the
// same game nights; one cached copy, refreshed on focus, every few minutes and
// when another tab of this browser changes something (BroadcastChannel).

const CHANNEL = 'cyn-gamenights'
const REFRESH_MS = 5 * 60 * 1000
let cache: GameNightWithRsvps[] | null = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null

function ensureChannel() {
  if (channel) return
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = () => {
      refreshGameNights()
    }
  } catch {
    /* BroadcastChannel unavailable - focus/interval refresh still works */
  }
}

/** Re-reads the game nights; pass true after changing one so other tabs of this browser refresh too. */
export function refreshGameNights(broadcast = false): Promise<void> {
  if (!inflight) {
    inflight = fetchGameNights()
      .then((data) => {
        cache = data
        listeners.forEach((l) => l())
      })
      .catch(() => {})
      .finally(() => {
        inflight = null
      })
  }
  if (broadcast) {
    ensureChannel()
    channel?.postMessage('changed')
  }
  return inflight
}

export function useGameNights(enabled = true): { nights: GameNightWithRsvps[] | null; refresh: () => Promise<void> } {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    ensureChannel()
    refreshGameNights()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshGameNights()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onVisible, REFRESH_MS)
    return () => {
      listeners.delete(l)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [enabled])
  const refresh = useCallback(() => refreshGameNights(true), [])
  return { nights: enabled ? cache : null, refresh }
}

/** Upcoming game nights the given member hasn't answered yet. */
export function unansweredGameNights(nights: GameNightWithRsvps[] | null, openfrontId: string | null | undefined): GameNightWithRsvps[] {
  if (!nights || !openfrontId) return []
  const now = Date.now()
  return nights.filter((n) => new Date(n.startsAt).getTime() > now && !n.rsvps[openfrontId])
}
