import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useProfile } from '../lib/useProfile'
import { useSharedRoster } from '../lib/access'
import { useIsAdmin } from '../lib/useSession'
import { cleanDisplayName, initialOf } from '../lib/displayName'
import { MAX_COMMENT, deleteProfileComment, fetchAvatars, fetchProfileComments, postProfileComment, type Fit, type ProfileComment } from '../lib/profileExtras'
import FitImage from './FitImage'
import ReportDialog from './ReportDialog'
import { relativeTime } from './ui'

/** The comment wall of a profile (flat, newest first, like on a Steam profile). Members write; the author, the profile's owner and admins delete. */
export default function ProfileWall({ profileId }: { profileId: string }) {
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const de = language === 'de'
  const isAdmin = useIsAdmin()
  const roster = useSharedRoster()
  const [comments, setComments] = useState<ProfileComment[] | null>(null)
  const [avatars, setAvatars] = useState<Record<string, { src: string; fit: Fit | null }>>({})
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [reporting, setReporting] = useState<ProfileComment | null>(null)
  const me = profile?.openfront_id
  const names = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])

  const reload = useCallback(async () => {
    const list = await fetchProfileComments(profileId)
    setComments(list)
    const ids = [...new Set(list.map((c) => c.author_openfront_id))]
    if (ids.length) setAvatars(await fetchAvatars(ids))
  }, [profileId])
  useEffect(() => {
    setComments(null)
    void reload()
  }, [reload])

  async function send() {
    if (!me || busy || !text.trim()) return
    setBusy(true)
    setError(null)
    const problem = await postProfileComment(profileId, me, text)
    setBusy(false)
    if (problem) return setError(problem)
    setText('')
    void reload()
  }
  async function remove(id: number) {
    setComments((list) => (list ?? []).filter((c) => c.id !== id))
    if (!(await deleteProfileComment(id))) void reload()
  }

  const shown = showAll ? comments ?? [] : (comments ?? []).slice(0, 10)
  const canDelete = (c: ProfileComment) => isAdmin || c.author_openfront_id === me || profileId === me
  return (
    <section id="pinnwand" className="scroll-mt-6 space-y-3">
      <div className="text-center">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold">{de ? 'Pinnwand' : 'Wall'}</p>
        <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
          {de ? 'Kommentare' : 'Comments'} {comments ? <span className="text-slate-500">({comments.length})</span> : null}
        </h2>
      </div>
      <div className="panel p-4">
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_COMMENT))}
            rows={2}
            placeholder={de ? 'Kommentar auf dieser Pinnwand hinterlassen …' : 'Leave a comment on this wall …'}
            className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="btn-accent self-end !px-5 !py-2 text-sm disabled:opacity-50">
            {de ? 'Senden' : 'Post'}
          </button>
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{error ? <span className="text-signal-red">{error}</span> : ''}</span>
          <span>
            {text.length}/{MAX_COMMENT}
          </span>
        </div>
      </div>
      {comments === null ? (
        <p className="py-4 text-center text-sm text-slate-500">…</p>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">{de ? 'Noch keine Kommentare. Schreib den ersten.' : 'No comments yet. Write the first one.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => {
            const name = cleanDisplayName(names.get(c.author_openfront_id) ?? c.author_name ?? c.author_openfront_id)
            const avatar = avatars[c.author_openfront_id]
            return (
              <li key={c.id} className="flex gap-3 rounded-xl border border-base-700 bg-base-850/50 px-3 py-3">
                <Link to={`/member/${c.author_openfront_id}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-base-600 bg-base-800">
                  {avatar ? <FitImage src={avatar.src} fit={avatar.fit} /> : <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/40 to-base-800 font-display text-lg font-bold text-white">{initialOf(names.get(c.author_openfront_id) ?? c.author_name ?? c.author_openfront_id)}</span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <Link to={`/member/${c.author_openfront_id}`} className="truncate text-sm font-semibold text-white hover:text-accent-light">
                      {name}
                    </Link>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      <span title={new Date(c.created_at).toLocaleString()}>{relativeTime(new Date(c.created_at).getTime(), t)}</span>
                      {me && c.author_openfront_id !== me && (
                        <button type="button" onClick={() => setReporting(c)} className="text-slate-500 hover:text-signal-red" aria-label={de ? 'Kommentar melden' : 'Report comment'} title={de ? 'Melden' : 'Report'}>
                          ⚑
                        </button>
                      )}
                      {canDelete(c) && (
                        <button type="button" onClick={() => void remove(c.id)} className="text-slate-500 hover:text-signal-red" aria-label={de ? 'Kommentar löschen' : 'Delete comment'}>
                          ✕
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-200">{c.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {reporting && me && <ReportDialog myId={me} target="comment" targetId={String(reporting.id)} subject={`${cleanDisplayName(names.get(reporting.author_openfront_id) ?? reporting.author_name ?? reporting.author_openfront_id)}: ${reporting.body.slice(0, 80)}`} onClose={() => setReporting(null)} />}
      {comments && comments.length > 10 && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost text-sm">
            {showAll ? (de ? 'Nur die neuesten 10' : 'Newest 10 only') : de ? `Alle ${comments.length} anzeigen` : `Show all ${comments.length}`}
          </button>
        </div>
      )}
    </section>
  )
}
