import { useEffect, useState } from 'react'
import { fetchLifetimeStats, type LifetimeStats } from '../lib/playerStats'
import { useLanguage } from '../i18n/LanguageContext'

const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-base-700 bg-base-850/60 p-3 text-center">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{title}</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </div>
  )
}

/**
 * Lifetime numbers from OpenFront's own player profile (all modes and difficulties added up). Eight headline
 * tiles are always visible; the full breakdown sits behind "more" so the profile stays readable.
 */
export default function OpenFrontStats({ publicId }: { publicId: string }) {
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

  if (stats === undefined) return <p className="text-center text-sm text-slate-500">{t.common.loadingLiveData}</p>
  if (stats === null || stats.games.total === 0) return <p className="text-center text-sm text-slate-500">{t.memberProfile.ofStatsUnavailable}</p>

  const s = stats
  const bombsLanded = s.bombs.abombLanded + s.bombs.hbombLanded + s.bombs.warheadsLanded
  const goldTotal = s.gold.workers + s.gold.war + s.gold.trade + s.gold.piracy + s.gold.trains

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t.memberProfile.ofGames} value={String(s.games.total)} sub={`${s.games.wins}-${s.games.losses}`} />
        <Tile label={t.memberProfile.ofTroopsSent} value={compact(s.attacks.sent)} sub={t.memberProfile.ofReceived(compact(s.attacks.received))} />
        <Tile label={t.memberProfile.ofBombs} value={String(bombsLanded)} sub={t.memberProfile.ofBombsLaunched(s.bombs.abombLaunched + s.bombs.hbombLaunched + s.bombs.mirvLaunched)} />
        <Tile label={t.memberProfile.ofGold} value={compact(goldTotal)} sub={t.memberProfile.ofGoldTrade(compact(s.gold.trade))} />
        <Tile label={t.memberProfile.ofTradeShips} value={compact(s.boats.tradeArrived)} sub={t.memberProfile.ofSentOf(compact(s.boats.tradeSent))} />
        <Tile label={t.memberProfile.ofTransports} value={compact(s.boats.transportArrived)} sub={t.memberProfile.ofSentOf(compact(s.boats.transportSent))} />
        <Tile label={t.memberProfile.ofBetrayals} value={String(s.betrayals)} />
        <Tile label={t.memberProfile.ofCities} value={compact(s.units.city ?? 0)} sub={t.memberProfile.ofBuilt} />
      </div>

      <details className="rounded-xl border border-base-700 bg-base-850/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">{t.memberProfile.ofMore}</summary>
        <div className="mt-4 space-y-5">
          <Group title={t.memberProfile.ofGroupAttacks}>
            <Tile label={t.memberProfile.ofTroopsSent} value={compact(s.attacks.sent)} />
            <Tile label={t.memberProfile.ofTroopsReceived} value={compact(s.attacks.received)} />
            <Tile label={t.memberProfile.ofTroopsCancelled} value={compact(s.attacks.cancelled)} />
            <Tile label={t.memberProfile.ofLargestAttack} value={compact(s.attacks.largestReceived)} />
          </Group>
          <Group title={t.memberProfile.ofGroupBombs}>
            <Tile label={t.memberProfile.ofAtom} value={`${s.bombs.abombLanded}`} sub={t.memberProfile.ofBombsLaunched(s.bombs.abombLaunched)} />
            <Tile label={t.memberProfile.ofHydrogen} value={`${s.bombs.hbombLanded}`} sub={t.memberProfile.ofBombsLaunched(s.bombs.hbombLaunched)} />
            <Tile label={t.memberProfile.ofMirv} value={String(s.bombs.warheadsLanded)} sub={t.memberProfile.ofBombsLaunched(s.bombs.mirvLaunched)} />
            <Tile label={t.memberProfile.ofIntercepted} value={String(s.bombs.intercepted)} />
          </Group>
          <Group title={t.memberProfile.ofGroupGold}>
            <Tile label={t.memberProfile.ofGoldWorkers} value={compact(s.gold.workers)} />
            <Tile label={t.memberProfile.ofGoldWar} value={compact(s.gold.war)} />
            <Tile label={t.memberProfile.ofGoldTrade2} value={compact(s.gold.trade)} />
            <Tile label={t.memberProfile.ofGoldPiracy} value={compact(s.gold.piracy)} />
            <Tile label={t.memberProfile.ofGoldTrains} value={compact(s.gold.trains)} />
          </Group>
          <Group title={t.memberProfile.ofGroupBuilt}>
            {Object.entries(s.units)
              .sort((a, b) => b[1] - a[1])
              .map(([unit, n]) => (
                <Tile key={unit} label={t.memberProfile.ofUnit[unit as keyof typeof t.memberProfile.ofUnit] ?? unit} value={compact(n)} />
              ))}
          </Group>
        </div>
      </details>
      <p className="text-center text-xs text-slate-500">{t.memberProfile.ofNote}</p>
    </div>
  )
}
