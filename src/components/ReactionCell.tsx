import { useState } from 'react'
import { Emoji } from './Emoji'
import { REACTION_EMOJIS } from '../lib/reactions'
import type { ReactionsApi } from '../lib/useReactions'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * The Reaction column cell of a game row: the reactions already left on the
 * game (hover a chip for who left it) plus, for signed-in members, a "+" that
 * opens the emoji picker. Used on Home, Monthly and History.
 */
export function ReactionCell({ gameId, memberIds, api }: { gameId: string; memberIds: string[]; api: ReactionsApi }) {
  const { t } = useLanguage()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const { reactions, myId, names, give } = api
  const perEmoji = reactions.byGame[gameId] ?? {}
  const canReact = !!myId && memberIds.some((id) => id !== myId)

  return (
    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {picking && myId
          ? REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                disabled={busy || !!perEmoji[emoji]?.has(myId)}
                onClick={async () => {
                  setBusy(true)
                  await give(gameId, memberIds, emoji)
                  setBusy(false)
                  setPicking(false)
                }}
                className="rounded-md p-1 transition-colors hover:bg-base-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={emoji}
              >
                <Emoji char={emoji} className="h-5 w-5" />
              </button>
            ))
          : REACTION_EMOJIS.filter((emoji) => perEmoji[emoji]?.size).map((emoji) => {
              const who = [...perEmoji[emoji]].map((id) => names[id] ?? id).sort((a, b) => a.localeCompare(b))
              return (
                <span
                  key={emoji}
                  title={who.join(', ')}
                  className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    myId && perEmoji[emoji].has(myId) ? 'bg-accent/20 text-accent-light' : 'bg-base-700/60 text-slate-300'
                  }`}
                >
                  <Emoji char={emoji} className="h-3.5 w-3.5" />
                  {perEmoji[emoji].size}
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
