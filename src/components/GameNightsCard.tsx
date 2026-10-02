import { useState } from 'react'
import { createGameNight, deleteGameNight, setRsvp, unansweredGameNights, useGameNights, type RsvpStatus } from '../lib/gameNights'
import { useLanguage } from '../i18n/LanguageContext'
import { GameNightTimePicker } from './GameNightTimePicker'
import { formatLocal, relativeUntil } from '../lib/gameNightTime'
import { useMemberNames } from '../lib/useMemberNames'
import { useProfile } from '../lib/useProfile'

const STATUSES: RsvpStatus[] = ['going', 'maybe', 'not_going']

function idsByStatus(rsvps: Record<string, RsvpStatus>): Record<RsvpStatus, string[]> {
  const out: Record<RsvpStatus, string[]> = { going: [], maybe: [], not_going: [] }
  for (const [id, status] of Object.entries(rsvps)) out[status].push(id)
  return out
}

/**
 * Everyone signed in sees the card (even with no game night planned) and can
 * answer going / maybe / can't. Only `canCreate` (the inner-circle Metrics page)
 * can post or remove one. `names` maps openfront id -> display name for the
 * hover lists; an id without a known name falls back to the raw id.
 */
export function GameNightsCard({ openfrontId, canCreate = false }: { openfrontId: string; canCreate?: boolean }) {
  const { t, language } = useLanguage()
  const { nights, refresh: load } = useGameNights()
  const names = useMemberNames()
  const [creating, setCreating] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const unansweredCount = unansweredGameNights(nights, openfrontId).length
  const label = (status: RsvpStatus) => (status === 'going' ? t.home.gameNightsGoing : status === 'maybe' ? t.home.gameNightsMaybe : t.home.gameNightsNotGoing)

  return (
    <div className="panel flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t.home.gameNightsTitle}
          {unansweredCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-red px-1 text-[10px] font-bold text-white motion-safe:animate-pulse">
              {unansweredCount}
            </span>
          )}
        </p>
        {canCreate && !creating && (
          <button onClick={() => setCreating(true)} className="text-xs text-accent-light hover:text-accent">
            {t.home.gameNightsCreateButton}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-signal-red">{error}</p>}

      {canCreate && creating && (
        <div className="flex flex-col gap-2 rounded-lg border border-base-700 bg-base-800/60 p-3">
          <GameNightTimePicker value={startsAt} onChange={setStartsAt} />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.home.gameNightsNotePlaceholder}
            maxLength={120}
            className="rounded border border-base-600 bg-base-900 px-2 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
              {t.home.gameNightsCancel}
            </button>
            <button
              onClick={async () => {
                setError(null)
                if (new Date(startsAt).getTime() <= Date.now()) {
                  setError(t.home.gameNightsPast)
                  return
                }
                const r = await createGameNight(startsAt, note, openfrontId)
                if (r.ok) {
                  setCreating(false)
                  setStartsAt('')
                  setNote('')
                  load()
                } else {
                  setError(r.message)
                }
              }}
              disabled={!startsAt || new Date(startsAt).getTime() <= Date.now()}
              className="btn-ghost !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.home.gameNightsPost}
            </button>
          </div>
        </div>
      )}

      {nights && nights.length === 0 && !creating && (
        <p className="text-xs text-slate-500">{canCreate ? t.home.gameNightsEmpty : t.home.gameNightsEmptyViewer}</p>
      )}

      {nights?.map((n) => {
        const byStatus = idsByStatus(n.rsvps)
        const myStatus = n.rsvps[openfrontId]
        const unanswered = !myStatus && new Date(n.startsAt).getTime() > Date.now()
        return (
          <div key={n.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${unanswered ? 'border-signal-red/70 bg-signal-red/5' : 'border-base-700 bg-base-800/40'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">
                  {formatLocal(n.startsAt, language)}
                  {relativeUntil(n.startsAt) && <span className="ml-2 text-xs font-normal text-slate-400">{t.home.gameNightsStartsIn(relativeUntil(n.startsAt))}</span>}
                </p>
                {n.note && <p className="text-xs text-slate-400">{n.note}</p>}
                {unanswered && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-signal-red px-2 py-0.5 text-[11px] font-semibold text-white motion-safe:animate-pulse">
                    {'\u25CF'} {t.home.gameNightsUnanswered}
                  </span>
                )}
              </div>
              {canCreate && n.createdBy === openfrontId && (
                <button
                  onClick={async () => {
                    setError(null)
                    setBusyId(n.id)
                    const r = await deleteGameNight(n.id)
                    if (!r.ok) setError(r.message)
                    await load()
                    setBusyId(null)
                  }}
                  disabled={busyId === n.id}
                  className="text-[11px] text-slate-500 hover:text-signal-red"
                >
                  {t.home.gameNightsRemove}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
              {STATUSES.map((status) => {
                const who = byStatus[status].map((id) => names[id] ?? id).sort((a, b) => a.localeCompare(b))
                return (
                  <span key={status} title={who.length > 0 ? who.join(', ') : undefined} className={who.length > 0 ? 'cursor-help' : undefined}>
                    {label(status)} <b className="tabular-nums text-slate-200">{who.length}</b>
                  </span>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  onClick={async () => {
                    setError(null)
                    setBusyId(n.id)
                    const r = await setRsvp(n.id, openfrontId, status)
                    if (!r.ok) setError(r.message)
                    await load()
                    setBusyId(null)
                  }}
                  disabled={busyId === n.id}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    myStatus === status ? 'bg-accent text-base-950 font-semibold' : 'bg-base-700/60 text-slate-300 hover:bg-base-700'
                  }`}
                >
                  {label(status)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The always-visible card in the left column under the Discord widget (every
 * page that uses StatsShell). Shown to registered members only; viewing and
 * RSVPs only, posting lives on the inner-circle Metrics page.
 */
export function GameNightsSidebar() {
  const { profile } = useProfile()
  if (!profile) return null
  return (
    <div className="mt-4">
      <GameNightsCard openfrontId={profile.openfront_id} />
    </div>
  )
}
