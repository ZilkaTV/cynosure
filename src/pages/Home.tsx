import { Link } from 'react-router-dom'
import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { StatsTable, type Column } from '../components/StatsTable'
import { Card, LastUpdated, SectionHeading, StatCard, Spinner } from '../components/ui'

const columns: Column[] = [
  {
    key: 'name',
    label: 'Name',
    render: (m) => (
      <Link to={`/member/${m.publicId}`} className="font-medium text-white hover:text-accent-light">
        {m.name}
        {m.timezone && <span className="ml-2 text-xs font-normal text-slate-500">{m.timezone}</span>}
      </Link>
    ),
    sortValue: (m) => m.name.toLowerCase(),
  },
  { key: 'ffa', label: 'FFA', align: 'right', render: (m) => m.ffaWins, sortValue: (m) => m.ffaWins },
  { key: 'team', label: 'Team', align: 'right', render: (m) => m.teamWins, sortValue: (m) => m.teamWins },
  { key: 'ranked', label: '1v1', align: 'right', render: (m) => m.rankedWins, sortValue: (m) => m.rankedWins },
  {
    key: 'elo',
    label: '1v1 Elo',
    align: 'right',
    render: (m) =>
      m.elo == null ? (
        <span className="text-slate-600">—</span>
      ) : (
        <span className="font-display font-bold tabular-nums text-gold-light">{m.elo}</span>
      ),
    sortValue: (m) => m.elo ?? -1,
  },
  {
    key: 'peak',
    label: 'Peak',
    align: 'right',
    render: (m) => (m.peakElo == null ? <span className="text-slate-600">—</span> : <span className="tabular-nums text-slate-400">{m.peakElo}</span>),
    sortValue: (m) => m.peakElo ?? -1,
  },
  {
    key: 'all',
    label: 'All Wins',
    align: 'right',
    render: (m) => <span className="font-display font-bold text-accent-light">{m.allWins}</span>,
    sortValue: (m) => m.allWins,
  },
]

export default function Home() {
  const { profile } = useProfile()
  const { data, loading, refreshing, error, lastUpdated, refresh } = useRoster(!!profile)

  if (!profile) return <RegistrationGate />

  const totals = data?.totals

  return (
    <StatsShell>
      <section>
        <SectionHeading center eyebrow={`[${CLAN_TAG}] Cynosure`} title="Clan Overview" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Members" value={totals ? totals.members : '…'} accent="plain" />
          <StatCard label="Top 1v1 Elo" value={totals?.topElo ?? '…'} accent="gold" />
          <StatCard label="1v1 Wins" value={totals ? totals.rankedWins : '…'} accent="purple" />
          <StatCard label="Team Wins" value={totals ? totals.teamWins : '…'} accent="purple" />
          <StatCard label="All Wins" value={totals ? totals.allWins : '…'} accent="gold" />
        </div>
      </section>

      <TagNotice />

      <section className="space-y-4">
        <SectionHeading center eyebrow="Roster" title="Member Stats" />
        {loading && <Spinner label="Pulling live data from OpenFront…" />}
        {error && !data && (
          <Card className="text-center text-sm text-signal-red">
            Couldn’t load stats: {error}. The OpenFront API rate-limits hard — try Refresh in a minute.
          </Card>
        )}
        {data && (
          <>
            <StatsTable members={data.members} columns={columns} defaultSort="all" />
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            <p className="text-center text-xs text-slate-500">
              1v1 Elo comes from OpenFront’s ranked ladder (global top 100 only). Click a name for that
              member’s full profile.
            </p>
          </>
        )}
      </section>
    </StatsShell>
  )
}
