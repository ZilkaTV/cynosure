import { useEffect, useState } from 'react'
import { createGameNight, deleteGameNight, fetchGameNights, setRsvp, type GameNightWithRsvps, type RsvpStatus } from '../lib/gameNights'
import { useLanguage } from '../i18n/LanguageContext'

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
export function GameNightsCard({ openfrontId, canCreate = false, names = {} }: { openfrontId: string; canCreate?: boolean; names?: Record<string, string> }) {
  const { t } = useLanguage()
  const [nights, setNights] = useState<GameNightWithRsvps[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => fetchGameNights().then(setNights)
  useEffect(() => {
    load()
  }, [])

  const label = (status: RsvpStatus) => (status === 'going' ? t.home.gameNightsGoing : status === 'maybe' ? t.home.gameNightsMaybe : t.home.gameNightsNotGoing)

  return (
    <div className="panel flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.home.gameNightsTitle}</p>
        {canCreate && !creating && (
          <button onClick={() => setCreating(true)} className="text-xs text-accent-light hover:text-accent">
            {t.home.gameNightsCreateButton}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-signal-red">{error}</p>}

      {canCreate && creating && (
        <div className="flex flex-col gap-2 rounded-lg border border-base-700 bg-base-800/60 p-3">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded border border-base-600 bg-base-900 px-2 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
          />
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
              disabled={!startsAt}
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
        return (
          <div key={n.id} className="flex flex-col gap-2 rounded-lg border border-base-700 bg-base-800/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">
                  {new Date(n.startsAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                {n.note && <p className="text-xs text-slate-400">{n.note}</p>}
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

            <div className="flex gap-1.5">
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
