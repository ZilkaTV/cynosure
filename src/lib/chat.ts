// ── Clan chat leftovers: supporters, boosters, message counts ───────────────────────
// The chat UI (widget, posting, deleting) was retired; the cyn_clan_chat_messages
// table and its per-member message counts stay for the roster. What is left here
// is the supporter bookkeeping and the counts the roster reads.

import { supabase } from './supabase'

export interface ModeratorActionResult {
  ok: boolean
  message: string
}

// ── supporters (donor badge, admin-toggled - see cyn_supporters in schema.sql) ──

export async function isSupporter(openfrontId: string | undefined): Promise<boolean> {
  if (!supabase || !openfrontId) return false
  const { data, error } = await supabase.from('cyn_supporters').select('openfront_id').eq('openfront_id', openfrontId).maybeSingle()
  if (error) return false
  return !!data
}

/** Every supporter's openfront_id at once - for buildRoster's up-front pass (the Supporter badge). */
export async function fetchAllSupporters(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('cyn_supporters').select('openfront_id')
  if (error || !data) return []
  return (data as { openfront_id: string }[]).map((r) => r.openfront_id)
}

/**
 * Members who boost the Discord server (mirrored by scripts/discord-role-sync.mjs from Discord's own boost flag into
 * cyn_boosters, see worker/d1/boosters.sql) - they keep access without the 7-day rule. No table yet = nobody.
 */
export async function fetchBoosters(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('cyn_boosters').select('openfront_id')
  if (error || !data) return []
  return (data as { openfront_id: string }[]).map((r) => r.openfront_id)
}

/** Boosts per boosting member (3 boosts = 3): the Factor Wheel gives +3 per boost. A table without the count column counts every booster once. */
export async function fetchBoostCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!supabase) return out
  const { data, error } = await supabase.from('cyn_boosters').select('openfront_id, boosts')
  if (error || !data) {
    for (const id of await fetchBoosters()) out.set(id, 1)
    return out
  }
  for (const r of data as { openfront_id: string; boosts: number | null }[]) out.set(r.openfront_id, Math.max(1, r.boosts ?? 1))
  return out
}

/** Every member's chat message count at once - for buildRoster's up-front pass (the Chatter badge). */
export async function fetchAllChatMessageCounts(): Promise<Record<string, number>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_chat_message_counts').select('openfront_id, count')
  if (error || !data) return {}
  const result: Record<string, number> = {}
  for (const row of data as { openfront_id: string; count: number }[]) result[row.openfront_id] = row.count
  return result
}

export async function addSupporter(openfrontId: string): Promise<ModeratorActionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_supporters').insert({ openfront_id: openfrontId })
  if (error) return { ok: false, message: error.code === '23505' ? 'Already a supporter.' : `Couldn't add: ${error.message}` }
  return { ok: true, message: 'Marked as supporter.' }
}

export async function removeSupporter(openfrontId: string): Promise<ModeratorActionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_supporters').delete().eq('openfront_id', openfrontId)
  if (error) return { ok: false, message: `Couldn't remove: ${error.message}` }
  return { ok: true, message: 'Supporter removed.' }
}
