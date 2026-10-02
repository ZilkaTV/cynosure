import { useEffect, useMemo } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { formatLocal, localeFor, relativeUntil } from '../lib/gameNightTime'

// Day chips + a time list in 15-minute steps instead of the browser's own
// date-time control (which differs a lot between browsers and is awkward on
// phones). Past days/times can't be picked; the preview shows the result in the
// organiser's own zone plus UTC, London and New York so it is obvious how it
// reads for others. `value` is a local "YYYY-MM-DDTHH:MM" string, '' = unset.

const pad = (n: number) => String(n).padStart(2, '0')
const MIN_LEAD_MS = 5 * 60_000
const QUICK_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00']
const SLOTS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`)
const OTHER_ZONES = [
  { label: 'UTC', tz: 'UTC' },
  { label: 'London', tz: 'Europe/London' },
  { label: 'New York', tz: 'America/New_York' },
]

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function slotMs(date: string, time: string) {
  return new Date(`${date}T${time}`).getTime()
}
function isFuture(date: string, time: string, now: number) {
  return slotMs(date, time) > now + MIN_LEAD_MS
}

export function GameNightTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, language } = useLanguage()
  const now = Date.now()

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

  const [date, time] = value.includes('T') ? value.split('T') : ['', '']

  // Default: 20:00 today if that is still ahead, otherwise 20:00 tomorrow.
  useEffect(() => {
    if (value) return
    const today = days[0].key
    onChange(isFuture(today, '20:00', Date.now()) ? `${today}T20:00` : `${days[1].key}T20:00`)
  }, [value, days, onChange])

  const pick = (nextDate: string, nextTime: string) => {
    let tm = nextTime
    if (!isFuture(nextDate, tm, Date.now())) tm = SLOTS.find((s) => isFuture(nextDate, s, Date.now())) ?? tm
    onChange(`${nextDate}T${tm}`)
  }

  const valid = !!date && !!time && !isNaN(slotMs(date, time)) && isFuture(date, time, now)
  const iso = valid ? new Date(slotMs(date, time)).toISOString() : null
  const rel = iso ? relativeUntil(iso) : ''

  const chip = (active: boolean) =>
    `rounded-md px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
      active ? 'bg-accent font-semibold text-base-950' : 'bg-base-700/60 text-slate-300 hover:bg-base-700'
    }`

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{t.home.gameNightsDayLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              disabled={!SLOTS.some((s) => isFuture(d.key, s, now))}
              onClick={() => pick(d.key, time || '20:00')}
              className={chip(date === d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{t.home.gameNightsTimeLabel}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_TIMES.map((q) => (
            <button key={q} type="button" disabled={!date || !isFuture(date, q, now)} onClick={() => pick(date, q)} className={chip(time === q)}>
              {q}
            </button>
          ))}
          <select
            value={time}
            onChange={(e) => pick(date, e.target.value)}
            className="rounded border border-base-600 bg-base-900 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none"
            aria-label={t.home.gameNightsTimeLabel}
          >
            {SLOTS.map((s) => (
              <option key={s} value={s} disabled={!!date && !isFuture(date, s, now)}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {iso ? (
        <div className="rounded-md bg-base-900/70 px-3 py-2 text-xs">
          <p className="font-medium text-white">
            {formatLocal(iso, language)}
            {rel && <span className="ml-2 font-normal text-slate-400">{t.home.gameNightsStartsIn(rel)}</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {OTHER_ZONES.map((z) => `${z.label} ${new Date(iso).toLocaleTimeString(localeFor(language), { hour: '2-digit', minute: '2-digit', timeZone: z.tz })}`).join(' · ')}
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-signal-red">{t.home.gameNightsPast}</p>
      )}
      <p className="text-[11px] text-slate-500">{t.home.gameNightsLocalNote}</p>
    </div>
  )
}
