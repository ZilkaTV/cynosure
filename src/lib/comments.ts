import { useCallback, useEffect, useState } from 'react'
import { supabase as db } from './supabase'

// Comments under a game's post-game report, replies to comments (parent_id) and emoji reactions on comments. Rows live in
// cyn_game_comments / cyn_comment_reactions (worker/d1/004-game-comments.sql); the access rules are in worker/dbApi.js.

export interface GameComment {
  id: number
  game_id: string
  parent_id: number | null
  author_openfront_id: string
  author_name: string | null
  body: string
  created_at: string
}

/** commentId -> emoji -> openfront ids that left it */
export type CommentReactions = Record<number, Record<string, Set<string>>>

const CHANGED = 'cyn:comments-changed'
const notify = () => window.dispatchEvent(new Event(CHANGED))

export async function fetchComments(gameId: string): Promise<GameComment[]> {
  const { data, error } = await db
    .from('cyn_game_comments')
    .select('id, game_id, parent_id, author_openfront_id, author_name, body, created_at')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data as GameComment[]) ?? []
}

export async function fetchCommentReactions(commentIds: number[]): Promise<CommentReactions> {
  const out: CommentReactions = {}
  // the data API takes at most 90 values per "in" filter
  for (let i = 0; i < commentIds.length; i += 90) {
    const { data, error } = await db.from('cyn_comment_reactions').select('comment_id, openfront_id, emoji').in('comment_id', commentIds.slice(i, i + 90))
    if (error || !data) continue
    for (const row of data as { comment_id: number; openfront_id: string; emoji: string }[]) {
      const perEmoji = out[row.comment_id] ?? (out[row.comment_id] = {})
      ;(perEmoji[row.emoji] ?? (perEmoji[row.emoji] = new Set())).add(row.openfront_id)
    }
  }
  return out
}

export interface CommentResult {
  ok: boolean
  message: string
}

function failure(error: { code?: string; message: string }): CommentResult {
  if (error.code === '42501') return { ok: false, message: 'Your session expired - sign out and back in with Discord, then try again.' }
  const m = /^[a-z_]+: (.*)$/.exec(error.message)
  return { ok: false, message: m ? m[1] : error.message }
}

export async function postComment(gameId: string, authorId: string, authorName: string, body: string, parentId: number | null): Promise<CommentResult> {
  const { error } = await db.from('cyn_game_comments').insert({ game_id: gameId, parent_id: parentId, author_openfront_id: authorId, author_name: authorName, body })
  if (error) return failure(error)
  notify()
  return { ok: true, message: 'Posted.' }
}

export async function deleteComment(commentId: number): Promise<CommentResult> {
  const { error } = await db.from('cyn_game_comments').delete().eq('id', commentId)
  if (error) return failure(error)
  notify()
  return { ok: true, message: 'Deleted.' }
}

export async function toggleCommentReaction(commentId: number, openfrontId: string, emoji: string, has: boolean): Promise<CommentResult> {
  const { error } = has
    ? await db.from('cyn_comment_reactions').delete().eq('comment_id', commentId).eq('openfront_id', openfrontId).eq('emoji', emoji)
    : await db.from('cyn_comment_reactions').insert({ comment_id: commentId, openfront_id: openfrontId, emoji })
  if (error && error.code !== '23505') return failure(error)
  notify()
  return { ok: true, message: 'Saved.' }
}

/** One game's comments and their reactions, kept in step across the page (the actions row and the report). */
export function useGameComments(gameId: string | null) {
  const [comments, setComments] = useState<GameComment[]>([])
  const [reactions, setReactions] = useState<CommentReactions>({})
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!gameId) return
    const list = await fetchComments(gameId)
    setComments(list)
    setReactions(list.length ? await fetchCommentReactions(list.map((c) => c.id)) : {})
    setLoaded(true)
  }, [gameId])

  useEffect(() => {
    setComments([])
    setReactions({})
    setLoaded(false)
    void reload()
    window.addEventListener(CHANGED, reload)
    return () => window.removeEventListener(CHANGED, reload)
  }, [reload])

  return { comments, reactions, loaded, reload }
}

// ── comment counts for the games on screen (the speech-bubble badge under a game) ──

let counts: Record<string, number> | null = null
let loading: Promise<void> | null = null

async function loadCounts() {
  const { data, error } = await db.from('cyn_game_comments').select('game_id').limit(5000)
  if (error || !data) return
  const next: Record<string, number> = {}
  for (const row of data as { game_id: string }[]) next[row.game_id] = (next[row.game_id] ?? 0) + 1
  counts = next
}

/** How many comments each game has (one small query, shared by every row on the page, refreshed when somebody comments). */
export function useCommentCounts(): Record<string, number> {
  const [value, setValue] = useState<Record<string, number>>(counts ?? {})
  useEffect(() => {
    let alive = true
    const refresh = () => {
      loading = loadCounts().finally(() => (loading = null))
      void loading.then(() => alive && counts && setValue(counts))
    }
    if (!counts) {
      if (loading) void loading.then(() => alive && counts && setValue(counts))
      else refresh()
    }
    window.addEventListener(CHANGED, refresh)
    return () => {
      alive = false
      window.removeEventListener(CHANGED, refresh)
    }
  }, [])
  return value
}
