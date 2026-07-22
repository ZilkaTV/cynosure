// ── Help / feedback chat widget ─────────────────────────────────────────────
// Backs the bottom-right help button (see components/HelpWidget.tsx). Every
// message (and any reply) is stored in cyn_help_conversations/cyn_help_messages
// (see supabase/schema.sql) so the site admin can review real bug reports
// later - the live reply itself comes from api/help-chat.js, which is the
// only thing that talks to Claude.

import { nanoid } from 'nanoid'
import { supabase } from './supabase'

const VISITOR_KEY_STORAGE = 'cyn:helpVisitorKey'
const CONVERSATION_ID_STORAGE = 'cyn:helpConversationId'

/** Stable per-browser id so a returning visitor's conversation can be found again. */
export function getVisitorKey(): string {
  try {
    let key = localStorage.getItem(VISITOR_KEY_STORAGE)
    if (!key) {
      key = nanoid()
      localStorage.setItem(VISITOR_KEY_STORAGE, key)
    }
    return key
  } catch {
    return 'anon'
  }
}

export function getStoredConversationId(): string | null {
  try {
    return localStorage.getItem(CONVERSATION_ID_STORAGE)
  } catch {
    return null
  }
}

function setStoredConversationId(id: string) {
  try {
    localStorage.setItem(CONVERSATION_ID_STORAGE, id)
  } catch {
    /* private-mode/quota - conversation still works, just won't resume next visit */
  }
}

export interface HelpMessage {
  role: 'user' | 'assistant'
  content: string
  image_url: string | null
  created_at: string
}

export async function fetchHelpHistory(conversationId: string): Promise<HelpMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_help_messages')
    .select('role, content, image_url, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data as HelpMessage[]) ?? []
}

async function uploadHelpImage(file: File): Promise<string | null> {
  if (!supabase) return null
  const ext = file.name.split('.').pop() || 'png'
  const path = `${getVisitorKey()}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('help-chat-images').upload(path, file)
  if (error) return null
  const { data } = supabase.storage.from('help-chat-images').getPublicUrl(path)
  return data.publicUrl
}

export interface SendHelpMessageResult {
  ok: boolean
  reply?: string
  conversationId?: string
  message?: string
}

export async function sendHelpMessage(params: {
  message: string
  imageFile?: File | null
  displayName?: string | null
  language: string
}): Promise<SendHelpMessageResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }

  let imageUrl: string | null = null
  if (params.imageFile) {
    imageUrl = await uploadHelpImage(params.imageFile)
    if (!imageUrl) return { ok: false, message: 'Image upload failed - please try again.' }
  }

  try {
    const res = await fetch('/api/help-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: getStoredConversationId(),
        visitorKey: getVisitorKey(),
        displayName: params.displayName ?? null,
        message: params.message,
        imageUrl,
        language: params.language,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return { ok: false, message: body?.message ?? `Request failed (${res.status}).` }
    }
    const data = (await res.json()) as { conversationId: string; reply: string }
    setStoredConversationId(data.conversationId)
    return { ok: true, reply: data.reply, conversationId: data.conversationId }
  } catch (err) {
    return { ok: false, message: String(err) }
  }
}

// ── Admin review (see pages/AdminHelp.tsx) ──────────────────────────────────

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

export async function setHelpConversationStatus(id: string, status: 'open' | 'resolved'): Promise<void> {
  if (!supabase) return
  await supabase.from('cyn_help_conversations').update({ status }).eq('id', id)
}
