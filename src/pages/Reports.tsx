import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionHeading, Spinner, relativeTime } from '../components/ui'
import { useIsAdmin } from '../lib/useSession'
import { useLanguage } from '../i18n/LanguageContext'
import { useProfile } from '../lib/useProfile'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { closeReport, fetchOpenReports, reasonLabel, type Report } from '../lib/reports'
import { removeProfileMedia } from '../lib/profileExtras'
import { supabase as db } from '../lib/supabase'

/** The open reports of profiles and comments, for admins: look at it, take the picture / text away, mark it as done. */
export default function Reports() {
  const { t, language } = useLanguage()
  const de = language === 'de'
  const isAdmin = useIsAdmin()
  const { profile } = useProfile()
  const roster = useSharedRoster()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [comments, setComments] = useState<Record<string, { profile_id: string; body: string }>>({})
  const [message, setMessage] = useState<string | null>(null)
  const names = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])
  const nameOf = (id: string) => cleanDisplayName(names.get(id) ?? id)

  const load = useCallback(async () => {
    const list = await fetchOpenReports()
    setReports(list)
    const ids = list.filter((r) => r.target_type === 'comment').map((r) => Number(r.target_id))
    if (ids.length) {
      const { data } = await db.from('cyn_profile_comments').select('id, profile_id, body').in('id', ids)
      const map: Record<string, { profile_id: string; body: string }> = {}
      for (const c of (data as { id: number; profile_id: string; body: string }[] | null) ?? []) map[String(c.id)] = { profile_id: c.profile_id, body: c.body }
      setComments(map)
    }
  }, [])
  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{de ? 'Nur für Admins.' : 'Admins only.'}</p>
      </div>
    )
  }

  async function done(r: Report) {
    if (!profile) return
    if (await closeReport(r.id, profile.openfront_id)) setReports((l) => (l ?? []).filter((x) => x.id !== r.id))
    else setMessage(de ? 'Das hat nicht geklappt.' : 'That did not work.')
  }
  async function remove(r: Report, kind: 'avatar' | 'banner' | 'bio') {
    const ok = await removeProfileMedia(kind, r.target_id)
    setMessage(ok ? (de ? 'Entfernt.' : 'Removed.') : de ? 'Entfernen fehlgeschlagen.' : 'Removing failed.')
  }
  async function deleteComment(r: Report) {
    const { error } = await db.from('cyn_profile_comments').delete().eq('id', Number(r.target_id))
    setMessage(error ? (de ? 'Löschen fehlgeschlagen.' : 'Deleting failed.') : de ? 'Kommentar gelöscht.' : 'Comment deleted.')
  }

  const btn = 'rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-accent hover:text-white'
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeading center eyebrow="Admin" title={de ? 'Meldungen' : 'Reports'} />
      {message && <p className="text-center text-sm text-gold-light">{message}</p>}
      {reports === null ? (
        <Spinner />
      ) : reports.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">{de ? 'Keine offenen Meldungen.' : 'No open reports.'}</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const c = r.target_type === 'comment' ? comments[r.target_id] : undefined
            const profileId = r.target_type === 'profile' ? r.target_id : c?.profile_id
            return (
              <li key={r.id} className="panel space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-white">
                    {r.target_type === 'profile' ? (de ? 'Profil' : 'Profile') : de ? 'Kommentar' : 'Comment'}:{' '}
                    {profileId ? (
                      <Link to={`/member/${profileId}`} className="text-accent-light hover:underline">
                        {nameOf(profileId)}
                      </Link>
                    ) : (
                      <span className="text-slate-500">{de ? '(gelöscht)' : '(deleted)'}</span>
                    )}
                  </p>
                  <span className="text-xs text-slate-500">
                    {de ? 'gemeldet von' : 'reported by'} {nameOf(r.reporter_openfront_id)} · {relativeTime(new Date(r.created_at).getTime(), t)}
                  </span>
                </div>
                <p className="text-sm text-slate-300">
                  <span className="font-semibold text-signal-red">{reasonLabel(r.reason, de)}</span>
                  {r.note ? <span className="text-slate-400"> · {r.note}</span> : null}
                </p>
                {c && <p className="rounded-lg bg-base-850/70 px-3 py-2 text-sm text-slate-200">{c.body}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.target_type === 'profile' && (
                    <>
                      <button type="button" className={btn} onClick={() => void remove(r, 'avatar')}>
                        {de ? 'Icon entfernen' : 'Remove icon'}
                      </button>
                      <button type="button" className={btn} onClick={() => void remove(r, 'banner')}>
                        {de ? 'Banner entfernen' : 'Remove banner'}
                      </button>
                      <button type="button" className={btn} onClick={() => void remove(r, 'bio')}>
                        {de ? 'Text entfernen' : 'Remove text'}
                      </button>
                    </>
                  )}
                  {c && (
                    <button type="button" className={btn} onClick={() => void deleteComment(r)}>
                      {de ? 'Kommentar löschen' : 'Delete comment'}
                    </button>
                  )}
                  <button type="button" className="btn-accent !px-4 !py-1.5 text-xs" onClick={() => void done(r)}>
                    {de ? 'Erledigt' : 'Done'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
