import { useEffect, useState } from 'react'
import { Card, SectionHeading, StatCard } from './ui'
import { fetchTopClanLeaderboard, forecastWinScoreLoss, type TopClanEntry } from '../lib/clanScore'
import { CLAN_TAG } from '../config'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * How much Win Score a clan loses to OpenFront's time decay if it plays no further team games (30-day half-life).
 * Shown on the points planner; it used to live on the Metrics page.
 */
export default function DecayForecast() {
  const { t } = useLanguage()
  const [topClans, setTopClans] = useState<TopClanEntry[]>([])
  const [clanTag, setClanTag] = useState('')
  const [days, setDays] = useState(1)

  useEffect(() => {
    let alive = true
    fetchTopClanLeaderboard()
      .then((top) => {
        if (!alive) return
        setTopClans(top)
        // Our own clan by default, not whoever is #1; falls back to #1 only if CYN is not in the list.
        const defaultTag = top.some((c) => c.clanTag === CLAN_TAG) ? CLAN_TAG : top[0]?.clanTag
        if (defaultTag) setClanTag((prev) => prev || defaultTag)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (topClans.length === 0) return null
  const clan = topClans.find((c) => c.clanTag === clanTag)
  const loss = clan ? forecastWinScoreLoss(clan.weightedWins, days) : 0

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading center eyebrow={t.planner.decayEyebrow} title={t.planner.decayTitle} />
      <Card>
        <p className="mb-4 text-center text-sm text-slate-400">{t.planner.decayText}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <select
            aria-label={t.planner.decayClan}
            value={clanTag}
            onChange={(e) => setClanTag(e.target.value)}
            className="rounded-lg border border-base-600 bg-base-800 px-3.5 py-2 text-sm text-white focus:border-accent focus:outline-none"
          >
            {topClans.map((c, i) => (
              <option key={c.clanTag} value={c.clanTag}>
                #{i + 1} [{c.clanTag}]
              </option>
            ))}
          </select>
          <select
            aria-label={t.planner.decayWindow}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-base-600 bg-base-800 px-3.5 py-2 text-sm text-white focus:border-accent focus:outline-none"
          >
            <option value={1}>{t.planner.decayNextDay}</option>
            <option value={7}>{t.planner.decayNextWeek}</option>
            <option value={30}>{t.planner.decayNextMonth}</option>
          </select>
        </div>
        {clan && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatCard label={t.planner.decayNow} value={clan.weightedWins.toFixed(1)} accent="plain" />
            <StatCard label={t.planner.decayLost} value={`-${loss.toFixed(1)}`} accent="gold" />
            <StatCard label={t.planner.decayProjected} value={(clan.weightedWins - loss).toFixed(1)} accent="purple" />
          </div>
        )}
      </Card>
    </div>
  )
}
