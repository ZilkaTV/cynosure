// ── Kudos ────────────────────────────────────────────────────────────────────
// A one-click "nice game" reaction another member can give on a specific clan
// game (see Home.tsx's Latest Games table). Unique per (game, giver,
// recipient) - the DB's own unique constraint is the real guard against
// double-giving, this module just surfaces that as a friendly result instead
// of a raw Postgres error.

import { supabase } from './supabase'

export interface KudosCounts {
  // to_openfront_id -> total kudos ever received
  totals: Record<string, number>
  // `${gameId}:${toOpenfrontId}` -> who already gave kudos for that game (so the UI can disable the button)
  givenByGame: Record<string, Set<string>>
}

export async function fetchKudos(gameIds: string[]): Promise<KudosCounts> {
  const empty: KudosCounts = { totals: {}, givenByGame: {} }
  if (!supabase || gameIds.length === 0) return empty

  const { data, error } = await supabase.from('cyn_kudos').select('game_id, from_openfront_id, to_openfront_id').in('game_id', gameIds)
  if (error) return empty

  const totals: Record<string, number> = {}
  const givenByGame: Record<string, Set<string>> = {}
  for (const row of (data as { game_id: string; from_openfront_id: string; to_openfront_id: string }[]) ?? []) {
    totals[row.to_openfront_id] = (totals[row.to_openfront_id] ?? 0) + 1
    const key = `${row.game_id}:${row.to_openfront_id}`
    const set = givenByGame[key] ?? (givenByGame[key] = new Set())
    set.add(row.from_openfront_id)
  }
  return { totals, givenByGame }
}

export interface GiveKudosResult {
  ok: boolean
  message: string
}

/** Gives kudos from `fromOpenfrontId` to every id in `toOpenfrontIds` for one game, skipping the giver themselves. */
export async function giveKudos(gameId: string, fromOpenfrontId: string, toOpenfrontIds: string[]): Promise<GiveKudosResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const recipients = [...new Set(toOpenfrontIds)].filter((id) => id !== fromOpenfrontId)
  if (recipients.length === 0) return { ok: false, message: 'Nothing to give kudos for.' }

  // Same expired-session nudge as recordBump/claimQuest - see bumps.ts's own comment.
  await supabase.auth.getSession()

  const { error } = await supabase.from('cyn_kudos').insert(recipients.map((to) => ({ game_id: gameId, from_openfront_id: fromOpenfrontId, to_openfront_id: to })))
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Already given.' }
    if (error.code === '42501' || error.message.includes('row-level security')) {
      return { ok: false, message: 'Your session expired - sign out and back in with Discord, then try again.' }
    }
    return { ok: false, message: `Couldn't save: ${error.message}` }
  }
  return { ok: true, message: 'Kudos given!' }
}
