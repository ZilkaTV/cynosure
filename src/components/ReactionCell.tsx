import { useState } from 'react'
import { Emoji } from './Emoji'
import { REACTION_EMOJIS } from '../lib/reactions'
import type { ReactionsApi } from '../lib/useReactions'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * The Reaction column cell of a game row: the reactions already left on the
 * game (hover a chip for who left it; click your own to take it back) plus,
 * for signed-in members, a "+" that opens the emoji picker. Used on Home,
 * Monthly and History.
 */
export function ReactionCell({ gameId, memberIds, api }: { gameId: string; memberIds: string[]; api: ReactionsApi }) {
  const { t } = useLanguage()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const { reactions, myId, names, give, remove } = api
  const perEmoji = reactions.byGame[gameId] ?? {}
  const canReact = !!myId && memberIds.some((id) => id !== myId)

  const toggle = async (emoji: string) => {
    if (!myId) return
    setBusy(true)
    if (perEmoji[emoji]?.has(myId)) await remove(gameId, emoji)
    else await give(gameId, memberIds, emoji)
    setBusy(false)
    setPicking(false)
  }

  return (
    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {picking && myId
          ? REACTION_EMOJIS.map((emoji) => {
              const mine = !!perEmoji[emoji]?.has(myId)
              return (
                <button
                  key={emoji}
                  disabled={busy}
                  onClick={() => toggle(emoji)}
                  title={mine ? t.home.reactionRemoveHint : undefined}
                  className={`rounded-md p-1 transition-colors hover:bg-base-700 disabled:cursor-not-allowed disabled:opacity-40 ${mine ? 'bg-accent/20' : ''}`}
                  aria-label={emoji}
                >
                  <Emoji char={emoji} className="h-5 w-5" />
                </button>
              )
            })
          : REACTION_EMOJIS.filter((emoji) => perEmoji[emoji]?.size).map((emoji) => {
              const who = [...perEmoji[emoji]].map((id) => names[id] ?? id).sort((a, b) => a.localeCompare(b))
              const mine = !!myId && perEmoji[emoji].has(myId)
              const chipClass = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                mine ? 'bg-accent/20 text-accent-light' : 'bg-base-700/60 text-slate-300'
              }`
              const content = (
                <>
                  <Emoji char={emoji} className="h-3.5 w-3.5" />
                  {perEmoji[emoji].size}
                </>
              )
              return mine ? (
                <button
                  key={emoji}
                  disabled={busy}
                  onClick={() => toggle(emoji)}
                  title={`${who.join(', ')} - ${t.home.reactionRemoveHint}`}
                  className={`${chipClass} transition-colors hover:bg-signal-red/20 disabled:cursor-not-allowed`}
                >
                  {content}
                </button>
              ) : (
                <span key={emoji} title={who.join(', ')} className={`${chipClass} cursor-help`}>
                  {content}
                </span>
              )
            })}
        {canReact && (
          <button
            onClick={() => setPicking((p) => !p)}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-base-700 hover:text-white"
            title={t.home.reactionButton}
            aria-label={t.home.reactionButton}
          >
            {picking ? '✕' : '+'}
          </button>
        )}
      </div>
    </td>
  )
}
