// ── Clan chat: moderators, supporters, message counts ───────────────────────
// The chat UI (widget, posting, deleting) was retired; the cyn_clan_chat_messages
// table and its per-member message counts stay for the roster. What is left here
// is the moderator/supporter bookkeeping and the counts the roster reads.

import { supabase } from './supabase'

// ── moderators (mirrors cyn_event_admins in events.ts) ──────────────────────

export async function isChatModerator(discordUsername: string | undefined): Promise<boolean> {
  if (!supabase || !discordUsername) return false
  const { data, error } = await supabase
    .from('cyn_chat_moderators')
    .select('discord_username')
    .eq('discord_username', discordUsername)
    .maybeSingle()
  if (error) return false
  return !!data
}

export async function fetchChatModerators(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('cyn_chat_moderators').select('discord_username').order('discord_username')
  if (error) return []
  return (data as { discord_username: string }[]).map((r) => r.discord_username)
}

export interface ModeratorActionResult {
  ok: boolean
  message: string
}

/** Only succeeds if the caller is already an admin - enforced by the table's own RLS policy, not just this check. */
export async function addChatModerator(discordUsername: string): Promise<ModeratorActionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const trimmed = discordUsername.trim()
  if (!trimmed) return { ok: false, message: 'Enter a Discord username first.' }
  const { error } = await supabase.from('cyn_chat_moderators').insert({ discord_username: trimmed })
  if (error) return { ok: false, message: error.code === '23505' ? 'Already a moderator.' : `Couldn't add: ${error.message}` }
  return { ok: true, message: `${trimmed} is now a moderator.` }
}

export async function removeChatModerator(discordUsername: string): Promise<ModeratorActionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_chat_moderators').delete().eq('discord_username', discordUsername)
  if (error) return { ok: false, message: `Couldn't remove: ${error.message}` }
  return { ok: true, message: `${discordUsername} removed.` }
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
