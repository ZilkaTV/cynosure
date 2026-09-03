import { useEffect, useState } from 'react'
import { SectionHeading, StatCard, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { useIsInnerCircle, getTodayMetrics, type TodayMetrics } from '../lib/metrics'

export default function Metrics() {
  const { t } = useLanguage()
  const isInnerCircle = useIsInnerCircle()
  const [metrics, setMetrics] = useState<TodayMetrics | null>(null)

  useEffect(() => {
    if (!isInnerCircle) return
    getTodayMetrics().then(setMetrics)
  }, [isInnerCircle])

  if (!isInnerCircle) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{t.metrics.innerCircleOnly}</p>
      </div>
    )
  }

  if (!metrics) return <Spinner label={t.metrics.loading} />

  const joinConversionPercent =
    metrics.discordJoinsToday > 0 ? Math.round((metrics.clanRegistrationsToday / metrics.discordJoinsToday) * 100) : null

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeading eyebrow={t.metrics.eyebrow} title={t.metrics.title} center />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t.metrics.memberCount} value={metrics.memberCount ?? '-'} />
        <StatCard label={t.metrics.presenceCount} value={metrics.presenceCount ?? '-'} />
        <StatCard label={t.metrics.vcActiveToday} value={metrics.vcActiveToday} />
        <StatCard label={t.metrics.vcHoursToday} value={metrics.vcHoursToday} />
        <StatCard label={t.metrics.publicMessages} value={metrics.publicMessages} />
        <StatCard label={t.metrics.privateMessages} value={metrics.privateMessages} />
        <StatCard
          label={t.metrics.joinConversion}
          value={joinConversionPercent === null ? '-' : `${joinConversionPercent}%`}
          sub={t.metrics.joinConversionSub(metrics.clanRegistrationsToday, metrics.discordJoinsToday)}
        />
        <StatCard label={t.metrics.siteVisitsMembers} value={metrics.siteVisitsMembers} />
        <StatCard label={t.metrics.siteVisitsAnon} value={metrics.siteVisitsAnon} />
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">{t.metrics.approximationNotice}</p>
    </div>
  )
}
