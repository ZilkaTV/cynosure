import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Emoji } from './Emoji'
import { MemberNameLink } from './ui'
import { DEFAULT_REACTION, REACTION_EMOJIS } from '../lib/reactions'
import { saveGame, unsaveGame, useArmed, useSavedGames } from '../lib/savedGames'
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

// the one open reaction list on the page (see openPicker)
let closeOpenPicker: (() => void) | null = null

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
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const { reactions, saved, commentCounts, myId } = actions
  const { give, remove, names } = reactions
  const perEmoji = reactions.reactions.byGame[gameId] ?? {}
  const mine = myId ? REACTION_EMOJIS.filter((e) => perEmoji[e]?.has(myId)) : []
  const [pickerAt, setPickerAt] = useState<{ left: number; top: number; below: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const unsave = useArmed()
  const [problem, setProblem] = useState<string | null>(null)
  const likeRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const isSaved = saved.games.some((g) => g.game_id === gameId)
  const comments = commentCounts[gameId] ?? 0

  // The picker is drawn on the page itself (not inside the table), so no table edge can cut it off.
  const placePicker = () => {
    const r = likeRef.current?.getBoundingClientRect()
    if (!r) return
    const below = r.top < 70
    setPickerAt({ left: r.left, top: below ? r.bottom + 4 : r.top - 4, below })
  }
  // The list of reactions opens on hover and closes again a moment after the mouse has left the Like button and the list (the delay lets the mouse
  // travel from one to the other); an emote, Escape or a click anywhere else puts it away too. Only one list is open at a time.
  const leaveTimer = useRef<number | undefined>(undefined)
  const cancelClose = () => window.clearTimeout(leaveTimer.current)
  const scheduleClose = () => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => closeMine.current(), 300)
  }
  const openPicker = () => {
    window.clearTimeout(timer.current)
    cancelClose()
    if (!myId) return
    if (closeOpenPicker && closeOpenPicker !== closeMine.current) closeOpenPicker()
    closeOpenPicker = closeMine.current
    placePicker()
  }
  const closeMine = useRef(() => setPickerAt(null))
  useEffect(() => {
    const close = () => setPickerAt(null)
    closeMine.current = close
    return () => {
      if (closeOpenPicker === close) closeOpenPicker = null
      window.clearTimeout(leaveTimer.current)
    }
  }, [])
  // it follows its Like button when the page scrolls or the window changes size
  useEffect(() => {
    if (!pickerAt) return
    const follow = () => placePicker()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickerAt(null)
    // a click anywhere else than on the list or its Like button puts it away
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pickerRef.current?.contains(t) && !likeRef.current?.contains(t)) setPickerAt(null)
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', away)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerAt !== null])

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
        onMouseLeave={scheduleClose}
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
            ref={pickerRef}
            style={{ position: 'fixed', left: pickerAt.left, top: pickerAt.top, transform: pickerAt.below ? undefined : 'translateY(-100%)' }}
            className="z-[120] flex gap-0.5 rounded-full border border-base-600 bg-base-850 p-1 shadow-xl"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
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
            onClick={() => setListOpen(true)}
            title={who.join(', ')}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums transition-colors ${own ? 'bg-accent/20 text-accent-light' : 'bg-base-700/60 text-slate-300 hover:bg-base-600/70'}`}
          >
            <Emoji char={emoji} className="h-3.5 w-3.5" />
            {perEmoji[emoji].size}
          </button>
        )
      })}
      {problem && <span className="ml-2 text-xs text-signal-red">{problem}</span>}
      {listOpen &&
        createPortal(
          <ReactionList
            emojis={[...chips].sort((a, b) => perEmoji[b].size - perEmoji[a].size)}
            perEmoji={perEmoji}
            names={names}
            myId={myId}
            title={t.history.filterReacted}
            removeLabel={t.memberProfile.savedRemove}
            onRemove={(emoji) => void remove(gameId, emoji)}
            onClose={() => setListOpen(false)}
          />,
          document.body,
        )}

      <div className="ml-auto flex items-center gap-1">
        {profile && (
          <button
            type="button"
            onClick={() => {
              if (!isSaved) return void saveGame(profile.openfront_id, gameId, title)
              // taking a saved game back asks "Sure?" first (a misclick must not lose it)
              if (!unsave.armed) return unsave.arm()
              unsave.disarm()
              void unsaveGame(profile.openfront_id, gameId)
            }}
            className={`${btn} ${unsave.armed ? '!bg-signal-red/15 !text-signal-red' : isSaved ? '!text-gold-light' : ''}`}
            title={isSaved ? t.gameDetail.unsaveHint : t.gameDetail.saveHint}
            aria-pressed={isSaved}
          >
            <svg viewBox="0 0 24 24" className={icon} fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
            </svg>
            <span className={unsave.armed ? '' : 'hidden sm:inline'}>{unsave.armed ? (language === 'de' ? 'Sicher?' : 'Sure?') : isSaved ? t.gameDetail.saved : t.gameDetail.save}</span>
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

/** The window in the middle of the page: who left which reaction, one emoji after the other, the most used first. */
function ReactionList({
  emojis,
  perEmoji,
  names,
  myId,
  title,
  removeLabel,
  onRemove,
  onClose,
}: {
  emojis: string[]
  perEmoji: Record<string, Set<string>>
  names: Record<string, string>
  myId: string | null
  title: string
  removeLabel: string
  onRemove: (emoji: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose() }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-base-600 bg-base-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-base-700 bg-base-900 px-4 py-3">
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="divide-y divide-base-700/60">
          {emojis.map((emoji) => {
            const ids = [...perEmoji[emoji]].sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b))
            return (
              <div key={emoji} className="px-4 py-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Emoji char={emoji} className="h-6 w-6" />
                  <span className="tabular-nums">{ids.length}</span>
                </p>
                <ul className="space-y-1.5">
                  {ids.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-3 text-sm">
                      <MemberNameLink publicId={id} name={names[id] ?? id} className="text-white hover:text-accent-light" />
                      {id === myId && (
                        <button type="button" onClick={() => onRemove(emoji)} className="text-xs text-slate-500 hover:text-signal-red">
                          {removeLabel}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
