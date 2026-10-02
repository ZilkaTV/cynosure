// ── Game reactions ───────────────────────────────────────────────────────────
// A one-click emoji reaction another member can leave on a specific clan game
// (see Home.tsx's Latest Games table). A giver can leave each emoji once per
// game; the DB's unique constraint (game, giver, recipient, emoji) is the real
// guard, this module surfaces a duplicate as a friendly result instead of a raw
// Postgres error. Stored in cyn_kudos (table name kept from the first version
// of this feature).

import { supabase } from './supabase'

// Keep in sync with the check constraint on cyn_kudos.emoji in schema.sql.
// The heart is written with escapes so its U+FE0F variation selector can't get lost in an editor.
export const REACTION_EMOJIS = ['👍', '❤️', '🔥', '👏', '🎉', '💪', '😂'] as const

// What the one-click heart button on a game without reactions leaves (same code points as in REACTION_EMOJIS).
export const DEFAULT_REACTION = '\u2764\uFE0F'

export interface GameReactions {
  // gameId -> emoji -> openfront ids of everyone who left that emoji on the game
  byGame: Record<string, Record<string, Set<string>>>
}

export async function fetchReactions(gameIds: string[]): Promise<GameReactions> {
  const empty: GameReactions = { byGame: {} }
  if (!supabase || gameIds.length === 0) return empty

  const { data, error } = await supabase.from('cyn_kudos').select('game_id, from_openfront_id, emoji').in('game_id', gameIds)
  if (error) return empty

  const byGame: GameReactions['byGame'] = {}
  for (const row of (data as { game_id: string; from_openfront_id: string; emoji: string }[]) ?? []) {
    const perEmoji = byGame[row.game_id] ?? (byGame[row.game_id] = {})
    const givers = perEmoji[row.emoji] ?? (perEmoji[row.emoji] = new Set())
    givers.add(row.from_openfront_id)
  }
  return { byGame }
}

export interface GiveReactionResult {
  ok: boolean
  message: string
}

/** Takes back the signed-in member's own `emoji` on a game (all recipient rows of that reaction). */
export async function removeReaction(gameId: string, fromOpenfrontId: string, emoji: string): Promise<GiveReactionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  await supabase.auth.getSession()
  const { error } = await supabase.from('cyn_kudos').delete().eq('game_id', gameId).eq('from_openfront_id', fromOpenfrontId).eq('emoji', emoji)
  if (error) return { ok: false, message: `Couldn't remove: ${error.message}` }
  return { ok: true, message: 'Reaction removed.' }
}

/** Leaves `emoji` from `fromOpenfrontId` on every clan member in one game, skipping the giver themselves. */
export async function giveReaction(gameId: string, fromOpenfrontId: string, toOpenfrontIds: string[], emoji: string): Promise<GiveReactionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return { ok: false, message: 'Unknown reaction.' }
  const recipients = [...new Set(toOpenfrontIds)].filter((id) => id !== fromOpenfrontId)
  if (recipients.length === 0) return { ok: false, message: 'Nothing to react to.' }

  // Same expired-session nudge as recordBump/claimQuest - see bumps.ts's own comment.
  await supabase.auth.getSession()

  const { error } = await supabase
    .from('cyn_kudos')
    .insert(recipients.map((to) => ({ game_id: gameId, from_openfront_id: fromOpenfrontId, to_openfront_id: to, emoji })))
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Already given.' }
    if (error.code === '42501' || error.message.includes('row-level security')) {
      return { ok: false, message: 'Your session expired - sign out and back in with Discord, then try again.' }
    }
    return { ok: false, message: `Couldn't save: ${error.message}` }
  }
  return { ok: true, message: 'Reaction added!' }
}

/**
 * How many reactions each game has received (distinct giver + emoji pairs, so a
 * reaction left on a multi-member game counts once, not once per recipient).
 * Reads the whole reactions table in pages - it is small - for the History
 * "Reactions" tab, which lists the most reacted games first.
 */
export async function fetchReactionTotals(): Promise<Record<string, number>> {
  if (!supabase) return {}
  const PAGE = 1000
  const seen = new Set<string>()
  const totals: Record<string, number> = {}
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from('cyn_kudos')
      .select('game_id, from_openfront_id, emoji')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data) break
    for (const row of data as { game_id: string; from_openfront_id: string; emoji: string }[]) {
      const key = `${row.game_id}|${row.from_openfront_id}|${row.emoji}`
      if (seen.has(key)) continue
      seen.add(key)
      totals[row.game_id] = (totals[row.game_id] ?? 0) + 1
    }
    if (data.length < PAGE) break
  }
  return totals
}

/** Did this member leave a reaction on any game today (UTC day, like the daily quest reset)? */
export async function fetchReactedToday(openfrontId: string): Promise<boolean> {
  if (!supabase) return false
  const startOfDay = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
  const { data, error } = await supabase.from('cyn_kudos').select('id').eq('from_openfront_id', openfrontId).gte('created_at', startOfDay).limit(1)
  return !error && (data?.length ?? 0) > 0
}
