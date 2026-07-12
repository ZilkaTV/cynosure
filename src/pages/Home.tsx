import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { StatsTable, type Column } from '../components/StatsTable'
import { ActivityDot, Card, SectionHeading, StatCard, Spinner } from '../components/ui'

const columns: Column[] = [
  {
    key: 'name',
    label: 'Name',
    render: (m) => (
      <div className="flex items-center gap-2.5">
        <ActivityDot games={m.gamesLast30d} />
        <div className="min-w-0">
          <span className="font-medium text-white">{m.name}</span>
          {m.timezone && <span className="ml-2 text-xs text-slate-500">{m.timezone}</span>}
        </div>
      </div>
    ),
    sortValue: (m) => m.name.toLowerCase(),
  },
  { key: 'ffa', label: 'FFA Wins', align: 'right', render: (m) => m.ffaWins, sortValue: (m) => m.ffaWins },
  { key: 'team', label: 'Team Wins', align: 'right', render: (m) => m.teamWins, sortValue: (m) => m.teamWins },
  {
    key: 'ranked',
    label: '1v1 Ranked Wins',
    align: 'right',
    render: (m) => m.rankedWins,
    sortValue: (m) => m.rankedWins,
  },
  {
    key: 'elo',
    label: '1v1 Elo',
    align: 'right',
    render: (m) =>
      m.elo == null ? (
        <span className="text-slate-600">—</span>
      ) : (
        <span className="inline-flex items-baseline gap-1.5">
          <span className="font-display font-bold text-gold-light">{m.elo}</span>
          {m.peakElo != null && m.peakElo > m.elo && (
            <span className="text-[10px] text-slate-500">peak {m.peakElo}</span>
          )}
        </span>
      ),
    sortValue: (m) => m.elo ?? -1,
  },
  {
    key: 'all',
    label: 'All Wins',
    align: 'right',
    render: (m) => <span className="font-semibold text-accent-light">{m.allWins}</span>,
    sortValue: (m) => m.allWins,
  },
]

export default function Home() {
  const { profile } = useProfile()
  const { data, clan, loading, error } = useRoster(!!profile)

  if (!profile) return <RegistrationGate />

  const totals = data?.totals

  return (
    <StatsShell>
      <section>
        <SectionHeading
          eyebrow={`[${CLAN_TAG}] Cynosure`}
          title="Clan Overview"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Members tracked" value={totals ? totals.members : '…'} accent="plain" />
          <StatCard label="Active (30d)" value={totals ? totals.activeLast30d : '…'} accent="purple" />
          <StatCard label="Top 1v1 Elo" value={totals?.topElo ?? '…'} accent="gold" />
          <StatCard label="1v1 Ranked Wins" value={totals ? totals.rankedWins : '…'} accent="purple" />
          <StatCard label="Team Wins" value={totals ? totals.teamWins : '…'} accent="purple" />
          <StatCard label="Total CYN Wins" value={totals ? totals.allWins : '…'} accent="gold" />
        </div>
        {clan && (
          <p className="mt-3 text-xs text-slate-500">
            OpenFront clan ledger (public team games): {clan.wins}W / {clan.losses}L across {clan.games} games ·
            weighted W/L ratio {clan.weightedWLRatio}
          </p>
        )}
      </section>

      <section>
        <SectionHeading eyebrow="Roster" title="Member Stats" />
        {loading && <Spinner label="Pulling live data from OpenFront…" />}
        {error && (
          <Card className="text-sm text-signal-red">
            Couldn’t load stats: {error}. The OpenFront API rate-limits hard — try again in a minute.
          </Card>
        )}
        {data && (
          <>
            <StatsTable members={data.members} columns={columns} defaultSort="elo" />
            <p className="mt-3 text-xs text-slate-500">
              Only games played with the [{CLAN_TAG}] tag count. Elo &amp; ranked wins come from the OpenFront
              ranked ladder; FFA/Team/All wins from each member’s game history. Green dot = 10+ games in the
              last 30 days.
            </p>
          </>
        )}
      </section>
    </StatsShell>
  )
}
