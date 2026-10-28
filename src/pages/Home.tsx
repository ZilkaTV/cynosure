import { useEffect, useMemo, useState } from 'react'
import { CLAN_TAG, CLAN_NAME } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import type { Deltas } from '../lib/useRoster'
import { computeBadges } from '../lib/badges'
import { fmtTime } from '../lib/speedruns'
import { isFfa, isTeam, is1v1, is2v2, isIncompleteRanked } from '../lib/stats'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { StatsTable, type Column } from '../components/StatsTable'
import { BadgeStrip } from '../components/Badges'
import GameDetailModal from '../components/GameDetailModal'
import { cleanDisplayName } from '../lib/displayName'
import { Card, LastUpdated, MemberNameLink, RefreshDelta, SectionHeading, Spinner } from '../components/ui'
import {
  fetchClanScoreLedger,
  fmtScoreDelta,
  fmtRatioChange,
  type ClanScoreRow,
} from '../lib/clanScore'
import { ReactionCell } from '../components/ReactionCell'
import { useReactions } from '../lib/useReactions'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationShape } from '../i18n/translations'
import type { MemberStats } from '../lib/stats'
import { fetchGameDetailsBatch, teamRosterNames, fmtTeamRoster, type PlayerGame, type GameDetail } from '../lib/openfront'

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
      minWidth: 168,
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
            {m.peakElo != null && <span className="block text-[11px] font-normal text-slate-500">{t.home.colPeak} {m.peakElo}</span>}
          </span>
        ),
      sortValue: (m) => m.elo ?? -1,
    },
    {
      key: 'twovtwo',
      label: t.home.col2v2,
      align: 'right',
      render: (m) => (
        <>
          {m.twoVTwoWins}
          <RefreshDelta value={deltas[m.publicId]?.twoVTwoWins} />
        </>
      ),
      sortValue: (m) => m.twoVTwoWins,
    },
    {
      key: 'elo2v2',
      label: t.home.col2v2Elo,
      align: 'right',
      render: (m) =>
        m.elo2v2 == null ? (
          <span className="text-slate-600">-</span>
        ) : (
          <span className="font-display font-bold tabular-nums text-gold-light">
            {m.elo2v2}
            <RefreshDelta value={deltas[m.publicId]?.elo2v2} />
            {m.peakElo2v2 != null && <span className="block text-[11px] font-normal text-slate-500">{t.home.colPeak} {m.peakElo2v2}</span>}
          </span>
        ),
      sortValue: (m) => m.elo2v2 ?? -1,
    },
    {
      key: 'eloFfa',
      label: 'FFA Elo',
      align: 'right',
      render: (m) =>
        m.eloFfa == null ? (
          <span className="text-slate-600">-</span>
        ) : (
          <span className="font-display font-bold tabular-nums text-gold-light">
            {m.eloFfa}
            {m.peakEloFfa != null && <span className="block text-[11px] font-normal text-slate-500">{t.home.colPeak} {m.peakEloFfa}</span>}
          </span>
        ),
      sortValue: (m) => m.eloFfa ?? -1,
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
  return is1v1(g) ? '1v1' : is2v2(g) ? '2v2' : isTeam(g) ? 'Team' : isFfa(g) ? 'FFA' : g.mode
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
  const [clanScores, setClanScores] = useState<Map<string, ClanScoreRow>>(new Map())
  const [gameDetails, setGameDetails] = useState<Map<string, GameDetail>>(new Map())

  // Same game can show up under multiple members if several CYN players were
  // in it together - dedupe by gameId so it only appears once, but keep
  // every member's name (not just whoever was found first) so a shared game
  // credits everyone who played, e.g. "Zilka, Chuma". `g.username` (this
  // member's own actual OpenFront name in this specific game) is used
  // instead of their registered site name - the two can differ (whatever
  // someone typed at registration vs. their real in-game name), which used
  // to only show up inconsistently on games the full roster couldn't
  // reconstruct, looking like two different people.
  const byGameId = new Map<string, { g: PlayerGame; memberNames: string[]; memberIds: string[] }>()
  for (const m of data?.members ?? []) {
    for (const g of m.cynGames) {
      if (g.type === 'Private' || isIncompleteRanked(g)) continue
      const existing = byGameId.get(g.gameId)
      if (existing) {
        existing.memberNames.push(g.username)
        existing.memberIds.push(m.publicId)
      } else {
        byGameId.set(g.gameId, { g, memberNames: [g.username], memberIds: [m.publicId] })
      }
    }
  }
  const sortedRecentGames = [...byGameId.values()].sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
  const recentGames = sortedRecentGames.slice(0, 5)

  // Memoized so StatsTable's own sort memo (keyed on `columns`) actually
  // holds between renders - a fresh array every render made it re-sort the
  // whole roster on every unrelated state change (reaction click, background
  // reload, ...).

  const columns = useMemo(() => makeColumns(data?.members ?? [], deltas, t), [data, deltas, t])

  const reactionsApi = useReactions(recentGames.map(({ g }) => g.gameId))

  // Warm the Max Tiles cache for the games shown below while the visitor is
  // just browsing the roster, so opening one's report later is instant
  // instead of waiting on the replay - see prefetchGameTileStats. This has to
  // stay above the `!profile` early return below - every hook in a component
  // must run in the same order on every render, and this one used to sit
  // after that return, so a visitor completing registration mid-session
  // (profile flips from null to set without a page reload) made Home call
  // one more hook than the render before, which React flags as a crash.
  //
  // Prefetches a much wider window than the 5 games actually shown below:
  // confirmed directly that with only the top-5 prefetched, most members'
  // recent games never got their Max Tiles computed at all unless someone
  // happened to open that exact game or visit that member's own profile -
  // Home is the one page nearly everyone visits regularly, so it's the best
  // place to make a dent in that backlog. Still bounded (not "every game
  // ever") and still costs nothing extra for anything already cached - the
  // bounded-concurrency pool in prefetchGameTileStats checks that first per
  // game, cache-only (see checkCachedTileStats), never a real replay.
  const PREFETCH_COUNT = 40
  const prefetchGames = sortedRecentGames.slice(0, PREFETCH_COUNT)
  useEffect(() => {
    if (prefetchGames.length === 0) return
    import('../lib/replaySim').then(({ prefetchGameTileStats }) => {
      prefetchGameTileStats(prefetchGames.map(({ g }) => g.gameId))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchGames.map(({ g }) => g.gameId).join(',')])

  // Win Score/Ratio for the Latest Games table below (see clanScore.ts) -
  // matches History.tsx/MemberProfile.tsx's own recent-games tables.
  useEffect(() => {
    if (recentGames.length === 0) return
    fetchClanScoreLedger(recentGames.map(({ g }) => g.gameId)).then(setClanScores)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentGames.map(({ g }) => g.gameId).join(',')])

  // Full team roster per game (see teamRosterNames in openfront.ts) for the
  // Player column below - everyone who was actually there, not just
  // whichever registered members happened to play.
  useEffect(() => {
    if (recentGames.length === 0) return
    fetchGameDetailsBatch(recentGames.map(({ g }) => g.gameId)).then((fetched) => {
      const next = new Map<string, GameDetail>()
      for (const [id, detail] of fetched) if (detail) next.set(id, detail)
      setGameDetails(next)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentGames.map(({ g }) => g.gameId).join(',')])

  if (!profile) return <RegistrationGate />


  return (
    <StatsShell>
      <section>
        <SectionHeading center eyebrow={`[${CLAN_TAG}] ${CLAN_NAME}`} title={t.home.title} />
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
            <StatsTable members={data.members} columns={columns} defaultSort="all" limit={10} searchable />
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            <p className="text-center text-xs text-slate-500">{t.home.eloNote}</p>
          </>
        )}
      </section>




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
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.players}</th>
                    <th className="px-4 py-3 text-right font-semibold">Win Score</th>
                    <th className="px-4 py-3 text-right font-semibold">[{CLAN_TAG}] Ratio</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.home.reactionButton}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGames.map(({ g, memberNames, memberIds }) => {
                    const clanScore = clanScores.get(g.gameId)
                    const ratioChange = clanScore ? fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) : null
                    const detail = gameDetails.get(g.gameId)
                    const fullRoster = detail && g.result !== 'incomplete' ? teamRosterNames(detail, g.result === 'victory', memberNames) : null
                    const playerDisplay = fullRoster ? fmtTeamRoster(fullRoster) : memberNames.map(cleanDisplayName).join(', ')
                    return (
                      <tr
                        key={g.gameId}
                        onClick={() => setOpenGame(g.gameId)}
                        className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                        title={t.home.clickForReportTitle}
                      >
                        <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-2.5 text-white">{playerDisplay}</td>
                        <td className="px-4 py-2.5 text-slate-300">{modeLabel(g)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{g.totalPlayers ?? '-'}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${clanScore ? (clanScore.won ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                          {clanScore ? fmtScoreDelta(clanScore.score, clanScore.won) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{ratioChange ?? '-'}</td>
                        <td className="px-4 py-2.5 text-slate-400">{g.map}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                          {g.result}
                        </td>
                        <ReactionCell gameId={g.gameId} memberIds={memberIds} api={reactionsApi} />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {data?.oldestGame && (
        <p className="-mt-6 text-center text-xs text-slate-500">
          {t.home.countingSincePrefix(CLAN_TAG)}{' '}
          <span className="text-slate-300">
            {new Date(data.oldestGame).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>{' '}
          {t.home.countingSinceSuffix}
        </p>
      )}

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </StatsShell>
  )
}
