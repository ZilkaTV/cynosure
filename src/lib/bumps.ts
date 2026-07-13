// ── Bump tracking ────────────────────────────────────────────────────────────
// There's no bot/API access to the bump channel (it's not our server, and a
// selfbot to read it would break Discord's ToS), so this is self-reported:
// a member clicks "I just bumped" and it's logged with a cooldown matching
// Disboard's real 2-hour bump interval, so it can't be spammed.

import { supabase } from './supabase'

export const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000 // 2 hours, matches Disboard's cooldown

export interface BumpEntry {
  openfront_id: string
  bump_count: number
  last_bump_at: string | null
}

export async function fetchBumps(): Promise<Record<string, BumpEntry>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_bumps').select('openfront_id, bump_count, last_bump_at')
  if (error) return {}
  const map: Record<string, BumpEntry> = {}
  for (const r of (data as BumpEntry[]) ?? []) map[r.openfront_id] = r
  return map
}

export interface BumpResult {
  ok: boolean
  message: string
}

export async function recordBump(openfrontId: string): Promise<BumpResult> {
  if (!supabase) return { ok: false, message: 'Connect the backend to track bumps.' }

  const { data: existing } = await supabase
    .from('cyn_bumps')
    .select('bump_count, last_bump_at')
    .eq('openfront_id', openfrontId)
    .maybeSingle()

  const row = existing as { bump_count: number; last_bump_at: string | null } | null
  if (row?.last_bump_at) {
    const elapsed = Date.now() - new Date(row.last_bump_at).getTime()
    if (elapsed < BUMP_COOLDOWN_MS) {
      const mins = Math.ceil((BUMP_COOLDOWN_MS - elapsed) / 60_000)
      return { ok: false, message: `Too soon - wait ${mins} more minute${mins === 1 ? '' : 's'}.` }
    }
  }

  const { error } = await supabase.from('cyn_bumps').upsert(
    {
      openfront_id: openfrontId,
      bump_count: (row?.bump_count ?? 0) + 1,
      last_bump_at: new Date().toISOString(),
    },
    { onConflict: 'openfront_id' },
  )
  if (error) return { ok: false, message: `Couldn't save: ${error.message}` }

  return { ok: true, message: 'Thanks for bumping! 🔔' }
}
