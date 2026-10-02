// ── Help / feedback chat: read-only archive ────────────────────────────────
// The visitor widget and /api/help-chat were retired (the endpoint now answers
// 410). What stays is the admin archive of past conversations, read by
// pages/AdminHelp.tsx from cyn_help_conversations / cyn_help_messages.

import { supabase } from './supabase'

export interface HelpMessage {
  role: 'user' | 'assistant'
  content: string
  image_url: string | null
  created_at: string
}


// ── Admin review (see pages/AdminHelp.tsx) ──────────────────────────────────
// These read/write cyn_help_conversations/cyn_help_messages directly with
// the anon key - safe only because supabase/schema.sql now gates both
// tables' select (and this table's update) on a real auth.uid() check
// against cyn_event_admins, the same pattern cyn_event_submissions already
// uses. A non-admin session gets zero rows back, not just a hidden button.

export interface HelpConversation {
  id: string
  visitor_key: string
  display_name: string | null
  status: 'open' | 'resolved'
  created_at: string
  updated_at: string
}

export async function fetchAllHelpConversations(): Promise<HelpConversation[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_help_conversations')
    .select('id, visitor_key, display_name, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) return []
  return (data as HelpConversation[]) ?? []
}

export async function fetchAdminHelpMessages(conversationId: string): Promise<HelpMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_help_messages')
    .select('role, content, image_url, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data as HelpMessage[]) ?? []
}

export async function setHelpConversationStatus(id: string, status: 'open' | 'resolved'): Promise<void> {
  if (!supabase) return
  await supabase.from('cyn_help_conversations').update({ status }).eq('id', id)
}
