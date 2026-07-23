// ── Clan chat ────────────────────────────────────────────────────────────────
// A public, registered-members-only chat - separate from the private AI
// help-chat (see help.ts). Real enforcement (identity, length, 60s cooldown,
// profanity block) lives in a Postgres trigger on cyn_clan_chat_messages
// (see supabase/schema.sql) - everything here is a thin client plus instant
// UX feedback, never the source of truth.

import { supabase } from './supabase'
import type { Profile } from './profiles'

export interface ChatMessage {
  id: number
  author_openfront_id: string
  author_name: string
  content: string
  created_at: string
}

const FETCH_LIMIT = 100

/** Most recent messages, oldest first (ready to render top-to-bottom). */
export async function fetchChatMessages(): Promise<ChatMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_clan_chat_messages')
    .select('id, author_openfront_id, author_name, content, created_at')
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT)
  if (error || !data) return []
  return (data as ChatMessage[]).reverse()
}

export interface PostMessageResult {
  ok: boolean
  kind?: 'rate_limited' | 'blocked_content' | 'invalid_length' | 'generic'
  message: string
}

function classifyError(message: string): PostMessageResult['kind'] {
  if (message.includes('rate_limited')) return 'rate_limited'
  if (message.includes('blocked_content')) return 'blocked_content'
  if (message.includes('invalid_length')) return 'invalid_length'
  return 'generic'
}

export async function postChatMessage(profile: Profile, content: string): Promise<PostMessageResult> {
  if (!supabase) return { ok: false, kind: 'generic', message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_clan_chat_messages').insert({
    author_openfront_id: profile.openfront_id,
    author_name: profile.in_game_name,
    content,
  })
  if (error) return { ok: false, kind: classifyError(error.message), message: error.message }
  return { ok: true, message: 'Sent.' }
}

export async function deleteChatMessage(id: number): Promise<PostMessageResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_clan_chat_messages').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Deleted.' }
}

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

// ── cooldown (client-side UX only - the DB trigger is what actually enforces it) ──

const COOLDOWN_KEY = 'cyn:chatLastSentAt'
const COOLDOWN_MS = 60_000

/** Seconds left before another message can be sent, or 0 if none. */
export function chatCooldownRemaining(): number {
  try {
    const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0)
    const remaining = Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000)
    return Math.max(0, remaining)
  } catch {
    return 0
  }
}

export function markChatSent(): void {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
  } catch {
    /* private-mode/quota - cooldown just won't persist across a reload */
  }
}

// ── profanity filter (instant client feedback only - see cyn_chat_before_insert
// in schema.sql for the actual enforcement; keep these two lists in sync by hand) ──

const CLIENT_BLOCKLIST =
  /nigg(er|a)|faggot|retard|chink|spic|kike|coon|tranny|cunt|hurensohn|schlampe|missgeburt|untermensch|fotze|wichser|arschloch|behindert|salope|connard|encule|batard|negre|bougnoule|pute/

const LEETSPEAK: Record<string, string> = { '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', '7': 't', $: 's', '@': 'a', '!': 'i' }

function normalize(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((c) => LEETSPEAK[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '')
}

export function containsBlockedWord(text: string): boolean {
  return CLIENT_BLOCKLIST.test(normalize(text))
}
