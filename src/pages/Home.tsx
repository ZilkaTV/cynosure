import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import type { Deltas } from '../lib/useRoster'
import { computeBadges } from '../lib/badges'
import { fmtTime } from '../lib/speedruns'
import { isFfa, isTeam, is1v1 } from '../lib/stats'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { StatsTable, type Column } from '../components/StatsTable'
import { BadgeStrip } from '../components/Badges'
import { BumpCard } from '../components/BumpButton'
import { QuestCard } from '../components/QuestCard'
import GameDetailModal from '../components/GameDetailModal'
import { Card, LastUpdated, RefreshDelta, SectionHeading, StatCard, Spinner } from '../components/ui'
import type { MemberStats } from '../lib/stats'
import type { PlayerGame } from '../lib/openfront'

// Column order is deliberate: All Wins always stays last, no matter what other
// columns get added later.
function makeColumns(all: MemberStats[], deltas: Deltas): Column[] {
  return [
    {
      key: 'name',
      label: 'Name',
      render: (m) => (
        <Link to={`/member/${m.publicId}`} className="font-medium text-white hover:text-accent-light">
          {m.name}
        </Link>
      ),
      sortValue: (m) => m.name.toLowerCase(),
    },
    {
      key: 'region',
      label: 'Region',
      render: (m) => m.timezone ?? <span className="text-slate-600">-</span>,
      sortValue: (m) => m.timezone ?? '',
    },
    {
      key: 'badges',
      label: 'Badges',
      align: 'center',
      render: (m) => <BadgeStrip badges={computeBadges(m, all)} />,
      sortValue: (m) => computeBadges(m, all).filter((b) => b.earned).length,
    },
    {
      key: 'ffa',
      label: 'FFA',
      align: 'right',
      render: (m) => (
        <>
          {m.ffaWins}
          <RefreshDelta value={deltas[m.publicId]?.ffaWins} />
        </>
      ),
      sortValue: (m) => m.ffaWins,
    },
    {
      key: 'team',
      label: 'Team',
      align: 'right',
      render: (m) => (
        <>
          {m.teamWins}
          <RefreshDelta value={deltas[m.publicId]?.teamWins} />
        </>
      ),
      sortValue: (m) => m.teamWins,
    },
    {
      key: 'ranked',
      label: '1v1',
      align: 'right',
      render: (m) => (
        <>
          {m.rankedWins}
          <RefreshDelta value={deltas[m.publicId]?.rankedWins} />
        </>
      ),
      sortValue: (m) => m.rankedWins,
    },
    {
      key: 'elo',
      label: '1v1 Elo',
      align: 'right',
      render: (m) =>
        m.elo == null ? (
          <span className="text-slate-600">-</span>
        ) : (
          <span className="font-display font-bold tabular-nums text-gold-light">
            {m.elo}
            <RefreshDelta value={deltas[m.publicId]?.elo} />
          </span>
        ),
      sortValue: (m) => m.elo ?? -1,
    },
    {
      key: 'peak',
      label: 'Peak',
      align: 'right',
      render: (m) => (m.peakElo == null ? <span className="text-slate-600">-</span> : <span className="tabular-nums text-slate-400">{m.peakElo}</span>),
      sortValue: (m) => m.peakElo ?? -1,
    },
    {
      key: 'speedrun',
      label: 'Speedrun',
      align: 'right',
      render: (m) =>
        m.speedrunSeconds == null ? (
          <span className="text-slate-600">-</span>
        ) : (
          <span className="tabular-nums text-slate-300">{fmtTime(m.speedrunSeconds)}</span>
        ),
      sortValue: (m) => m.speedrunSeconds ?? Number.MAX_SAFE_INTEGER,
    },
    {
      key: 'bumps',
      label: 'Bumps',
      align: 'right',
      render: (m) =>
        m.bumpCount > 0 ? (
          <span className="tabular-nums text-slate-300">
            {m.bumpCount}
            <RefreshDelta value={deltas[m.publicId]?.bumpCount} />
          </span>
        ) : (
          <span className="text-slate-600">-</span>
        ),
      sortValue: (m) => m.bumpCount,
    },
    {
      key: 'all',
      label: 'All Wins',
      align: 'right',
      render: (m) => (
        <span className="font-display font-bold text-accent-light">
          {m.allWins}
          <RefreshDelta value={deltas[m.publicId]?.allWins} />
        </span>
      ),
      sortValue: (m) => m.allWins,
    },
  ]
}

function modeLabel(g: PlayerGame): string {
  return is1v1(g) ? '1v1' : isTeam(g) ? 'Team' : isFfa(g) ? 'FFA' : g.mode
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

export default function Home() {
  const { profile } = useProfile()
  const { data, loading, refreshing, error, lastUpdated, deltas, refresh } = useRoster(!!profile)
  const [openGame, setOpenGame] = useState<string | null>(null)

  if (!profile) return <RegistrationGate />

  const totals = data?.totals
  const columns = makeColumns(data?.members ?? [], deltas)
  const me = data?.members.find((m) => m.publicId === profile.openfront_id)

  // Same game can show up under multiple members if several CYN players were
  // in it together - dedupe by gameId so it only appears once.
  const byGameId = new Map<string, { g: PlayerGame; memberName: string }>()
  for (const m of data?.members ?? []) {
    for (const g of m.cynGames) {
      if (g.type === 'Private' || byGameId.has(g.gameId)) continue
      byGameId.set(g.gameId, { g, memberName: m.name })
    }
  }
  const recentGames = [...byGameId.values()]
    .sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
    .slice(0, 5)

  return (
    <StatsShell>
      <section>
        <SectionHeading center eyebrow={`[${CLAN_TAG}] Cynosure`} title="Clan Overview" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Members" value={totals ? totals.members : '…'} accent="plain" />
          <StatCard label="Top 1v1 Elo" value={totals?.topElo ?? '…'} accent="gold" />
          <StatCard label="1v1 Wins" value={totals ? totals.rankedWins : '…'} accent="purple" />
          <StatCard label="Team Wins" value={totals ? totals.teamWins : '…'} accent="purple" />
          <StatCard className="col-span-2 sm:col-span-1" label="All Wins" value={totals ? totals.allWins : '…'} accent="gold" />
        </div>
      </section>

      <TagNotice />

      <section className="space-y-4">
        <SectionHeading center eyebrow="Roster" title="Member Stats" />
        {loading && <Spinner label="Pulling live data from OpenFront…" />}
        {error && !data && (
          <Card className="text-center text-sm text-signal-red">
            Couldn’t load stats: {error}. The OpenFront API rate-limits hard - try Refresh in a minute.
          </Card>
        )}
        {data && (
          <>
            <StatsTable members={data.members} columns={columns} defaultSort="all" />
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            {data.oldestGame && (
              <p className="text-center text-xs text-slate-500">
                Counting [{CLAN_TAG}] games since{' '}
                <span className="text-slate-300">
                  {new Date(data.oldestGame).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>{' '}
                - older games fall outside OpenFront’s public history window.
              </p>
            )}
            <p className="text-center text-xs text-slate-500">
              1v1 Elo comes from OpenFront’s ranked ladder (global top 100 only). Click a name for that
              member’s full profile.
            </p>
          </>
        )}
      </section>

      {me && (
        <section className="mx-auto grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <BumpCard openfrontId={me.publicId} bumpCount={me.bumpCount} lastBumpAt={me.lastBumpAt} onDone={refresh} />
          <QuestCard xp={me.xp} />
        </section>
      )}

      {recentGames.length > 0 && (
        <section className="space-y-4">
          <SectionHeading center eyebrow="Activity" title="Latest Games" />
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Player</th>
                    <th className="px-4 py-3 text-left font-semibold">Mode</th>
                    <th className="px-4 py-3 text-left font-semibold">Map</th>
                    <th className="px-4 py-3 text-right font-semibold">Duration</th>
                    <th className="px-4 py-3 text-right font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGames.map(({ g, memberName }) => (
                    <tr
                      key={g.gameId}
                      onClick={() => setOpenGame(g.gameId)}
                      className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                      title="Click for the full post-game report"
                    >
                      <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-2.5 text-white">{memberName}</td>
                      <td className="px-4 py-2.5 text-slate-300">{modeLabel(g)}</td>
                      <td className="px-4 py-2.5 text-slate-400">{g.map}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                        {g.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </StatsShell>
  )
}
