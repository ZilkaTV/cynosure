import { useEffect, useMemo, useState } from 'react'
import { Card, SectionHeading, StatCard, Spinner, MemberNameLink } from '../components/ui'
import TrendChart from '../components/TrendChart'
import { useLanguage } from '../i18n/LanguageContext'
import {
  useIsInnerCircle,
  getTodayMetrics,
  getMetricsHistory,
  getDiscordStatus,
  type DiscordStatus,
  metricsHistoryToCsv,
  type TodayMetrics,
  type DailyMetricsRow,
  getVisitors,
  type Visitors,
} from '../lib/metrics'
import { useSession } from '../lib/useSession'
import { useRoster } from '../lib/useRoster'

const QUIET_AFTER_DAYS = 14

const HISTORY_DAYS = 30

function downloadCsv(rows: DailyMetricsRow[]) {
  const csv = metricsHistoryToCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cyn-metrics-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function Metrics() {
  const { t } = useLanguage()
  const isInnerCircle = useIsInnerCircle()
  // cyn_metrics_daily/cyn_site_visits are readable only `to authenticated` -
  // useIsInnerCircle() alone can't tell a real signed-in session apart from
  // a locally-persisted profile with a stale/expired Supabase auth session
  // (the same underlying bug fixed for quest claims/chat), which would
  // otherwise read back as misleading all-zero metrics instead of a clear
  // reason. Checked separately here so that case gets its own message.
  const session = useSession()
  const { data: roster } = useRoster(isInnerCircle)
  const [metrics, setMetrics] = useState<TodayMetrics | null>(null)
  const [history, setHistory] = useState<DailyMetricsRow[] | null>(null)
  const [discordStatus, setDiscordStatus] = useState<Record<string, DiscordStatus> | null>(null)
  const [visitors, setVisitors] = useState<Visitors | null>(null)

  useEffect(() => {
    if (!isInnerCircle || !session) return
    getTodayMetrics().then(setMetrics)
    getMetricsHistory(HISTORY_DAYS).then(setHistory)
    getDiscordStatus().then(setDiscordStatus)
    getVisitors().then(setVisitors)
  }, [isInnerCircle, session])

  // Detection only, deliberately - no auto-DM. Research (today's daytime
  // loop) backs a personal, low-volume nudge as the right shape for
  // re-engaging a lapsing member, but an algorithm silently DMing real
  // people with no human in the loop risks false positives and reads as
  // spam/bot behavior - this surfaces the list to an Inner Circle member
  // instead, who decides whether/how to reach out.
  const quietMembers = useMemo(() => {
    const now = Date.now()
    return (roster?.members ?? [])
      .map((m) => ({ id: m.publicId, name: m.name, daysSince: m.lastGame ? Math.floor((now - new Date(m.lastGame).getTime()) / 86_400_000) : null }))
      .filter((m) => m.daysSince === null || m.daysSince >= QUIET_AFTER_DAYS)
      // Only people who are still on the Discord server and hold the Cynosure role.
      // Until the first sync filled the status table, nothing is filtered.
      .filter((m) => !discordStatus || Object.keys(discordStatus).length === 0 || (discordStatus[m.id]?.inGuild && discordStatus[m.id]?.hasCynRole))
      .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity))
  }, [roster, discordStatus])

  if (!isInnerCircle) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{t.metrics.innerCircleOnly}</p>
      </div>
    )
  }

  if (session === undefined) return <Spinner label={t.metrics.loading} />

  if (session === null) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{t.metrics.sessionExpired}</p>
      </div>
    )
  }

  if (!metrics) return <Spinner label={t.metrics.loading} />

  const joinConversionPercent =
    metrics.discordJoinsToday > 0 ? Math.round((metrics.clanRegistrationsToday / metrics.discordJoinsToday) * 100) : null

  // "Site visits today (members)" -> "members": the label of one side of the combined visits card.
  const paren = (label: string) => /(([^)]*))/.exec(label)?.[1] ?? label

  const visitorsWindow = (
    <div className="panel overflow-hidden">
      <div className="border-b border-base-700 px-4 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-gold">{t.metrics.visitorsTitle}</span>
        <p className="mt-0.5 text-xs text-slate-500">{t.metrics.visitorsSub}</p>
      </div>
      {([['today', t.metrics.visitorsToday], ['yesterday', t.metrics.visitorsYesterday]] as const).map(([key, label]) => (
        <details key={key} open={key === 'today'} className="group border-b border-base-700 last:border-0">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-white hover:bg-base-800/60">
            <span>
              {label} <span className="font-normal text-slate-500">({visitors ? visitors[key].length : '-'})</span>
            </span>
            <span aria-hidden="true" className="text-xs text-slate-500 transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="max-h-80 overflow-y-auto px-4 pb-3">
            {!visitors ? (
              <Spinner label={t.metrics.loading} />
            ) : visitors[key].length === 0 ? (
              <p className="py-3 text-center text-sm text-slate-500">{t.metrics.visitorsEmpty}</p>
            ) : (
              <ul className="divide-y divide-base-700">
                {visitors[key].map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                    <MemberNameLink publicId={m.id} name={m.name} className="text-white hover:text-accent-light" />
                    <span className="tabular-nums text-slate-400">{m.last ? new Date(m.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ))}
    </div>
  )

  const quietWindow = (
    <div className="panel overflow-hidden">
      <div className="border-b border-base-700 px-4 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-gold">{t.metrics.quietMembersTitle}</span>
        <p className="mt-0.5 text-xs text-slate-500">{t.metrics.quietMembersSub}</p>
      </div>
      <div className="max-h-[32rem] overflow-y-auto px-4 py-2">
        {!roster ? (
          <Spinner label={t.metrics.loading} />
        ) : quietMembers.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{t.metrics.quietMembersEmpty}</p>
        ) : (
          <ul className="divide-y divide-base-700">
            {quietMembers.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <MemberNameLink publicId={m.id} name={m.name} className="text-white hover:text-accent-light" />
                <span className="whitespace-nowrap text-slate-400">{m.daysSince === null ? t.metrics.quietMembersNever : t.metrics.quietMembersDaysAgo(m.daysSince)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <div className="mx-auto grid max-w-[110rem] gap-6 md:grid-cols-2 2xl:grid-cols-[300px_minmax(0,1fr)_300px] 2xl:gap-8">
      <aside className="order-2 2xl:order-none 2xl:col-start-1 2xl:row-start-1 2xl:self-start">{visitorsWindow}</aside>
      <aside className="order-3 2xl:order-none 2xl:col-start-3 2xl:row-start-1 2xl:self-start">{quietWindow}</aside>
    <div className="order-1 mx-auto w-full min-w-0 max-w-5xl md:col-span-2 2xl:order-none 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1">
      <SectionHeading eyebrow={t.metrics.eyebrow} title={t.metrics.title} center />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <StatCard
          label={t.metrics.siteVisitsMembers.replace(/s*(.*)$/, '')}
          value={metrics.siteVisitsMembers + metrics.siteVisitsAnon}
          sub={`${paren(t.metrics.siteVisitsMembers)}: ${metrics.siteVisitsMembers} · ${paren(t.metrics.siteVisitsAnon)}: ${metrics.siteVisitsAnon}`}
        />
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">{t.metrics.approximationNotice}</p>

      <div className="mt-10">
        <SectionHeading
          eyebrow={t.metrics.trendEyebrow}
          title={t.metrics.trendTitle(HISTORY_DAYS)}
          action={
            <button
              onClick={() => history && downloadCsv(history)}
              disabled={!history || history.length === 0}
              className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.metrics.downloadCsv}
            </button>
          }
        />
        {!history ? (
          <Spinner label={t.metrics.loading} />
        ) : history.length < 2 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t.metrics.trendEmpty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.metrics.memberCount}</p>
              <TrendChart points={history.map((r) => ({ date: r.day, value: r.memberCount }))} color="#38bdf8" emptyLabel={t.trends.emptyLabel} />
            </Card>
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.metrics.presenceCount}</p>
              <TrendChart points={history.map((r) => ({ date: r.day, value: r.presenceCount }))} color="#22c55e" emptyLabel={t.trends.emptyLabel} />
            </Card>
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.metrics.vcHoursToday}</p>
              <TrendChart points={history.map((r) => ({ date: r.day, value: r.vcHours }))} color="#8b5cf6" emptyLabel={t.trends.emptyLabel} />
            </Card>
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.metrics.publicMessages}</p>
              <TrendChart points={history.map((r) => ({ date: r.day, value: r.publicMessages }))} color="#f59e0b" emptyLabel={t.trends.emptyLabel} />
            </Card>
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.metrics.privateMessages}</p>
              <TrendChart points={history.map((r) => ({ date: r.day, value: r.privateMessages }))} color="#ec4899" emptyLabel={t.trends.emptyLabel} />
            </Card>
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.metrics.joinConversion}</p>
              <TrendChart
                points={history.map((r) => ({
                  date: r.day,
                  value: r.discordJoinsToday > 0 ? Math.round((r.clanRegistrationsToday / r.discordJoinsToday) * 100) : null,
                }))}
                color="#eab308"
                formatValue={(v) => `${Math.round(v)}%`}
                emptyLabel={t.trends.emptyLabel}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
    </div>
  )
}
