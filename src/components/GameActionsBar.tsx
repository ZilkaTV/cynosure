import { useCallback, useRef, useState } from 'react'
import { Emoji } from './Emoji'
import { DEFAULT_REACTION, REACTION_EMOJIS } from '../lib/reactions'
import { saveGame, unsaveGame, useSavedGames } from '../lib/savedGames'
import { useCommentCounts } from '../lib/comments'
import { useReactions, type ReactionsApi } from '../lib/useReactions'
import { useProfile } from '../lib/useProfile'
import { useLanguage } from '../i18n/LanguageContext'

export interface GameActions {
  reactions: ReactionsApi
  saved: ReturnType<typeof useSavedGames>
  commentCounts: Record<string, number>
  myId: string | null
}

/** Everything the actions row under a game needs, loaded once per page for the games on screen. */
export function useGameActions(gameIds: string[]): GameActions {
  const { profile } = useProfile()
  const reactions = useReactions(gameIds)
  const saved = useSavedGames(profile?.openfront_id)
  const commentCounts = useCommentCounts()
  return { reactions, saved, commentCounts, myId: profile?.openfront_id ?? null }
}

const icon = 'h-[18px] w-[18px]'
const btn = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-base-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Which game's report is open, and whether it was opened from a comment button (then it scrolls to the comments).
 * A shared link (?game=ID) opens its report straight away.
 */
export function useOpenReport() {
  const [state, setState] = useState<{ id: string | null; comments: boolean }>(() => {
    const id = new URLSearchParams(window.location.search).get('game')
    return { id: id && /^[A-Za-z0-9_-]{4,40}$/.test(id) ? id : null, comments: false }
  })
  const close = useCallback(() => {
    setState({ id: null, comments: false })
    if (window.location.search.includes('game=')) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  return {
    openGame: state.id,
    focusComments: state.comments,
    open: (id: string) => setState({ id, comments: false }),
    openComments: (id: string) => setState({ id, comments: true }),
    close,
  }
}

/** The link a share button hands out: the game's report opens straight away on the History page. */
export function gameShareUrl(gameId: string): string {
  return `${window.location.origin}/history?game=${encodeURIComponent(gameId)}`
}

/**
 * The social strip under a game, like under a post: a like button (hold or hover for the other reactions), a comment
 * button that opens the report at its comments, save and share. The reactions already left show as chips on the right.
 */
export function GameActionsBar({
  gameId,
  memberIds,
  title,
  actions,
  onOpenComments,
}: {
  gameId: string
  memberIds: string[]
  title: string
  actions: GameActions
  onOpenComments: (gameId: string) => void
}) {
  const { t } = useLanguage()
  const { profile } = useProfile()
  const { reactions, saved, commentCounts, myId } = actions
  const { give, remove, names } = reactions
  const perEmoji = reactions.reactions.byGame[gameId] ?? {}
  const mine = myId ? REACTION_EMOJIS.filter((e) => perEmoji[e]?.has(myId)) : []
  const canReact = !!myId && memberIds.some((id) => id !== myId)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const holdTimer = useRef<number | undefined>(undefined)
  const isSaved = saved.games.some((g) => g.game_id === gameId)
  const comments = commentCounts[gameId] ?? 0

  const toggle = async (emoji: string) => {
    if (!myId) return
    setBusy(true)
    if (perEmoji[emoji]?.has(myId)) await remove(gameId, emoji)
    else await give(gameId, memberIds, emoji)
    setBusy(false)
    setPicking(false)
  }

  // A tap on the like button likes (or takes back the like); hovering or holding it offers the other reactions.
  const onLike = async () => {
    if (!myId || busy) return
    if (mine.length > 0) {
      setBusy(true)
      for (const e of mine) await remove(gameId, e)
      setBusy(false)
    } else await toggle(DEFAULT_REACTION)
  }

  const share = async () => {
    const url = gameShareUrl(gameId)
    try {
      if (navigator.share) await navigator.share({ title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* share sheet dismissed or clipboard blocked */
    }
  }

  const chips = REACTION_EMOJIS.filter((e) => perEmoji[e]?.size)

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1" onClick={(e) => e.stopPropagation()}>
      <div
        className="relative"
        onMouseEnter={() => canReact && setPicking(true)}
        onMouseLeave={() => setPicking(false)}
        onTouchStart={() => {
          if (canReact) holdTimer.current = window.setTimeout(() => setPicking(true), 450)
        }}
        onTouchEnd={() => window.clearTimeout(holdTimer.current)}
      >
        {picking && canReact && (
          <div className="absolute bottom-full left-0 z-20 flex gap-0.5 rounded-full border border-base-600 bg-base-850 p-1 shadow-xl">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={busy}
                onClick={() => toggle(emoji)}
                aria-label={emoji}
                className={`rounded-full p-1.5 transition-transform hover:scale-125 disabled:opacity-40 ${perEmoji[emoji]?.has(myId!) ? 'bg-accent/25' : ''}`}
              >
                <Emoji char={emoji} className="h-6 w-6" />
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onLike}
          disabled={!canReact || busy}
          title={canReact ? t.home.reactionButton : undefined}
          className={`${btn} ${mine.length > 0 ? 'text-accent-light' : ''}`}
        >
          {mine.length > 0 ? <Emoji char={mine[0]} className={icon} /> : (
            <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-6.7-4.35-9.3-8.1C.9 10.2 1.4 6.6 4.3 5 6.4 3.8 9 4.3 12 7c3-2.7 5.6-3.2 7.7-2 2.9 1.6 3.4 5.2 1.6 7.9C18.7 16.65 12 21 12 21Z" />
            </svg>
          )}
          <span className="hidden sm:inline">{t.gameActions.like}</span>
        </button>
      </div>

      <button type="button" onClick={() => onOpenComments(gameId)} className={btn} title={t.gameActions.comment}>
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12Z" />
        </svg>
        <span className="tabular-nums">{comments > 0 ? comments : <span className="hidden sm:inline">{t.gameActions.comment}</span>}</span>
      </button>

      {profile && (
        <button
          type="button"
          onClick={() => void (isSaved ? unsaveGame(profile.openfront_id, gameId) : saveGame(profile.openfront_id, gameId, title))}
          className={`${btn} ${isSaved ? 'text-gold-light' : ''}`}
          title={isSaved ? t.gameDetail.unsaveHint : t.gameDetail.saveHint}
          aria-pressed={isSaved}
        >
          <svg viewBox="0 0 24 24" className={icon} fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
          </svg>
          <span className="hidden sm:inline">{isSaved ? t.gameDetail.saved : t.gameDetail.save}</span>
        </button>
      )}

      <button type="button" onClick={share} className={btn} title={t.gameActions.shareHint}>
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
        <span className="hidden sm:inline">{copied ? t.gameActions.copied : t.gameActions.share}</span>
      </button>

      {chips.length > 0 && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {chips.map((emoji) => {
            const who = [...perEmoji[emoji]].map((id) => names[id] ?? id).sort((a, b) => a.localeCompare(b))
            const own = !!myId && perEmoji[emoji].has(myId)
            return (
              <button
                key={emoji}
                type="button"
                disabled={!canReact || busy}
                onClick={() => toggle(emoji)}
                title={who.join(', ')}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums transition-colors disabled:cursor-help ${own ? 'bg-accent/20 text-accent-light' : 'bg-base-700/60 text-slate-300 hover:bg-base-600/70'}`}
              >
                <Emoji char={emoji} className="h-3.5 w-3.5" />
                {perEmoji[emoji].size}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
