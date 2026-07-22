// Vercel serverless function backing the bottom-right help/feedback chat
// widget (src/components/HelpWidget.tsx). A visitor's message (plus optional
// image, already uploaded to Supabase Storage client-side) is stored, sent
// to Claude for a live reply, and the reply is stored too - so every
// conversation is both answered in real time AND kept in
// cyn_help_conversations/cyn_help_messages for the site admin to review in
// a real coding session later. This function only ever reads/writes
// Supabase and calls the Claude API - it has no access to this repo and
// cannot make or deploy code changes itself (no tools are declared on the
// Claude call, so there is nothing a message could "trigger" beyond text).
//
// Uses the Supabase SERVICE ROLE key, not the anon key - these two tables
// have no public RLS policy at all (see supabase/schema.sql), since a
// conversation can contain whatever a visitor typed, including a screenshot.
// This function is the only thing allowed to read or write them (besides
// the admin review page, which goes through its own auth.uid()-gated RLS
// policy instead). Because RLS is bypassed here, ownership has to be
// enforced in code: a client-supplied conversationId is only ever trusted
// after confirming its stored visitor_key matches the caller's own -
// otherwise nothing would stop one visitor from passing another visitor's
// (guessed or leaked) conversation id and reading their history or
// appending to their thread.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY_MESSAGES = 40 // bounds the Claude call on a very long-running thread

const SYSTEM_PROMPT = `You are the support assistant for Cynosure, the [CYN] clan's OpenFront.io stats website. You appear in a small help-chat widget on every page.

What the site does:
- Overview: clan-wide member stats (FFA/Team/1v1 wins, elo, badges) pulled from OpenFront's public API.
- Monthly FFA / Monthly Team / Monthly 1v1: this month's leaderboards and point totals.
- Speedrun: a leaderboard for the fastest solo win on the Australia map with Nations disabled (bots allowed). Submitting a run needs a valid game link/id.
- Events: the current clan event (e.g. CYN Trio Challenge), with team standings and a submission form (game link + screenshot).
- Quests: daily quests that award XP toward a level (1-99). Quests reset daily and can only be claimed once per member per day.
- Member profiles: a member's career stats, badges, and their most recent games with a stats overview.

Important known behavior (these are NOT bugs, explain them if asked):
- Only games played under the [CYN] clan tag count towards stats - a game played with no tag or a different tag is correctly excluded.
- Data comes from OpenFront's own API and a shared cache refreshed every few minutes - a "Refresh" button is available on pages that show live data; a very recently finished game can take a little while to appear (OpenFront itself doesn't finalize/list a game until every player has left).
- "Max Tiles" in a game report is computed by replaying the game locally/in a shared cache and can take a few seconds to appear the first time anyone looks at that specific game.
- Quests must be claimed - if a quest doesn't show as claimable, the member likely needs to press Refresh first, or the underlying condition (e.g. games needed) genuinely isn't met yet.

Your job:
- Help visitors directly when the answer is one of the known behaviors above, or something you can reason out from the site's design.
- If a screenshot is attached, look at it and use it to help diagnose the issue.
- If something is genuinely broken (a real bug) or the visitor is requesting a new feature, say clearly that you've logged it and the site's developer will look into it - you cannot fix code or deploy changes yourself, so never claim you will, are, or did.
- Ask a clarifying question if you don't have enough detail to help (e.g. which member, which game, what they expected vs what they saw).
- Be friendly, concise, and avoid jargon. Do not use em-dashes - use regular hyphens or commas instead.`

/** Looks up a conversation's stored visitor_key and confirms it matches the caller's. */
async function ownsConversation(supabase, conversationId, visitorKey) {
  const { data, error } = await supabase
    .from('cyn_help_conversations')
    .select('visitor_key')
    .eq('id', conversationId)
    .maybeSingle()
  if (error || !data) return false
  return data.visitor_key === visitorKey
}

async function handleHistory(req, res, supabase) {
  const { conversationId, visitorKey } = req.body || {}
  if (typeof conversationId !== 'string' || typeof visitorKey !== 'string' || !conversationId || !visitorKey) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }
  if (!(await ownsConversation(supabase, conversationId, visitorKey))) {
    // Same response whether the id doesn't exist or belongs to someone else -
    // doesn't matter which for a visitor's own reload path, and avoids
    // confirming/denying that a given id exists to someone probing for one.
    res.status(200).json({ messages: [] })
    return
  }
  const { data, error } = await supabase
    .from('cyn_help_messages')
    .select('role, content, image_url, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) {
    res.status(500).json({ error: 'history_failed', message: error.message })
    return
  }
  res.status(200).json({ messages: data ?? [] })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'supabase_not_configured' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  if (req.body?.action === 'history') {
    await handleHistory(req, res, supabase)
    return
  }

  if (!anthropicKey) {
    res.status(500).json({ error: 'anthropic_not_configured' })
    return
  }

  const { conversationId, visitorKey, displayName, message, imageUrl, language } = req.body || {}
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text && !imageUrl) {
    res.status(400).json({ error: 'empty_message' })
    return
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: 'message_too_long' })
    return
  }
  if (typeof visitorKey !== 'string' || !visitorKey) {
    res.status(400).json({ error: 'missing_visitor_key' })
    return
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey })

  try {
    // A client-supplied conversationId is only reused after confirming it's
    // actually this visitor's own - otherwise it's silently treated as
    // absent and a fresh conversation is started, rather than letting
    // someone else's (guessed or leaked) id be read from or written into.
    let convId = conversationId && (await ownsConversation(supabase, conversationId, visitorKey)) ? conversationId : null

    if (!convId) {
      const { data, error } = await supabase
        .from('cyn_help_conversations')
        .insert({ visitor_key: visitorKey, display_name: displayName || null })
        .select('id')
        .single()
      if (error) throw error
      convId = data.id
    } else {
      await supabase
        .from('cyn_help_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)
    }

    const { error: insertUserError } = await supabase.from('cyn_help_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: text || '(image attached, no text)',
      image_url: imageUrl || null,
    })
    if (insertUserError) throw insertUserError

    const { data: historyRows, error: historyError } = await supabase
      .from('cyn_help_messages')
      .select('role, content, image_url, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)
    if (historyError) throw historyError

    const anthropicMessages = (historyRows ?? []).map((row) => {
      if (row.image_url) {
        return {
          role: row.role,
          content: [
            { type: 'image', source: { type: 'url', url: row.image_url } },
            { type: 'text', text: row.content },
          ],
        }
      }
      return { role: row.role, content: row.content }
    })

    const languageName = { en: 'English', de: 'German', fr: 'French' }[language] ?? 'English'

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: `${SYSTEM_PROMPT}\n\nRespond in ${languageName} - that is this visitor's site language.`,
      messages: anthropicMessages,
    })

    const reply =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim() || "Sorry, I couldn't come up with a reply there - please try again."

    await supabase.from('cyn_help_messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: reply,
    })

    res.status(200).json({ conversationId: convId, reply })
  } catch (err) {
    console.error('help-chat failed:', err)
    res.status(500).json({ error: 'help_chat_failed', message: String(err) })
  }
}
