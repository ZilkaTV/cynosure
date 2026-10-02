import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchReactions, giveReaction, removeReaction, type GameReactions, type GiveReactionResult } from './reactions'
import { useProfile } from './useProfile'
import { useMemberNames } from './useMemberNames'

const CHANNEL = 'cyn-reactions'

export interface ReactionsApi {
  reactions: GameReactions
  /** openfront id of the signed-in member, or null for a visitor (can read, can't react). */
  myId: string | null
  names: Record<string, string>
  give: (gameId: string, memberIds: string[], emoji: string) => Promise<GiveReactionResult>
  remove: (gameId: string, emoji: string) => Promise<GiveReactionResult>
}

/**
 * Reactions for the games currently on screen. Reactions live in the database
 * keyed by game id, so every board (Home, Monthly, History) shows the same
 * ones. They are re-read when the tab regains focus and when another tab of
 * this browser reacts (BroadcastChannel), so a reaction made in another window
 * shows up without a reload.
 */
export function useReactions(gameIds: string[]): ReactionsApi {
  const { profile } = useProfile()
  const names = useMemberNames()
  const [reactions, setReactions] = useState<GameReactions>({ byGame: {} })
  const key = gameIds.join(',')
  const keyRef = useRef(key)
  keyRef.current = key
  const channelRef = useRef<BroadcastChannel | null>(null)

  const load = useCallback(() => {
    const ids = keyRef.current ? keyRef.current.split(',') : []
    if (ids.length === 0) return Promise.resolve()
    return fetchReactions(ids).then((r) => setReactions(r))
  }, [])

  useEffect(() => {
    load()
  }, [key, load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = () => load()
      channelRef.current = channel
    } catch {
      /* BroadcastChannel unavailable - focus refresh still works */
    }
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      channel?.close()
      channelRef.current = null
    }
  }, [load])

  const myId = profile?.openfront_id ?? null
  const give = useCallback(
    async (gameId: string, memberIds: string[], emoji: string) => {
      if (!myId) return { ok: false, message: 'Sign in first.' }
      const result = await giveReaction(gameId, myId, memberIds, emoji)
      if (result.ok) {
        await load()
        channelRef.current?.postMessage('changed')
      }
      return result
    },
    [myId, load],
  )

  const remove = useCallback(
    async (gameId: string, emoji: string) => {
      if (!myId) return { ok: false, message: 'Sign in first.' }
      const result = await removeReaction(gameId, myId, emoji)
      if (result.ok) {
        await load()
        channelRef.current?.postMessage('changed')
      }
      return result
    },
    [myId, load],
  )

  return { reactions, myId, names, give, remove }
}
