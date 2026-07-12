import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { StatsTable, type Column } from '../components/StatsTable'
import { ActivityDot, Card, EloDelta, SectionHeading, StatCard, Spinner } from '../components/ui'

type Variant = 'ffa' | 'team' | '1v1'

const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

const nameCol: Column = {
  key: 'name',
  label: 'Name',
  render: (m) => (
    <div className="flex items-center gap-2.5">
      <ActivityDot games={m.gamesLast30d} />
      <span className="font-medium text-white">{m.name}</span>
      {m.timezone && <span className="text-xs text-slate-500">{m.timezone}</span>}
    </div>
  ),
  sortValue: (m) => m.name.toLowerCase(),
}

const config: Record<
  Variant,
  { eyebrow: string; title: string; columns: Column[]; defaultSort: string; total: (m: import('../lib/stats').MemberStats[]) => number; totalLabel: string }
> = {
  ffa: {
    eyebrow: 'Monthly',
    title: 'FFA Wins',
    defaultSort: 'mffa',
    totalLabel: 'FFA wins this month',
    total: (ms) => ms.reduce((s, m) => s + m.monthlyFfaWins, 0),
    columns: [
      nameCol,
      {
        key: 'mffa',
        label: `FFA Wins · ${monthLabel}`,
        align: 'right',
        render: (m) => <span className="font-display text-lg font-bold text-accent-light">{m.monthlyFfaWins}</span>,
        sortValue: (m) => m.monthlyFfaWins,
      },
      { key: 'lifetime', label: 'Lifetime FFA', align: 'right', render: (m) => <span className="text-slate-400">{m.ffaWins}</span>, sortValue: (m) => m.ffaWins },
    ],
  },
  team: {
    eyebrow: 'Monthly',
    title: 'Team Wins',
    defaultSort: 'mteam',
    totalLabel: 'Team wins this month',
    total: (ms) => ms.reduce((s, m) => s + m.monthlyTeamWins, 0),
    columns: [
      nameCol,
      {
        key: 'mteam',
        label: `Team Wins · ${monthLabel}`,
        align: 'right',
        render: (m) => <span className="font-display text-lg font-bold text-accent-light">{m.monthlyTeamWins}</span>,
        sortValue: (m) => m.monthlyTeamWins,
      },
      { key: 'lifetime', label: 'Lifetime Team', align: 'right', render: (m) => <span className="text-slate-400">{m.teamWins}</span>, sortValue: (m) => m.teamWins },
    ],
  },
  '1v1': {
    eyebrow: 'Monthly',
    title: '1v1 Ranked',
    defaultSort: 'delta',
    totalLabel: '1v1 wins this month',
    total: (ms) => ms.reduce((s, m) => s + m.monthly1v1Wins, 0),
    columns: [
      nameCol,
      {
        key: 'delta',
        label: `Elo Δ · ${monthLabel}`,
        align: 'right',
        render: (m) => (
          <span className="font-display text-lg font-bold">
            <EloDelta delta={m.eloMonthDelta} />
          </span>
        ),
        sortValue: (m) => m.eloMonthDelta ?? -9999,
      },
      {
        key: 'elo',
        label: 'Current Elo',
        align: 'right',
        render: (m) => (m.elo == null ? <span className="text-slate-600">—</span> : <span className="font-semibold text-gold-light">{m.elo}</span>),
        sortValue: (m) => m.elo ?? -1,
      },
      {
        key: 'wins',
        label: `1v1 Wins · ${monthLabel}`,
        align: 'right',
        render: (m) => m.monthly1v1Wins,
        sortValue: (m) => m.monthly1v1Wins,
      },
    ],
  },
}

export default function Monthly({ variant }: { variant: Variant }) {
  const { profile } = useProfile()
  const { data, loading, error } = useRoster(!!profile)

  if (!profile) return <RegistrationGate />

  const cfg = config[variant]
  const total = data ? cfg.total(data.members) : null

  return (
    <StatsShell>
      <section>
        <SectionHeading eyebrow={`${cfg.eyebrow} · ${monthLabel}`} title={cfg.title} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label={cfg.totalLabel} value={total ?? '…'} accent="gold" />
          <StatCard label="Members tracked" value={data ? data.totals.members : '…'} accent="plain" />
          <StatCard label="Active (30d)" value={data ? data.totals.activeLast30d : '…'} accent="purple" />
        </div>
      </section>

      <section>
        {loading && <Spinner label="Pulling live data from OpenFront…" />}
        {error && <Card className="text-sm text-signal-red">Couldn’t load stats: {error}</Card>}
        {data && (
          <>
            <StatsTable members={data.members} columns={cfg.columns} defaultSort={cfg.defaultSort} />
            {variant === '1v1' && (
              <p className="mt-3 text-xs text-slate-500">
                OpenFront doesn’t publish historical elo, so “Elo Δ” is measured from the first time this site
                saw each member’s elo in {monthLabel} (it fills out through the month). Current elo and 1v1 wins
                are live. Only [{CLAN_TAG}] games count.
              </p>
            )}
          </>
        )}
      </section>
    </StatsShell>
  )
}
