import { useMemo } from 'react'
import { is1v1, is2v2, isFfa, isTeam } from '../lib/stats'
import { deriveNumTeams, type PlayerGame } from '../lib/openfront'
import { useLanguage } from '../i18n/LanguageContext'

interface Tally {
  wins: number
  losses: number
  other: number
}

const empty = (): Tally => ({ wins: 0, losses: 0, other: 0 })

function add(t: Tally, g: PlayerGame) {
  if (g.result === 'victory') t.wins++
  else if (g.result === 'defeat') t.losses++
  else t.other++
}

const games = (t: Tally) => t.wins + t.losses + t.other
const pct = (t: Tally) => (t.wins + t.losses > 0 ? (100 * t.wins) / (t.wins + t.losses) : null)

function Row({ label, tally, hint }: { label: string; tally: Tally; hint?: string }) {
  const decided = tally.wins + tally.losses
  const winShare = decided > 0 ? (100 * tally.wins) / decided : 0
  const p = pct(tally)
  return (
    <div className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate text-slate-300" title={hint}>
        {label}
      </span>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-base-700" aria-hidden="true">
        {decided > 0 && (
          <>
            <div className="bg-signal-green" style={{ width: `${winShare}%` }} />
            <div className="bg-signal-red/60" style={{ width: `${100 - winShare}%` }} />
          </>
        )}
      </div>
      <span className="whitespace-nowrap text-right tabular-nums text-slate-400">
        <span className="text-signal-green">{tally.wins}</span>-<span className="text-signal-red">{tally.losses}</span>
        <span className="ml-2 inline-block w-12 text-slate-200">{p == null ? '-' : `${p.toFixed(0)}%`}</span>
      </span>
    </div>
  )
}

/**
 * "Games (total)" split by category, plus the win rate by number of teams in team games - both from the
 * member's cached [CYN] game list, so no extra request.
 */
export default function GameBreakdown({ games: list }: { games: PlayerGame[] }) {
  const { t } = useLanguage()
  const { cats, byTeams, total } = useMemo(() => {
    const cats = { ffa: empty(), team: empty(), one: empty(), two: empty() }
    const byTeams = new Map<number, Tally>()
    for (const g of list) {
      if (is1v1(g)) add(cats.one, g)
      else if (is2v2(g)) add(cats.two, g)
      else if (isTeam(g)) {
        add(cats.team, g)
        const n = deriveNumTeams(g.playerTeams, g.totalPlayers)
        if (n != null) {
          const tally = byTeams.get(n) ?? empty()
          add(tally, g)
          byTeams.set(n, tally)
        }
      } else if (isFfa(g)) add(cats.ffa, g)
    }
    return { cats, byTeams: [...byTeams.entries()].sort((a, b) => a[0] - b[0]), total: list.length }
  }, [list])

  const rows: [string, Tally][] = [
    [t.memberProfile.catFfa, cats.ffa],
    [t.memberProfile.catTeam, cats.team],
    [t.memberProfile.cat1v1, cats.one],
    [t.memberProfile.cat2v2, cats.two],
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-base font-bold text-white">{t.memberProfile.breakdownTitle}</h3>
          <span className="text-sm text-slate-400">{t.memberProfile.breakdownTotal(total)}</span>
        </div>
        {rows.map(([label, tally]) => (
          <Row key={label} label={`${label} (${games(tally)})`} tally={tally} />
        ))}
        <p className="text-xs text-slate-500">{t.memberProfile.breakdownNote}</p>
      </div>

      <div className="panel space-y-3 p-5">
        <h3 className="font-display text-base font-bold text-white">{t.memberProfile.byTeamsTitle}</h3>
        {byTeams.length === 0 ? (
          <p className="text-sm text-slate-500">{t.memberProfile.byTeamsEmpty}</p>
        ) : (
          byTeams.map(([n, tally]) => <Row key={n} label={`${t.memberProfile.teamsLabel(n)} (${games(tally)})`} tally={tally} />)
        )}
        <p className="text-xs text-slate-500">{t.memberProfile.byTeamsNote}</p>
      </div>
    </div>
  )
}
