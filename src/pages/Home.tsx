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
import { BumpCard } from '../components/BumpButton'
import { QuestCard } from '../components/QuestCard'
import { GameNightsCard } from '../components/GameNightsCard'
import GameDetailModal from '../components/GameDetailModal'
import { cleanDisplayName } from '../lib/displayName'
import { Card, LastUpdated, MemberNameLink, RefreshDelta, SectionHeading, StatCard, Spinner } from '../components/ui'
import {
  fetchClanLeaderboardEntry,
  fetchClanScoreLedger,
  fmtScoreDelta,
  fmtRatioChange,
  isClanScoreEligible,
  type ClanLeaderboardEntry,
  type ClanScoreRow,
} from '../lib/clanScore'
import { computeClanStreak } from '../lib/streak'
import { fetchMostImproved, type MostImproved } from '../lib/trends'
import { fetchKudos, giveKudos, type KudosCounts } from '../lib/kudos'
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
          </span>
        ),
      sortValue: (m) => m.elo2v2 ?? -1,
    },
    {
      key: 'peak2v2',
      label: t.home.colPeak,
      align: 'right',
      render: (m) => (m.peakElo2v2 == null ? <span className="text-slate-600">-</span> : <span className="tabular-nums text-slate-400">{m.peakElo2v2}</span>),
      sortValue: (m) => m.peakElo2v2 ?? -1,
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
  const [clanLeaderboard, setClanLeaderboard] = useState<ClanLeaderboardEntry | null>(null)
  const [clanScores, setClanScores] = useState<Map<string, ClanScoreRow>>(new Map())
  const [gameDetails, setGameDetails] = useState<Map<string, GameDetail>>(new Map())
  const [mostImproved, setMostImproved] = useState<MostImproved[]>([])
  const [kudos, setKudos] = useState<KudosCounts>({ totals: {}, givenByGame: {} })
  const [kudosBusy, setKudosBusy] = useState<string | null>(null)

  // Live snapshot of OpenFront's own "CLANS" leaderboard tab (rolling
  // 90-day window + 30-day half-life decay, refreshed by refresh-details.mjs)
  // - deliberately the one stat on this page meant to match that in-game
  // number exactly, not the per-game history shown elsewhere on the site.
  useEffect(() => {
    fetchClanLeaderboardEntry().then(setClanLeaderboard)
  }, [])

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

  // Clan-wide play streak + "games this week" pulse stat (see streak.ts) -
  // computed straight from the roster's already-loaded game history, no
  // extra fetch. Memoized since this walks every member's full game list,
  // same pattern tick 13's INP research flagged for History.tsx's sort/
  // filter - worth doing right from the start in new code.
  const allGamesForStreak = useMemo(() => (data?.members ?? []).flatMap((m) => m.cynGames), [data])
  const streak = useMemo(() => computeClanStreak(allGamesForStreak), [allGamesForStreak])
  const weeklyGameCount = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000
    const seen = new Set<string>()
    let count = 0
    for (const g of allGamesForStreak) {
      if (g.type === 'Private' || !isClanScoreEligible(g) || new Date(g.start).getTime() < since) continue
      if (seen.has(g.gameId)) continue
      seen.add(g.gameId)
      count++
    }
    return count
  }, [allGamesForStreak])

  useEffect(() => {
    fetchMostImproved().then(setMostImproved)
  }, [])

  useEffect(() => {
    if (recentGames.length === 0) return
    fetchKudos(recentGames.map(({ g }) => g.gameId)).then(setKudos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentGames.map(({ g }) => g.gameId).join(',')])

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

  const totals = data?.totals
  const columns = makeColumns(data?.members ?? [], deltas, t)
  const me = data?.members.find((m) => m.publicId === profile.openfront_id)

  return (
    <StatsShell>
      <section>
        <SectionHeading center eyebrow={`[${CLAN_TAG}] ${CLAN_NAME}`} title={t.home.title} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t.home.statMembers} value={totals ? totals.members : '…'} accent="plain" />
          <StatCard label={t.home.statTopElo} value={totals?.topElo ?? '…'} accent="gold" />
          <StatCard label={t.home.stat1v1Wins} value={totals ? totals.rankedWins : '…'} accent="purple" />
          <StatCard label={t.home.stat2v2Wins} value={totals ? totals.twoVTwoWins : '…'} accent="purple" />
          <StatCard label={t.home.statTeamWins} value={totals ? totals.teamWins : '…'} accent="purple" />
          <StatCard className="col-span-2 sm:col-span-1" label={t.home.statAllWins} value={totals ? totals.allWins : '…'} accent="gold" />
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label={t.home.weeklyGamesPulse(CLAN_TAG, weeklyGameCount)} value={weeklyGameCount} accent="gold" />
          <StatCard
            label={t.home.streakTitle}
            value={streak.currentDays > 0 ? t.home.streakDays(streak.currentDays) : '—'}
            sub={streak.currentDays > 0 ? t.home.streakLongest(streak.longestDays) : t.home.streakNone}
            accent="purple"
          />
          <div className="panel px-5 py-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t.home.mostImprovedTitle}</p>
            {mostImproved.length === 0 ? (
              <p className="text-sm text-slate-500">{t.home.mostImprovedEmpty}</p>
            ) : (
              <ul className="space-y-0.5">
                {mostImproved.map((mi) => {
                  const member = data?.members.find((m) => m.publicId === mi.openfrontId)
                  return (
                    <li key={mi.openfrontId} className="flex items-center justify-between text-sm">
                      <span className="text-white">{member ? cleanDisplayName(member.name) : mi.openfrontId}</span>
                      <span className="font-display font-bold text-gold-light">{t.home.mostImprovedWins(mi.winsDelta)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {clanLeaderboard && (
        <section>
          <SectionHeading center eyebrow="OpenFront Clan Leaderboard" title="Last 90 Days" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Games" value={clanLeaderboard.games} accent="plain" />
            <StatCard label="Win Score" value={clanLeaderboard.weightedWins.toFixed(1)} accent="gold" />
            <StatCard label="Loss Score" value={clanLeaderboard.weightedLosses.toFixed(1)} accent="plain" />
            <StatCard label="Win/Loss Ratio" value={clanLeaderboard.weightedWLRatio.toFixed(2)} accent="gold" />
          </div>
        </section>
      )}

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

      {me && (
        <section className="mx-auto max-w-xl">
          <GameNightsCard openfrontId={me.publicId} />
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
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.players}</th>
                    <th className="px-4 py-3 text-right font-semibold">Win Score</th>
                    <th className="px-4 py-3 text-right font-semibold">[{CLAN_TAG}] Ratio</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                    {me && <th className="px-4 py-3 text-right font-semibold"></th>}
                  </tr>
                </thead>
                <tbody>
                  {recentGames.map(({ g, memberNames, memberIds }) => {
                    const clanScore = clanScores.get(g.gameId)
                    const ratioChange = clanScore ? fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) : null
                    const detail = gameDetails.get(g.gameId)
                    const fullRoster = detail && g.result !== 'incomplete' ? teamRosterNames(detail, g.result === 'victory', memberNames) : null
                    const playerDisplay = fullRoster ? fmtTeamRoster(fullRoster) : memberNames.map(cleanDisplayName).join(', ')
                    const kudosTotal = memberIds.reduce((sum, id) => sum + (kudos.totals[id] ?? 0), 0)
                    const alreadyGiven = me ? memberIds.some((id) => kudos.givenByGame[`${g.gameId}:${id}`]?.has(me.publicId)) : false
                    const canGiveKudos = me && memberIds.some((id) => id !== me.publicId)
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
                        {me && (
                          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {canGiveKudos && (
                              <button
                                disabled={alreadyGiven || kudosBusy === g.gameId}
                                onClick={async () => {
                                  setKudosBusy(g.gameId)
                                  const r = await giveKudos(g.gameId, me.publicId, memberIds)
                                  if (r.ok) fetchKudos(recentGames.map(({ g: rg }) => rg.gameId)).then(setKudos)
                                  setKudosBusy(null)
                                }}
                                className={`rounded-md px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
                                  alreadyGiven ? 'text-gold-light opacity-70' : 'text-slate-400 hover:bg-base-700 hover:text-gold-light'
                                }`}
                                title={t.home.kudosButton}
                              >
                                🎉 {kudosTotal > 0 ? kudosTotal : ''}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
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
