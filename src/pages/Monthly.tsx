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
  ffaMonthly,
  monthLabel,
  oneVoneBucket,
  teamMonthly,
  type MemberStats,
} from '../lib/stats'

type Variant = 'ffa' | 'team' | '1v1'

function fmtGold(n: number | null): string {
  if (n == null) return '-'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${Math.round(n)}`
}

const rules: Partial<Record<Variant, React.ReactNode>> = {
  ffa: (
    <>
      <li><span className="font-semibold text-white">1 point</span> per win.</li>
      <li>
        <span className="font-semibold text-white">Win streak (2+ in a row, no loss between):</span> every win
        in the streak is worth <span className="font-semibold text-white">2 points</span>.
      </li>
    </>
  ),
  team: (
    <>
      <li><span className="font-semibold text-white">1 point</span> per win.</li>
      <li>
        <span className="font-semibold text-white">2 points</span> for a win played with another
        [{CLAN_TAG}]-tagged player.
      </li>
    </>
  ),
}

interface Leader {
  name: string
  value: number
}

/** A "title" earned by the monthly leader in one category, showing their number. */
function TitleCard({ icon, title, metric, leader, fmt }: { icon: string; title: string; metric: string; leader: Leader | null; fmt?: (n: number) => string }) {
  const format = fmt ?? ((n: number) => String(n))
  return (
    <div className={`rounded-xl border px-4 py-3 text-center ${leader ? 'border-gold/40 bg-gold/10' : 'border-base-700 bg-base-850/40'}`}>
      <div className="text-xl">{icon}</div>
      <p className="font-display text-sm font-bold text-gold-light">{title}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{metric}</p>
      <p className="mt-1 truncate text-sm font-medium text-white">{leader ? leader.name : '-'}</p>
      {leader && <p className="text-xs font-semibold text-accent-light">{format(leader.value)}</p>}
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
  const members = data?.members ?? []
  const isCurrent = month === currentMonthKey()

  // Leader of a metric (highest value > 0), for the title cards.
  const leaderOf = (rows: { m: MemberStats; v: number }[]): Leader | null => {
    const best = rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v)[0]
    return best ? { name: best.m.name, value: best.v } : null
  }

  const title = variant === 'ffa' ? 'FFA' : variant === 'team' ? 'Team' : '1v1 Ranked'

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={`Monthly · ${monthLabel(month)}`} title={title} />

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

        {rules[variant] && (
          <div className="rounded-xl border border-base-600 bg-base-850/60 px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">Scoring</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">{rules[variant]}</ul>
          </div>
        )}
      </section>

      <TagNotice />

      <section className="space-y-4">
        {loading && <Spinner label="Pulling live data from OpenFront…" />}
        {error && !data && <Card className="text-center text-sm text-signal-red">Couldn’t load stats: {error}</Card>}

        {data && variant === 'ffa' && (() => {
          const rows = members
            .map((m) => ({ m, r: ffaMonthly(m, month) }))
            .sort((a, b) => b.r.points - a.r.points || b.r.wins - a.r.wins)
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TitleCard icon="🏹" title="Predator" metric="Avg Kills" leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.avgKills ?? 0 })))} />
                <TitleCard icon="⚡" title="Pro Player" metric="Win Streak" leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.winstreak })))} />
                <TitleCard icon="⛏️" title="Grinder" metric="Most Points" leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.points })))} />
              </div>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3 text-left font-semibold">#</th>
                        <th className="px-3 py-3 text-left font-semibold">Name</th>
                        <th className="px-3 py-3 text-right font-semibold">Wins</th>
                        <th className="px-3 py-3 text-right font-semibold">Losses</th>
                        <th className="px-3 py-3 text-right font-semibold">W/L</th>
                        <th className="px-3 py-3 text-right font-semibold">Streak</th>
                        <th className="px-3 py-3 text-right font-semibold">Avg Kills</th>
                        <th className="px-3 py-3 text-right font-semibold">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ m, r }, i) => (
                        <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                          <td className="px-3 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                          <td className="px-3 py-3"><Link to={`/member/${m.publicId}`} className="font-medium text-white hover:text-accent-light">{m.name}</Link></td>
                          <td className="px-3 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.wl}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.winstreak}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.avgKills ?? '-'}</td>
                          <td className="px-3 py-3 text-right font-display text-lg font-bold text-accent-light">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        })()}

        {data && variant === 'team' && (() => {
          const rows = members
            .map((m) => ({ m, r: teamMonthly(m, month, coop) }))
            .sort((a, b) => b.r.points - a.r.points || b.r.wins - a.r.wins)
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TitleCard icon="⚓" title="Marine" metric="Gold/min" leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.avgGold ?? 0 })))} fmt={fmtGold} />
                <TitleCard icon="💥" title="Destroyer" metric="Kills" leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.kills ?? 0 })))} />
                <TitleCard icon="⛏️" title="Team Grinder" metric="Most Points" leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.points })))} />
              </div>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3 text-left font-semibold">#</th>
                        <th className="px-3 py-3 text-left font-semibold">Name</th>
                        <th className="px-3 py-3 text-right font-semibold">Wins</th>
                        <th className="px-3 py-3 text-right font-semibold">Losses</th>
                        <th className="px-3 py-3 text-right font-semibold">W/L</th>
                        <th className="px-3 py-3 text-right font-semibold">Kills</th>
                        <th className="px-3 py-3 text-right font-semibold">Gold/min</th>
                        <th className="px-3 py-3 text-right font-semibold">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ m, r }, i) => (
                        <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                          <td className="px-3 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                          <td className="px-3 py-3"><Link to={`/member/${m.publicId}`} className="font-medium text-white hover:text-accent-light">{m.name}</Link></td>
                          <td className="px-3 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.wl}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.kills ?? '-'}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-gold-light">{fmtGold(r.avgGold)}</td>
                          <td className="px-3 py-3 text-right font-display text-lg font-bold text-accent-light">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        })()}

        {data && variant === '1v1' && (() => {
          const rows = members
            .map((m) => ({ m, b: oneVoneBucket(m.cynGames, month) }))
            .sort((a, b) => (b.m.eloMonthDelta ?? -9999) - (a.m.eloMonthDelta ?? -9999) || b.b.wins - a.b.wins)
          return (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-left font-semibold">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Name</th>
                      <th className="px-4 py-3 text-right font-semibold">Wins</th>
                      <th className="px-4 py-3 text-right font-semibold">Losses</th>
                      <th className="px-4 py-3 text-right font-semibold">Elo Δ</th>
                      <th className="px-4 py-3 text-right font-semibold">Current Elo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ m, b }, i) => (
                      <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                        <td className="px-4 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3"><Link to={`/member/${m.publicId}`} className="font-medium text-white hover:text-accent-light">{m.name}</Link></td>
                        <td className="px-4 py-3 text-right tabular-nums text-signal-green">{b.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">{b.losses}</td>
                        <td className="px-4 py-3 text-right font-display font-bold"><EloDelta delta={m.eloMonthDelta} /></td>
                        <td className="px-4 py-3 text-right tabular-nums text-gold-light">{m.elo ?? <span className="text-slate-600">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {data && (
          <>
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            {(variant === 'ffa' || variant === 'team') && (
              <p className="text-center text-xs text-slate-500">
                Kills{variant === 'team' ? ' & gold' : ''} come from each game’s post-game report - available for
                this month’s games (older games fill in over time). “-” = not fetched yet.
              </p>
            )}
          </>
        )}
      </section>
    </StatsShell>
  )
}
