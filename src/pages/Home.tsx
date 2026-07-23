import { useEffect, useState } from 'react'
import { CLAN_TAG, CLAN_NAME } from '../config'
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
import { Card, LastUpdated, MemberNameLink, RefreshDelta, SectionHeading, StatCard, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationShape } from '../i18n/translations'
import type { MemberStats } from '../lib/stats'
import type { PlayerGame } from '../lib/openfront'

// Column order is deliberate: All Wins always stays last, no matter what other
// columns get added later.
function makeColumns(all: MemberStats[], deltas: Deltas, t: TranslationShape): Column[] {
  return [
    {
      key: 'name',
      label: t.monthly.colName,
      render: (m) => <MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} />,
      sortValue: (m) => m.name.toLowerCase(),
    },
    {
      key: 'region',
      label: t.home.colRegion,
      render: (m) => m.timezone ?? <span className="text-slate-600">-</span>,
      sortValue: (m) => m.timezone ?? '',
    },
    {
      key: 'badges',
      label: t.home.colBadges,
      align: 'center',
      render: (m) => <BadgeStrip badges={computeBadges(m, all, t)} />,
      sortValue: (m) => computeBadges(m, all, t).filter((b) => b.earned).length,
    },
    {
      key: 'ffa',
      label: t.home.colFfa,
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
      label: t.home.colTeam,
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
      label: t.home.col1v1,
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
      label: t.home.colElo,
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
      label: t.home.colPeak,
      align: 'right',
      render: (m) => (m.peakElo == null ? <span className="text-slate-600">-</span> : <span className="tabular-nums text-slate-400">{m.peakElo}</span>),
      sortValue: (m) => m.peakElo ?? -1,
    },
    {
      key: 'speedrun',
      label: t.home.colSpeedrun,
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
      label: t.home.colBumps,
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
      label: t.home.statAllWins,
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
  const { t } = useLanguage()
  const { data, loading, refreshing, error, lastUpdated, deltas, refresh } = useRoster(!!profile)
  const [openGame, setOpenGame] = useState<string | null>(null)

  // Same game can show up under multiple members if several CYN players were
  // in it together - dedupe by gameId so it only appears once, but keep
  // every member's name (not just whoever was found first) so a shared game
  // credits everyone who played, e.g. "Zilka, Chuma".
  const byGameId = new Map<string, { g: PlayerGame; memberNames: string[] }>()
  for (const m of data?.members ?? []) {
    for (const g of m.cynGames) {
      if (g.type === 'Private') continue
      const existing = byGameId.get(g.gameId)
      if (existing) existing.memberNames.push(m.name)
      else byGameId.set(g.gameId, { g, memberNames: [m.name] })
    }
  }
  const recentGames = [...byGameId.values()]
    .sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
    .slice(0, 5)

  // Warm the Max Tiles cache for the games shown below while the visitor is
  // just browsing the roster, so opening one's report later is instant
  // instead of waiting on the replay - see prefetchGameTileStats. This has to
  // stay above the `!profile` early return below - every hook in a component
  // must run in the same order on every render, and this one used to sit
  // after that return, so a visitor completing registration mid-session
  // (profile flips from null to set without a page reload) made Home call
  // one more hook than the render before, which React flags as a crash.
  useEffect(() => {
    if (recentGames.length === 0) return
    import('../lib/replaySim').then(({ prefetchGameTileStats }) => {
      prefetchGameTileStats(recentGames.map(({ g }) => g.gameId))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentGames.map(({ g }) => g.gameId).join(',')])

  if (!profile) return <RegistrationGate />

  const totals = data?.totals
  const columns = makeColumns(data?.members ?? [], deltas, t)
  const me = data?.members.find((m) => m.publicId === profile.openfront_id)

  return (
    <StatsShell>
      <section>
        <SectionHeading center eyebrow={`[${CLAN_TAG}] ${CLAN_NAME}`} title={t.home.title} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label={t.home.statMembers} value={totals ? totals.members : '…'} accent="plain" />
          <StatCard label={t.home.statTopElo} value={totals?.topElo ?? '…'} accent="gold" />
          <StatCard label={t.home.stat1v1Wins} value={totals ? totals.rankedWins : '…'} accent="purple" />
          <StatCard label={t.home.statTeamWins} value={totals ? totals.teamWins : '…'} accent="purple" />
          <StatCard className="col-span-2 sm:col-span-1" label={t.home.statAllWins} value={totals ? totals.allWins : '…'} accent="gold" />
        </div>
      </section>

      <TagNotice />

      <section className="space-y-4">
        <SectionHeading center eyebrow={t.home.rosterEyebrow} title={t.home.memberStatsTitle} />
        {loading && <Spinner label={t.common.loadingLiveData} />}
        {error && !data && (
          <Card className="text-center text-sm text-signal-red">{t.home.loadErrorFull(error)}</Card>
        )}
        {data && (
          <>
            <StatsTable members={data.members} columns={columns} defaultSort="all" />
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            {data.oldestGame && (
              <p className="text-center text-xs text-slate-500">
                {t.home.countingSincePrefix(CLAN_TAG)}{' '}
                <span className="text-slate-300">
                  {new Date(data.oldestGame).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>{' '}
                {t.home.countingSinceSuffix}
              </p>
            )}
            <p className="text-center text-xs text-slate-500">{t.home.eloNote}</p>
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
          <SectionHeading center eyebrow={t.home.activityEyebrow} title={t.home.latestGamesTitle} />
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.player}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.mode}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGames.map(({ g, memberNames }) => (
                    <tr
                      key={g.gameId}
                      onClick={() => setOpenGame(g.gameId)}
                      className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                      title={t.home.clickForReportTitle}
                    >
                      <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-2.5 text-white">{memberNames.join(', ')}</td>
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
