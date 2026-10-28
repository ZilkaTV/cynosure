import { useEffect, useState, type ReactNode } from 'react'
import { ClanCarousel, type CarouselSlide } from './ClanCarousel'
import { Tile, compact } from './OpenFrontStats'
import { fetchLifetimeStats, type LifetimeStats } from '../lib/playerStats'
import type { MemberStats } from '../lib/stats'
import { CLAN_TAG } from '../config'
import { useLanguage } from '../i18n/LanguageContext'

const stat = (label: string, value: ReactNode, cls: string, sub?: string) => (
  <div>
    <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`font-display text-xl font-bold ${cls}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
  </div>
)

/** Window for the left of the profile: the member's career with the [CYN] tag, one topic per slide (Elo, wins, games). */
export function CareerWindow({ m }: { m: MemberStats }) {
  const { t, language } = useLanguage()
  const de = language === 'de'
  const slides: CarouselSlide[] = [
    {
      key: 'elo',
      title: 'Elo',
      node: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {stat(t.memberProfile.stat1v1Elo, m.elo ?? '-', 'text-gold-light', m.peakElo ? t.memberProfile.peakPrefix(m.peakElo) : undefined)}
          {stat(t.memberProfile.stat2v2Elo, m.elo2v2 ?? '-', 'text-gold-light', m.peakElo2v2 ? t.memberProfile.peakPrefix(m.peakElo2v2) : undefined)}
        </div>
      ),
    },
    {
      key: 'wins',
      title: de ? 'Siege' : 'Wins',
      node: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {stat(t.memberProfile.statFfaWins, m.ffaWins, 'text-accent-light')}
          {stat(t.memberProfile.statTeamWins, m.teamWins, 'text-accent-light')}
          {stat(t.memberProfile.stat1v1Wins, m.rankedWins, 'text-accent-light')}
          {stat(t.memberProfile.stat2v2Wins, m.twoVTwoWins, 'text-accent-light')}
          <div className="col-span-2 text-center">{stat(t.memberProfile.statAllWins, m.allWins, 'text-gold-light')}</div>
        </div>
      ),
    },
    {
      key: 'games',
      title: de ? 'Spiele' : 'Games',
      node: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {stat(t.memberProfile.statGames30d, m.gamesLast30d, 'text-white')}
          {stat(t.memberProfile.statGamesTotal, m.clanGamesTotal, 'text-white')}
        </div>
      ),
    },
  ]
  return <ClanCarousel slides={slides} heading={t.memberProfile.careerTitle(CLAN_TAG)} />
}

function lifetimeSlides(s: LifetimeStats, t: ReturnType<typeof useLanguage>['t']): CarouselSlide[] {
  const bombsLanded = s.bombs.abombLanded + s.bombs.hbombLanded + s.bombs.warheadsLanded
  const goldTotal = s.gold.workers + s.gold.war + s.gold.trade + s.gold.piracy + s.gold.trains
  const grid = (children: ReactNode) => <div className="grid grid-cols-2 gap-2">{children}</div>
  const units = Object.entries(s.units).sort((a, b) => b[1] - a[1])
  return [
    {
      key: 'overview',
      title: t.memberProfile.ofGames,
      node: grid(
        <>
          <Tile label={t.memberProfile.ofGames} value={String(s.games.total)} sub={`${s.games.wins}-${s.games.losses}`} />
          <Tile label={t.memberProfile.ofBetrayals} value={String(s.betrayals)} />
          <Tile label={t.memberProfile.ofGold} value={compact(goldTotal)} sub={t.memberProfile.ofGoldTrade(compact(s.gold.trade))} />
          <Tile label={t.memberProfile.ofCities} value={compact(s.units.city ?? 0)} sub={t.memberProfile.ofBuilt} />
        </>,
      ),
    },
    {
      key: 'attacks',
      title: t.memberProfile.ofGroupAttacks,
      node: grid(
        <>
          <Tile label={t.memberProfile.ofTroopsSent} value={compact(s.attacks.sent)} />
          <Tile label={t.memberProfile.ofTroopsReceived} value={compact(s.attacks.received)} />
          <Tile label={t.memberProfile.ofTroopsCancelled} value={compact(s.attacks.cancelled)} />
          <Tile label={t.memberProfile.ofLargestAttack} value={compact(s.attacks.largestReceived)} />
        </>,
      ),
    },
    {
      key: 'bombs',
      title: t.memberProfile.ofGroupBombs,
      node: grid(
        <>
          <Tile label={t.memberProfile.ofAtom} value={`${s.bombs.abombLanded}`} sub={t.memberProfile.ofBombsLaunched(s.bombs.abombLaunched)} />
          <Tile label={t.memberProfile.ofHydrogen} value={`${s.bombs.hbombLanded}`} sub={t.memberProfile.ofBombsLaunched(s.bombs.hbombLaunched)} />
          <Tile label={t.memberProfile.ofMirv} value={String(s.bombs.warheadsLanded)} sub={t.memberProfile.ofBombsLaunched(s.bombs.mirvLaunched)} />
          <Tile label={t.memberProfile.ofIntercepted} value={String(s.bombs.intercepted)} sub={`${bombsLanded}`} />
        </>,
      ),
    },
    {
      key: 'gold',
      title: t.memberProfile.ofGroupGold,
      node: grid(
        <>
          <Tile label={t.memberProfile.ofGoldWorkers} value={compact(s.gold.workers)} />
          <Tile label={t.memberProfile.ofGoldWar} value={compact(s.gold.war)} />
          <Tile label={t.memberProfile.ofGoldTrade2} value={compact(s.gold.trade)} />
          <Tile label={t.memberProfile.ofGoldPiracy} value={compact(s.gold.piracy)} />
          <Tile label={t.memberProfile.ofGoldTrains} value={compact(s.gold.trains)} />
        </>,
      ),
    },
    {
      key: 'boats',
      title: t.memberProfile.ofTradeShips,
      node: grid(
        <>
          <Tile label={t.memberProfile.ofTradeShips} value={compact(s.boats.tradeArrived)} sub={t.memberProfile.ofSentOf(compact(s.boats.tradeSent))} />
          <Tile label={t.memberProfile.ofTransports} value={compact(s.boats.transportArrived)} sub={t.memberProfile.ofSentOf(compact(s.boats.transportSent))} />
        </>,
      ),
    },
    {
      key: 'built',
      title: t.memberProfile.ofGroupBuilt,
      node: grid(
        units.slice(0, 8).map(([unit, n]) => (
          <Tile key={unit} label={t.memberProfile.ofUnit[unit as keyof typeof t.memberProfile.ofUnit] ?? unit} value={compact(n)} />
        )),
      ),
    },
  ]
}

/** Window for the right of the profile: OpenFront's own lifetime numbers of the player (all modes added up), one topic per slide. */
export function LifetimeWindow({ publicId }: { publicId: string }) {
  const { t } = useLanguage()
  const [stats, setStats] = useState<LifetimeStats | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    setStats(undefined)
    fetchLifetimeStats(publicId).then((s) => alive && setStats(s))
    return () => {
      alive = false
    }
  }, [publicId])

  if (stats === undefined) return <p className="panel px-4 py-6 text-center text-sm text-slate-500">{t.common.loadingLiveData}</p>
  if (stats === null || stats.games.total === 0) return <p className="panel px-4 py-6 text-center text-sm text-slate-500">{t.memberProfile.ofStatsUnavailable}</p>
  return (
    <div className="space-y-2">
      <ClanCarousel slides={lifetimeSlides(stats, t)} heading={t.memberProfile.ofStatsTitle} />
      <p className="text-center text-[11px] text-slate-500">{t.memberProfile.ofNote}</p>
    </div>
  )
}
