import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

const icon = 'h-5 w-5'
const btn = 'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-base-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

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
 * The social strip under a game, like under a post: like (hover or hold for the other reactions) and comment on the left,
 * save and share at the right end under the result and duration columns. The reactions already left show as chips.
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
  const [pickerAt, setPickerAt] = useState<{ left: number; top: number; below: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const likeRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const isSaved = saved.games.some((g) => g.game_id === gameId)
  const comments = commentCounts[gameId] ?? 0

  // The picker is drawn on the page itself (not inside the table), so no table edge can cut it off.
  const openPicker = () => {
    window.clearTimeout(timer.current)
    const r = likeRef.current?.getBoundingClientRect()
    if (!r || !myId) return
    const below = r.top < 70
    setPickerAt({ left: r.left, top: below ? r.bottom + 4 : r.top - 4, below })
  }
  const closePickerSoon = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPickerAt(null), 250)
  }
  useEffect(() => {
    if (!pickerAt) return
    const close = () => setPickerAt(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [pickerAt])

  const run = async (job: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true)
    setProblem(null)
    const r = await job()
    setBusy(false)
    if (!r.ok) setProblem(r.message)
  }
  const toggle = async (emoji: string) => {
    if (!myId) return
    setPickerAt(null)
    await run(() => (perEmoji[emoji]?.has(myId) ? remove(gameId, emoji) : give(gameId, memberIds, emoji)))
  }

  // A tap on the like button likes (or takes back the like); hovering or holding it offers the other reactions.
  const onLike = async () => {
    if (!myId || busy) return
    if (mine.length > 0) await run(async () => (await Promise.all(mine.map((e) => remove(gameId, e)))).find((r) => !r.ok) ?? { ok: true, message: '' })
    else await toggle(DEFAULT_REACTION)
  }

  const share = async () => {
    const url = gameShareUrl(gameId)
    try {
      // The system share sheet only on phones; on a computer the link is simply copied.
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) await navigator.share({ title, url })
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
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1" onClick={(e) => (e.target as HTMLElement).closest('button') && e.stopPropagation()}>
      <button
        ref={likeRef}
        type="button"
        onClick={onLike}
        onMouseEnter={openPicker}
        onMouseLeave={closePickerSoon}
        onTouchStart={() => {
          timer.current = window.setTimeout(openPicker, 450)
        }}
        onTouchEnd={() => window.clearTimeout(timer.current)}
        disabled={!myId || busy}
        title={myId ? t.home.reactionButton : undefined}
        className={`${btn} ${mine.length > 0 ? '!text-accent-light' : ''}`}
      >
        {mine.length > 0 ? (
          <Emoji char={mine[0]} className={icon} />
        ) : (
          <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-6.7-4.35-9.3-8.1C.9 10.2 1.4 6.6 4.3 5 6.4 3.8 9 4.3 12 7c3-2.7 5.6-3.2 7.7-2 2.9 1.6 3.4 5.2 1.6 7.9C18.7 16.65 12 21 12 21Z" />
          </svg>
        )}
        <span className="hidden sm:inline">{t.gameActions.like}</span>
      </button>
      {pickerAt &&
        createPortal(
          <div
            style={{ position: 'fixed', left: pickerAt.left, top: pickerAt.top, transform: pickerAt.below ? undefined : 'translateY(-100%)' }}
            className="z-[120] flex gap-0.5 rounded-full border border-base-600 bg-base-850 p-1 shadow-xl"
            onMouseEnter={openPicker}
            onMouseLeave={closePickerSoon}
            onClick={(e) => e.stopPropagation()}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={busy}
                onClick={() => toggle(emoji)}
                aria-label={emoji}
                className={`rounded-full p-1.5 transition-transform hover:scale-125 disabled:opacity-40 ${myId && perEmoji[emoji]?.has(myId) ? 'bg-accent/25' : ''}`}
              >
                <Emoji char={emoji} className="h-6 w-6" />
              </button>
            ))}
          </div>,
          document.body,
        )}

      <button type="button" onClick={() => onOpenComments(gameId)} className={btn} title={t.gameActions.comment}>
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12Z" />
        </svg>
        <span className="tabular-nums">{comments > 0 ? comments : <span className="hidden sm:inline">{t.gameActions.comment}</span>}</span>
      </button>

      {chips.map((emoji) => {
        const who = [...perEmoji[emoji]].map((id) => names[id] ?? id).sort((a, b) => a.localeCompare(b))
        const own = !!myId && perEmoji[emoji].has(myId)
        return (
          <button
            key={emoji}
            type="button"
            disabled={!myId || busy}
            onClick={() => toggle(emoji)}
            title={who.join(', ')}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums transition-colors disabled:cursor-help ${own ? 'bg-accent/20 text-accent-light' : 'bg-base-700/60 text-slate-300 hover:bg-base-600/70'}`}
          >
            <Emoji char={emoji} className="h-3.5 w-3.5" />
            {perEmoji[emoji].size}
          </button>
        )
      })}
      {problem && <span className="ml-2 text-xs text-signal-red">{problem}</span>}

      <div className="ml-auto flex items-center gap-1">
        {profile && (
          <button
            type="button"
            onClick={() => void (isSaved ? unsaveGame(profile.openfront_id, gameId) : saveGame(profile.openfront_id, gameId, title))}
            className={`${btn} ${isSaved ? '!text-gold-light' : ''}`}
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
      </div>
    </div>
  )
}
