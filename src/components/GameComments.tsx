import { useMemo, useState } from 'react'
import { Emoji } from './Emoji'
import { MemberNameLink } from './ui'
import { REACTION_EMOJIS } from '../lib/reactions'
import { deleteComment, postComment, toggleCommentReaction, useGameComments, type CommentReactions, type GameComment } from '../lib/comments'
import { useProfile } from '../lib/useProfile'
import { useIsAdmin } from '../lib/useSession'
import { useLanguage } from '../i18n/LanguageContext'

interface Node {
  comment: GameComment
  replies: Node[]
}

/** Flat list -> tree by parent_id; a reply whose parent was deleted is dropped with it. */
function buildTree(comments: GameComment[]): Node[] {
  const nodes = new Map<number, Node>()
  for (const c of comments) nodes.set(c.id, { comment: c, replies: [] })
  const roots: Node[] = []
  for (const n of nodes.values()) {
    const parent = n.comment.parent_id
    if (parent == null) roots.push(n)
    else nodes.get(parent)?.replies.push(n)
  }
  return roots
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return '<1m'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString('en-GB')
}

function Composer({ gameId, parentId, placeholder, onDone, autoFocus }: { gameId: string; parentId: number | null; placeholder: string; onDone?: () => void; autoFocus?: boolean }) {
  const { t } = useLanguage()
  const { profile } = useProfile()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!profile) return <p className="text-sm text-slate-500">{t.comments.signIn}</p>

  const submit = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    const r = await postComment(gameId, profile.openfront_id, profile.in_game_name, body, parentId)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    setText('')
    onDone?.()
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <textarea
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          maxLength={500}
          rows={1}
          placeholder={placeholder}
          className="min-h-[38px] flex-1 resize-y rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
        />
        <button type="button" onClick={submit} disabled={busy || !text.trim()} className="btn-accent self-start !px-4 !py-2 text-sm disabled:opacity-50">
          {t.comments.post}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="self-start rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">
            {t.comments.cancel}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-signal-red">{error}</p>}
    </div>
  )
}

function CommentView({ node, gameId, reactions, depth, canDelete }: { node: Node; gameId: string; reactions: CommentReactions; depth: number; canDelete: boolean }) {
  const { t } = useLanguage()
  const { profile } = useProfile()
  const [replying, setReplying] = useState(false)
  const [picking, setPicking] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const c = node.comment
  const perEmoji = reactions[c.id] ?? {}
  const myId = profile?.openfront_id
  const react = (emoji: string) => {
    if (!myId) return
    setPicking(false)
    void toggleCommentReaction(c.id, myId, emoji, !!perEmoji[emoji]?.has(myId))
  }

  return (
    <li className={depth > 0 ? 'border-l border-base-700 pl-3 sm:pl-4' : ''}>
      <div className="rounded-lg bg-base-850/60 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
          <MemberNameLink publicId={c.author_openfront_id} name={c.author_name ?? c.author_openfront_id} className="text-sm font-semibold text-white hover:text-accent-light" />
          <span>{ago(c.created_at)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-200">{c.body}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
          {REACTION_EMOJIS.filter((e) => perEmoji[e]?.size).map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={!myId}
              onClick={() => react(emoji)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums disabled:cursor-default ${myId && perEmoji[emoji].has(myId) ? 'bg-accent/20 text-accent-light' : 'bg-base-700/60 text-slate-300 hover:bg-base-600/70'}`}
            >
              <Emoji char={emoji} className="h-3.5 w-3.5" />
              {perEmoji[emoji].size}
            </button>
          ))}
          {myId && (
            <span className="relative">
              <button type="button" onClick={() => setPicking((p) => !p)} className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-base-700 hover:text-white">
                {t.comments.react}
              </button>
              {picking && (
                <span className="absolute bottom-full left-0 z-20 flex gap-0.5 rounded-full border border-base-600 bg-base-850 p-1 shadow-xl">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => react(emoji)} aria-label={emoji} className="rounded-full p-1 transition-transform hover:scale-125">
                      <Emoji char={emoji} className="h-5 w-5" />
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
          {myId && (
            <button type="button" onClick={() => setReplying((r) => !r)} className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-base-700 hover:text-white">
              {t.comments.reply}
            </button>
          )}
          {(canDelete || myId === c.author_openfront_id) && (
            <button type="button" onClick={() => void deleteComment(c.id)} className="rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-signal-red/15 hover:text-signal-red">
              {t.comments.remove}
            </button>
          )}
          {node.replies.length > 0 && (
            <button type="button" onClick={() => setShowReplies((s) => !s)} className="ml-auto rounded-md px-1.5 py-0.5 text-slate-400 hover:text-white">
              {showReplies ? t.comments.hideReplies : t.comments.showReplies(node.replies.length)}
            </button>
          )}
        </div>
      </div>
      {replying && (
        <div className="mt-2 pl-3 sm:pl-4">
          <Composer gameId={gameId} parentId={c.id} placeholder={t.comments.replyPlaceholder} autoFocus onDone={() => setReplying(false)} />
        </div>
      )}
      {showReplies && node.replies.length > 0 && (
        <ul className="mt-2 space-y-2">
          {node.replies.map((r) => (
            <CommentView key={r.comment.id} node={r} gameId={gameId} reactions={reactions} depth={Math.min(depth + 1, 4)} canDelete={canDelete} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The comment thread of a game's post-game report: comments, replies to comments, reactions on both. */
export default function GameComments({ gameId }: { gameId: string }) {
  const { t } = useLanguage()
  const { comments, reactions, loaded } = useGameComments(gameId)
  const isAdmin = useIsAdmin()
  const tree = useMemo(() => buildTree(comments), [comments])

  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-bold text-white">
        {t.comments.title} <span className="font-normal text-slate-500">({comments.length})</span>
      </h3>
      <Composer gameId={gameId} parentId={null} placeholder={t.comments.placeholder} />
      {loaded && tree.length === 0 && <p className="py-2 text-sm text-slate-500">{t.comments.empty}</p>}
      {tree.length > 0 && (
        <ul className="space-y-2">
          {tree.map((n) => (
            <CommentView key={n.comment.id} node={n} gameId={gameId} reactions={reactions} depth={0} canDelete={isAdmin} />
          ))}
        </ul>
      )}
    </div>
  )
}
