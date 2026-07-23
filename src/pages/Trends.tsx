import { useEffect, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { Card, MemberNameLink, SectionHeading, Spinner } from '../components/ui'
import TrendChart from '../components/TrendChart'
import { fetchAllMemberTrends, fetchClanTrend, type ClanTrendPoint, type SnapshotPoint } from '../lib/trends'
import { useLanguage } from '../i18n/LanguageContext'

const TREND_DAYS = 30
const PAGE_SIZE = 12

export default function Trends() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading } = useRoster(!!profile)
  const [clanTrend, setClanTrend] = useState<ClanTrendPoint[]>([])
  const [memberTrends, setMemberTrends] = useState<Record<string, SnapshotPoint[]>>({})
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    let alive = true
    Promise.all([fetchClanTrend(TREND_DAYS), fetchAllMemberTrends(TREND_DAYS)]).then(([clan, members]) => {
      if (!alive) return
      setClanTrend(clan)
      setMemberTrends(members)
      setTrendsLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!profile) return <RegistrationGate />
  if (loading) return <Spinner label={t.common.loadingLiveData} />

  const members = [...(data?.members ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const remaining = filteredMembers.length - visibleMembers.length

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={t.trends.eyebrow} title={t.trends.clanTitle} />
        {trendsLoading ? (
          <Spinner label={t.common.loadingLiveData} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.trends.clanMembersLabel}</p>
              <TrendChart
                points={clanTrend.map((p) => ({ date: p.date, value: p.members }))}
                color="#38bdf8"
                emptyLabel={t.trends.emptyLabel}
              />
            </Card>
            <Card>
              <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.trends.clanWinsLabel}</p>
              <TrendChart
                points={clanTrend.map((p) => ({ date: p.date, value: p.totalWins }))}
                color="#8b5cf6"
                emptyLabel={t.trends.emptyLabel}
              />
            </Card>
          </div>
        )}
      </section>

      <section className="mt-10 space-y-4">
        <SectionHeading center eyebrow={t.trends.membersEyebrow} title={t.trends.membersTitle} />
        {trendsLoading ? (
          <Spinner label={t.common.loadingLiveData} />
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setVisibleCount(PAGE_SIZE)
              }}
              placeholder={t.trends.searchPlaceholder}
              className="w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            {filteredMembers.length === 0 && <p className="text-center text-sm text-slate-500">{t.trends.noMembersFound}</p>}
            <div className="space-y-4">
              {visibleMembers.map((m) => {
                const trend = memberTrends[m.publicId] ?? []
                return (
                  <Card key={m.publicId}>
                    <MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} className="font-display text-lg font-bold text-white hover:text-accent-light" />
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.trends.eloLabel}</p>
                        <TrendChart
                          points={trend.map((p) => ({ date: p.date, value: p.elo }))}
                          color="#eab308"
                          height={72}
                          emptyLabel={t.trends.emptyLabel}
                        />
                      </div>
                      <div>
                        <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.trends.winsLabel}</p>
                        <TrendChart
                          points={trend.map((p) => ({ date: p.date, value: p.allWins }))}
                          color="#8b5cf6"
                          height={72}
                          emptyLabel={t.trends.emptyLabel}
                        />
                      </div>
                      <div>
                        <p className="text-center text-xs uppercase tracking-wide text-slate-400">{t.trends.xpLabel}</p>
                        <TrendChart
                          points={trend.map((p) => ({ date: p.date, value: p.xp }))}
                          color="#38bdf8"
                          height={72}
                          emptyLabel={t.trends.emptyLabel}
                        />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
            {remaining > 0 && (
              <div className="flex justify-center gap-3">
                <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="btn-ghost">
                  {t.trends.showMore(Math.min(remaining, PAGE_SIZE))}
                </button>
                <button onClick={() => setVisibleCount(filteredMembers.length)} className="btn-ghost">
                  {t.trends.showAll}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </StatsShell>
  )
}
