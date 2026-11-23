import { useEffect, useMemo, useState } from 'react'
import { Card, StatCard } from './ui'
import { useLanguage } from '../i18n/LanguageContext'
import { isActivityDoc, peakHour, summarizeActivity, toLocalHours, type ActivityDoc } from '../lib/rankedActivity'

// Activity statistics of the ranked queues (all of OpenFront, from the public game list; see scripts/collect-ranked-activity.mjs).

const fmt = (n: number, lang: string) => Math.round(n).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')
const signed = (n: number | null) => (n == null ? '-' : `${n > 0 ? '+' : ''}${n} %`)
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

function useActivityDoc(): ActivityDoc | null | undefined {
  const [doc, setDoc] = useState<ActivityDoc | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    fetch('/api/ranked-activity')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setDoc(isActivityDoc(j) ? j : null))
      .catch(() => alive && setDoc(null))
    return () => {
      alive = false
    }
  }, [])
  return doc
}

export default function RankedActivity() {
  const { language } = useLanguage()
  const de = language === 'de'
  const doc = useActivityDoc()
  const sum = useMemo(() => (doc ? summarizeActivity(doc) : null), [doc])
  const local = useMemo(() => (sum ? toLocalHours(sum.perHour, -new Date().getTimezoneOffset()) : []), [sum])
  if (!sum) return null

  const maxDay = Math.max(1, ...sum.series.map((d) => d.a + d.b))
  const maxHour = Math.max(1, ...local)
  const peak = peakHour(local)
  const trendColor = (v: number | null) => (v == null ? 'text-slate-400' : v < 0 ? 'text-red-300' : 'text-emerald-300')

  return (
    <section className="space-y-3">
      <div className="text-center">
        <h3 className="font-display text-lg font-bold text-white">{de ? 'Aktivität der Ranked Queues' : 'Ranked queue activity'}</h3>
        <p className="text-xs text-slate-500">
          {de
            ? `Alle Ranked-1v1- und 2v2-Spiele auf OpenFront (nicht nur CYN), die letzten ${sum.days} Tage. Quelle: OpenFronts öffentliche Spieleliste, nur Zählungen beendeter Spiele.`
            : `All ranked 1v1 and 2v2 games on OpenFront (not only CYN), the last ${sum.days} days. Source: OpenFront's public game list, counts of finished games only.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatCard label={de ? 'Spiele pro Tag (30 Tage)' : 'Games per day (30 days)'} value={fmt(sum.perDay30, language)} sub={de ? `letzte 7 Tage: ${fmt(sum.perDay7, language)}` : `last 7 days: ${fmt(sum.perDay7, language)}`} accent="purple" />
        <StatCard
          label={de ? 'Entwicklung zu davor' : 'Change vs. before'}
          value={<span className={trendColor(sum.trendPct)}>{signed(sum.trendPct)}</span>}
          sub={de ? `1v1 ${signed(sum.trend1v1)} · 2v2 ${signed(sum.trend2v2)}` : `1v1 ${signed(sum.trend1v1)} · 2v2 ${signed(sum.trend2v2)}`}
          accent="gold"
        />
        <StatCard label={de ? 'Anteil 2v2' : '2v2 share'} value={`${Math.round(sum.share2v2 * 100)} %`} sub={de ? `1v1 ${Math.round((1 - sum.share2v2) * 100)} %` : `1v1 ${Math.round((1 - sum.share2v2) * 100)} %`} accent="purple" />
        <StatCard
          label={de ? 'Lobby voll nach' : 'Lobby full after'}
          value={sum.medianFill == null ? '-' : `${sum.medianFill.toLocaleString(de ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 })} s`}
          sub={de ? `${Math.round(sum.shortShare * 100)} % enden unter 1 Min` : `${Math.round(sum.shortShare * 100)} % end within 1 min`}
          accent="plain"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <p className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-200">
            <span>{de ? 'Spiele pro Tag' : 'Games per day'}</span>
            <span className="flex items-center gap-3 text-[11px] font-normal text-slate-400">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />1v1</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-teal-500" />2v2</span>
            </span>
          </p>
          <div className="flex h-36 items-end gap-[2px]" role="img" aria-label={de ? 'Ranked-Spiele pro Tag' : 'Ranked games per day'}>
            {sum.series.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${fmt(d.a + d.b, language)} (1v1 ${fmt(d.a, language)}, 2v2 ${fmt(d.b, language)})`}>
                <div className="w-full rounded-t-[2px] bg-teal-500/90" style={{ height: `${(d.b / maxDay) * 100}%` }} />
                <div className="w-full bg-violet-500/90" style={{ height: `${(d.a / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>{sum.series[0].day.slice(5)}</span>
            <span>max {fmt(maxDay, language)}</span>
            <span>{sum.series[sum.series.length - 1].day.slice(5)}</span>
          </div>
        </Card>

        <Card>
          <p className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-200">
            <span>{de ? 'Stoßzeiten (deine Ortszeit)' : 'Busy hours (your local time)'}</span>
            <span className="text-[11px] font-normal text-slate-400">{de ? `Spitze: ${hourLabel(peak)}` : `Peak: ${hourLabel(peak)}`}</span>
          </p>
          <div className="flex h-36 items-end gap-[2px]" role="img" aria-label={de ? 'Spiele pro Tagesstunde' : 'Games per hour of the day'}>
            {local.map((v, h) => (
              <div key={h} className="flex h-full flex-1 flex-col justify-end" title={`${hourLabel(h)}: ${de ? 'Ø' : 'avg'} ${fmt(v, language)} ${de ? 'Spiele' : 'games'}`}>
                <div className={`w-full rounded-t-[2px] ${h === peak ? 'bg-gold' : 'bg-accent/80'}`} style={{ height: `${(v / maxHour) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </Card>
      </div>
    </section>
  )
}
