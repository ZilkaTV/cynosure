import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { Card, EloDelta, LastUpdated, SectionHeading, Spinner } from '../components/ui'
import {
  availableMonths,
  currentMonthKey,
  ffaBucket,
  monthLabel,
  oneVoneBucket,
  teamBucket,
  type MemberStats,
} from '../lib/stats'

type Variant = 'ffa' | 'team' | '1v1'

const meta: Record<Variant, { eyebrow: string; title: string; rules: React.ReactNode }> = {
  ffa: {
    eyebrow: 'Monthly',
    title: 'FFA',
    rules: (
      <>
        <li><span className="font-semibold text-white">1 point</span> per win.</li>
        <li>
          <span className="font-semibold text-white">Win streak (2+ in a row, no loss between):</span> every
          win in the streak is worth <span className="font-semibold text-white">2 points</span>.
        </li>
      </>
    ),
  },
  team: {
    eyebrow: 'Monthly',
    title: 'Team',
    rules: (
      <>
        <li><span className="font-semibold text-white">1 point</span> per win.</li>
        <li>
          <span className="font-semibold text-white">2 points</span> for a win played together with another
          [{CLAN_TAG}]-tagged player.
        </li>
      </>
    ),
  },
  '1v1': {
    eyebrow: 'Monthly',
    title: '1v1 Ranked',
    rules: (
      <>
        <li>No points here — the <span className="font-semibold text-white">Elo Δ</span> (change this month)
          is the ranking.</li>
      </>
    ),
  },
}

function RulesBox({ variant }: { variant: Variant }) {
  return (
    <div className="rounded-xl border border-base-600 bg-base-850/60 px-5 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">Scoring</p>
      <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">{meta[variant].rules}</ul>
    </div>
  )
}

export default function Monthly({ variant }: { variant: Variant }) {
  const { profile } = useProfile()
  const { data, loading, refreshing, error, lastUpdated, refresh } = useRoster(!!profile)
  const [month, setMonth] = useState<string>(currentMonthKey())

  const months = useMemo(() => (data ? availableMonths(data.members) : [currentMonthKey()]), [data])

  if (!profile) return <RegistrationGate />

  const coop = data?.coopByGame ?? {}

  // Build + sort rows for the selected month.
  type Row = { m: MemberStats; wins: number; losses: number; points: number; eloDelta: number | null }
  const rows: Row[] = (data?.members ?? []).map((m) => {
    if (variant === 'ffa') {
      const b = ffaBucket(m.cynGames, month)
      return { m, ...b, eloDelta: null }
    }
    if (variant === 'team') {
      const b = teamBucket(m.cynGames, month, coop)
      return { m, ...b, eloDelta: null }
    }
    const b = oneVoneBucket(m.cynGames, month)
    return { m, wins: b.wins, losses: b.losses, points: 0, eloDelta: m.eloMonthDelta }
  })
  rows.sort((a, b) =>
    variant === '1v1'
      ? (b.eloDelta ?? -9999) - (a.eloDelta ?? -9999) || b.wins - a.wins
      : b.points - a.points || b.wins - a.wins,
  )

  const isCurrent = month === currentMonthKey()

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={`${meta[variant].eyebrow} · ${monthLabel(month)}`} title={meta[variant].title} />

        {/* month archive selector */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <label className="text-slate-400">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-white focus:border-accent focus:outline-none"
          >
            {months.map((mk) => (
              <option key={mk} value={mk}>
                {monthLabel(mk)}
                {mk === currentMonthKey() ? ' (current)' : ''}
              </option>
            ))}
          </select>
          {!isCurrent && <span className="text-xs text-slate-500">archived</span>}
        </div>

        <RulesBox variant={variant} />
      </section>

      <TagNotice />

      <section className="space-y-4">
        {loading && <Spinner label="Pulling live data from OpenFront…" />}
        {error && !data && <Card className="text-center text-sm text-signal-red">Couldn’t load stats: {error}</Card>}
        {data && (
          <>
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-left font-semibold">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Name</th>
                      <th className="px-4 py-3 text-right font-semibold">Wins</th>
                      <th className="px-4 py-3 text-right font-semibold">Losses</th>
                      {variant === '1v1' ? (
                        <>
                          <th className="px-4 py-3 text-right font-semibold">Elo Δ</th>
                          <th className="px-4 py-3 text-right font-semibold">Current Elo</th>
                        </>
                      ) : (
                        <th className="px-4 py-3 text-right font-semibold">Points</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                        <td className="px-4 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3">
                          <Link to={`/member/${r.m.publicId}`} className="font-medium text-white hover:text-accent-light">
                            {r.m.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                        {variant === '1v1' ? (
                          <>
                            <td className="px-4 py-3 text-right font-display font-bold">
                              <EloDelta delta={r.eloDelta} />
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gold-light">
                              {r.m.elo ?? <span className="text-slate-600">—</span>}
                            </td>
                          </>
                        ) : (
                          <td className="px-4 py-3 text-right font-display text-lg font-bold text-accent-light">{r.points}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            {variant === '1v1' && (
              <p className="text-center text-xs text-slate-500">
                OpenFront publishes no elo history, so “Elo Δ” is measured from the first time this site saw
                each member’s elo in {monthLabel(month)}. Current elo is live (global top 100 only).
              </p>
            )}
          </>
        )}
      </section>
    </StatsShell>
  )
}
