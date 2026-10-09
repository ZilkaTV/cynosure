import { useCallback, useEffect, useState } from 'react'
import { supabase as db } from './supabase'

// Games a member saved from the post-game report as a reminder. They live in the data store (table cyn_saved_games), one
// row per member and game, so they follow the member to every device; "my profile" lists them.

export interface SavedGame {
  game_id: string
  title: string | null
  saved_at: string
}

const CHANGED = 'cyn:saved-games-changed'

export async function fetchSavedGames(openfrontId: string): Promise<SavedGame[]> {
  const { data, error } = await db
    .from('cyn_saved_games')
    .select('game_id, title, saved_at')
    .eq('openfront_id', openfrontId)
    .order('saved_at', { ascending: false })
  if (error) return []
  return (data as SavedGame[]) ?? []
}

export async function saveGame(openfrontId: string, gameId: string, title: string): Promise<boolean> {
  const { error } = await db
    .from('cyn_saved_games')
    .upsert({ openfront_id: openfrontId, game_id: gameId, title: title.slice(0, 120), saved_at: new Date().toISOString() }, { onConflict: 'openfront_id,game_id' })
  window.dispatchEvent(new Event(CHANGED))
  return !error
}

export async function unsaveGame(openfrontId: string, gameId: string): Promise<boolean> {
  const { error } = await db.from('cyn_saved_games').delete().eq('openfront_id', openfrontId).eq('game_id', gameId)
  window.dispatchEvent(new Event(CHANGED))
  return !error
}

/** The member's saved games, kept in step across the page (modal button and profile list). */
export function useSavedGames(openfrontId: string | undefined) {
  const [games, setGames] = useState<SavedGame[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!openfrontId) {
      setGames([])
      return
    }
    setGames(await fetchSavedGames(openfrontId))
    setLoaded(true)
  }, [openfrontId])

  useEffect(() => {
    void reload()
    window.addEventListener(CHANGED, reload)
    return () => window.removeEventListener(CHANGED, reload)
  }, [reload])

  return { games, loaded, reload }
}
