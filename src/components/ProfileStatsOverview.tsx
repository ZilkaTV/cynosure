import { useEffect, useState } from 'react'
import type { MemberStats } from '../lib/stats'
import { isFfa, isTeam, is1v1 } from '../lib/stats'
import type { PlayerGame } from '../lib/openfront'
import { useLanguage } from '../i18n/LanguageContext'

type Mode = 'ffa' | 'team' | 'one'

const MODE_STYLE: Record<Mode, { text: string; bg: string; hex: string }> = {
  ffa: { text: 'text-signal-red', bg: 'bg-signal-red/10', hex: '#f0556b' },
  team: { text: 'text-signal-blue', bg: 'bg-signal-blue/10', hex: '#5b9dff' },
  one: { text: 'text-signal-green', bg: 'bg-signal-green/10', hex: '#33d17a' },
}

function modeOf(g: PlayerGame): Mode | null {
  if (is1v1(g)) return 'one'
  if (isTeam(g)) return 'team'
  if (isFfa(g)) return 'ffa'
  return null
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

function fmtCompact(n: number | null): string {
  if (n == null) return '-'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

function fmtPercent(n: number | null): string {
  return n == null ? '-' : `${n.toFixed(1)}%`
}

/** Grey base ring with a green wins arc drawn over the losses-red backing - avoids a chart lib for one shape. */
function Donut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses
  const r = 40
  const circumference = 2 * Math.PI * r
  const winFrac = total > 0 ? wins / total : 0
  const winLen = circumference * winFrac
  return (
    <svg viewBox="0 0 100 100" width={112} height={112} className="-rotate-90 shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(63 71 87)" strokeWidth="14" />
      {total > 0 && (
        <>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f0556b" strokeWidth="14" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#33d17a"
            strokeWidth="14"
            strokeDasharray={`${winLen} ${circumference - winLen}`}
          />
        </>
      )}
    </svg>
  )
}

/**
 * Combined Games/Wins/Losses donut + per-mode (FFA/Team/1v1) average stats,
 * computed over whatever recent-games window the caller passes in. Max Tiles
 * needs each game's own replay-derived tile share (see replaySim.ts,
 * getGameTileStats), so it's fetched here per game id and filled in as it
 * resolves rather than blocking the rest of the card on it.
 */
export default function ProfileStatsOverview({ member, games }: { member: MemberStats; games: PlayerGame[] }) {
  const { t } = useLanguage()
  const [tilePercent, setTilePercent] = useState<Record<string, number | null>>({})

  useEffect(() => {
    let cancelled = false
    const ids = games.map((g) => g.gameId)
    if (ids.length === 0) return
    import('../lib/replaySim').then(({ getGameTileStats }) => {
      for (const id of ids) {
        const clientId = member.detailByGame[id]?.clientId
        if (!clientId) continue
        getGameTileStats(id).then((stats) => {
          if (cancelled) return
          setTilePercent((prev) => ({ ...prev, [id]: stats?.maxPercent[clientId] ?? null }))
        })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.map((g) => g.gameId).join(','), member.publicId])

  const decided = games.filter((g) => g.result === 'victory' || g.result === 'defeat')
  const wins = decided.filter((g) => g.result === 'victory').length
  const losses = decided.filter((g) => g.result === 'defeat').length

  const modes: Mode[] = ['ffa', 'team', 'one']
  const modeLabel: Record<Mode, string> = {
    ffa: t.memberProfile.statsModeFfa,
    team: t.memberProfile.statsModeTeam,
    one: t.memberProfile.statsMode1v1,
  }

  const byMode = modes.map((mode) => {
    const modeGames = games.filter((g) => modeOf(g) === mode)
    const details = modeGames
      .map((g) => member.detailByGame[g.gameId])
      .filter((d): d is NonNullable<typeof d> => !!d)
    const tiles = modeGames.map((g) => tilePercent[g.gameId]).filter((v): v is number => v != null)
    return {
      mode,
      count: modeGames.length,
      avgKills: avg(details.map((d) => d.kills)),
      avgTroopsOut: avg(details.map((d) => d.troopsOutPerMin)),
      avgTroopsIn: avg(details.map((d) => d.troopsInPerMin)),
      avgGold: avg(details.map((d) => d.goldPerMin)),
      avgMaxTiles: avg(tiles),
    }
  })

  return (
    <div className="panel flex flex-col items-center gap-6 p-5 sm:flex-row">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Donut wins={wins} losses={losses} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-xl font-bold text-white">{decided.length}</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.memberProfile.statsGames}</span>
          </div>
        </div>
        <div className="flex gap-4 text-xs font-medium">
          <span className="text-signal-green">
            {t.memberProfile.statsWins}: {wins}
          </span>
          <span className="text-signal-red">
            {t.memberProfile.statsLosses}: {losses}
          </span>
        </div>
      </div>
      <div className="grid w-full flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
        {byMode.map(({ mode, count, avgKills, avgTroopsOut, avgTroopsIn, avgGold, avgMaxTiles }) => (
          <div key={mode} className={`rounded-xl border border-base-700 ${MODE_STYLE[mode].bg} p-3`}>
            <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${MODE_STYLE[mode].text}`}>
              {modeLabel[mode]} <span className="text-slate-500">({count})</span>
            </p>
            {count === 0 ? (
              <p className="text-xs text-slate-500">{t.memberProfile.statsNoGames}</p>
            ) : (
              <dl className="space-y-1 text-xs text-slate-300">
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.memberProfile.statsAvgKills}</dt>
                  <dd className="font-mono">{fmtCompact(avgKills)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.memberProfile.statsAvgTroopsOut}</dt>
                  <dd className="font-mono">{fmtCompact(avgTroopsOut)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.memberProfile.statsAvgTroopsIn}</dt>
                  <dd className="font-mono">{fmtCompact(avgTroopsIn)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.memberProfile.statsAvgGoldMin}</dt>
                  <dd className="font-mono">{fmtCompact(avgGold)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.memberProfile.statsAvgMaxTiles}</dt>
                  <dd className="font-mono">{fmtPercent(avgMaxTiles)}</dd>
                </div>
              </dl>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
