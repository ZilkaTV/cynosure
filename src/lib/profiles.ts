// ── Member profiles / registration ──────────────────────────────────────────
// A "profile" is what a member submits when they register: in-game name,
// timezone and OpenFront public id. It gates access to the stats and adds
// names/timezones (and non-ranked members) to the roster.
//
// Two storage backends, chosen automatically:
//   • Supabase configured  → profiles are shared across all visitors (real).
//   • Not configured       → the current visitor's profile lives in
//                            localStorage so the site is fully usable today.

import { supabase, hasBackend } from './supabase'

export interface Profile {
  openfront_id: string
  in_game_name: string
  timezone: string
  discord_username?: string
}

const LOCAL_KEY = 'cyn:profile'

export function getLocalProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

export function saveLocalProfile(p: Profile) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(p))
}

export function clearLocalProfile() {
  localStorage.removeItem(LOCAL_KEY)
}

/** Persist a registration. Uses Supabase when available, else localStorage. */
export async function saveProfile(p: Profile): Promise<void> {
  saveLocalProfile(p)
  if (supabase) {
    const { error } = await supabase.from('cyn_members').upsert(
      {
        openfront_id: p.openfront_id,
        in_game_name: p.in_game_name,
        timezone: p.timezone,
        discord_username: p.discord_username ?? null,
      },
      { onConflict: 'openfront_id' },
    )
    if (error) throw error
  }
}

/** The full registered roster (for name/timezone enrichment). */
export async function fetchRegistered(): Promise<Profile[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('cyn_members')
      .select('openfront_id, in_game_name, timezone, discord_username')
    if (error) throw error
    return (data as Profile[]) ?? []
  }
  const local = getLocalProfile()
  return local ? [local] : []
}

export { hasBackend }
