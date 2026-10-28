import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useSharedRoster } from '../lib/access'
import { fetchClanLeaderboardEntry, isClanScoreEligible } from '../lib/clanScore'
import { computeClanStreak } from '../lib/streak'
import { fetchMostImproved, type MostImproved } from '../lib/trends'
import { cleanDisplayName } from '../lib/displayName'
import { useLanguage } from '../i18n/LanguageContext'
import { ClanCarousel, type CarouselSlide } from './ClanCarousel'

const mini = (label: string, value: ReactNode, cls: string) => (
  <div>
    <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`font-display text-xl font-bold ${cls}`}>{value}</p>
  </div>
)

/**
 * The clan window of the sidebar (on every page that has the sidebar): clan totals and clan Elo, games this week with the clan streak,
 * and this week's most improved members. Reads the roster that is shared on the page (src/lib/access.ts), so it adds no extra load.
 */
export function ClanWindow() {
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const roster = useSharedRoster()
  const [mostImproved, setMostImproved] = useState<MostImproved[]>([])
  const [clanElo, setClanElo] = useState<number | null>(null)
  const signedIn = !!profile

  useEffect(() => {
    if (!signedIn) return
    fetchMostImproved().then(setMostImproved)
    fetchClanLeaderboardEntry().then((e) => setClanElo(e?.elo ?? null))
  }, [signedIn])

  // Clan-wide streak and "games this week" come straight from the members' game lists (same as the overview used before).
  const games = useMemo(() => (roster?.members ?? []).flatMap((m) => m.cynGames), [roster])
  const streak = useMemo(() => computeClanStreak(games), [games])
  const weeklyGameCount = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000
    const seen = new Set<string>()
    for (const g of games) {
      if (g.type === 'Private' || !isClanScoreEligible(g) || new Date(g.start).getTime() < since) continue
      seen.add(g.gameId)
    }
    return seen.size
  }, [games])

  if (!profile) return null

  const totals = roster?.totals
  // Nobody without a CYN game in the last 30 days (a catch-up of old games is no real improvement).
  const visibleMostImproved = mostImproved.filter((mi) => {
    const member = roster?.members.find((m) => m.publicId === mi.openfrontId)
    return member && member.gamesLast30d > 0
  })

  const slides: CarouselSlide[] = [
    {
      key: 'totals',
      title: 'Clan',
      node: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {mini(t.home.statMembers, totals ? totals.members : '…', 'text-white')}
          {mini('Clan Elo', clanElo ?? '…', 'text-gold-light')}
          {mini(t.home.stat1v1Wins, totals ? totals.rankedWins : '…', 'text-accent-light')}
          {mini(t.home.stat2v2Wins, totals ? totals.twoVTwoWins : '…', 'text-accent-light')}
          {mini(t.home.statTeamWins, totals ? totals.teamWins : '…', 'text-accent-light')}
          {mini(t.home.statAllWins, totals ? totals.allWins : '…', 'text-gold-light')}
        </div>
      ),
    },
    {
      key: 'pulse',
      title: language === 'de' ? 'Aktivität' : 'Activity',
      node: (
        <div className="flex flex-col items-center gap-3 text-center">
          <div>
            <p className="font-display text-4xl font-bold text-gold-light">{weeklyGameCount}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{t.home.weeklyGamesPulse(CLAN_TAG, weeklyGameCount).replace(/^\d+\s*/, '')}</p>
          </div>
          <div className="h-px w-16 bg-base-600" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.home.streakTitle}</p>
            <p className="font-display text-2xl font-bold text-accent-light">{streak.currentDays > 0 ? t.home.streakDays(streak.currentDays) : '—'}</p>
            <p className="mt-0.5 text-xs text-slate-500">{streak.currentDays > 0 ? t.home.streakLongest(streak.longestDays) : t.home.streakNone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'improved',
      title: t.home.mostImprovedTitle,
      node:
        visibleMostImproved.length === 0 ? (
          <p className="text-sm text-slate-500">{t.home.mostImprovedEmpty}</p>
        ) : (
          <ul className="space-y-1">
            {visibleMostImproved.map((mi) => {
              const member = roster?.members.find((m) => m.publicId === mi.openfrontId)
              return (
                <li key={mi.openfrontId} className="flex items-center justify-between text-sm">
                  <span className="text-white">{member ? cleanDisplayName(member.name) : mi.openfrontId}</span>
                  <span className="font-display font-bold text-gold-light">{t.home.mostImprovedWins(mi.winsDelta)}</span>
                </li>
              )
            })}
          </ul>
        ),
    },
  ]

  return <ClanCarousel slides={slides} />
}
