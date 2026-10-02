import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { formatLocal, localeFor, relativeUntil } from '../lib/gameNightTime'

// Day chips + a free time field, no preset clock time. "In 30 min / 1 h / 2 h"
// chips fill both from the current time (rounded up to the next quarter hour);
// the time can also just be typed. Past times can't be posted; the preview
// shows the result in the organiser's own zone plus UTC, London and New York so
// it is obvious how it reads for others. `onChange` gets a local
// "YYYY-MM-DDTHH:MM" string once day and time are both set and in the future,
// otherwise ''.

const pad = (n: number) => String(n).padStart(2, '0')
const MIN_LEAD_MS = 5 * 60_000
const OFFSETS_MIN = [30, 60, 120]
const OTHER_ZONES = [
  { label: 'UTC', tz: 'UTC' },
  { label: 'London', tz: 'Europe/London' },
  { label: 'New York', tz: 'America/New_York' },
]

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function timeKey(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** now + `minutes`, rounded up to the next quarter hour. */
function inMinutes(minutes: number): Date {
  const d = new Date(Date.now() + minutes * 60_000)
  d.setSeconds(0, 0)
  const rem = d.getMinutes() % 15
  if (rem !== 0) d.setMinutes(d.getMinutes() + (15 - rem))
  return d
}

export function GameNightTimePicker({ onChange }: { onChange: (v: string) => void }) {
  const { t, language } = useLanguage()
  const days = useMemo(() => {
    const out: { key: string; label: string }[] = []
    const base = new Date()
    for (let i = 0; i < 8; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      out.push({
        key: dateKey(d),
        label: i === 0 ? t.home.gameNightsDayToday : i === 1 ? t.home.gameNightsDayTomorrow : d.toLocaleDateString(localeFor(language), { weekday: 'short', day: 'numeric' }),
      })
    }
    return out
  }, [t, language])

  const [date, setDate] = useState(days[0].key)
  const [time, setTime] = useState('')

  const start = date && time ? new Date(`${date}T${time}`) : null
  const valid = !!start && !isNaN(start.getTime()) && start.getTime() > Date.now() + MIN_LEAD_MS
  const iso = valid && start ? start.toISOString() : null

  useEffect(() => {
    onChange(valid ? `${date}T${time}` : '')
  }, [valid, date, time, onChange])

  const chip = (active: boolean) =>
    `rounded-md px-2 py-1 text-xs transition-colors ${active ? 'bg-accent font-semibold text-base-950' : 'bg-base-700/60 text-slate-300 hover:bg-base-700'}`

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{t.home.gameNightsDayLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button key={d.key} type="button" onClick={() => setDate(d.key)} className={chip(date === d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{t.home.gameNightsTimeLabel}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="time"
            value={time}
            step={300}
            onChange={(e) => setTime(e.target.value)}
            aria-label={t.home.gameNightsTimeLabel}
            className="rounded border border-base-600 bg-base-900 px-2 py-1 text-sm text-white focus:border-accent focus:outline-none"
          />
          {OFFSETS_MIN.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                const d = inMinutes(m)
                setDate(dateKey(d))
                setTime(timeKey(d))
              }}
              className={chip(false)}
            >
              {t.home.gameNightsInMinutes(m)}
            </button>
          ))}
        </div>
      </div>

      {iso ? (
        <div className="rounded-md bg-base-900/70 px-3 py-2 text-xs">
          <p className="font-medium text-white">
            {formatLocal(iso, language)}
            {relativeUntil(iso) && <span className="ml-2 font-normal text-slate-400">{t.home.gameNightsStartsIn(relativeUntil(iso))}</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {OTHER_ZONES.map((z) => `${z.label} ${new Date(iso).toLocaleTimeString(localeFor(language), { hour: '2-digit', minute: '2-digit', timeZone: z.tz })}`).join(' · ')}
          </p>
        </div>
      ) : time ? (
        <p className="text-[11px] text-signal-red">{t.home.gameNightsPast}</p>
      ) : (
        <p className="text-[11px] text-slate-500">{t.home.gameNightsPickTime}</p>
      )}
      <p className="text-[11px] text-slate-500">{t.home.gameNightsLocalNote}</p>
    </div>
  )
}
