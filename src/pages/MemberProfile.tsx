import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import ProfileStatsOverview from '../components/ProfileStatsOverview'
import RankedStatsPanel from '../components/RankedStatsPanel'
import { CareerWindow, LifetimeWindow, MonthWindow, TrendsWindow } from '../components/ProfileWindows'
import { fetchMemberTrend, type SnapshotPoint } from '../lib/trends'
import { fetchClanScoreLedger, fmtScoreDelta, fmtRatioChange, type ClanScoreRow } from '../lib/clanScore'
import { cynPlayersByGame, memberWinScore, scoredGameIdsOf } from '../lib/winScore'
import { BadgeBoard } from '../components/Badges'
import { computeBadges } from '../lib/badges'
import { useCardSets } from '../lib/boosters'
import { useCardOverall } from '../lib/cardSnapshots'
import ProfileHeader from '../components/ProfileHeader'
import ProfileWall from '../components/ProfileWall'
import { useProfileExtras } from '../lib/profileExtras'
import { capsDonatedMap, useClanDonors } from '../lib/clanDonors'
import { GameDate, SectionHeading, Spinner } from '../components/ui'
import { GameActionsBar, useGameActions } from '../components/GameActionsBar'
import { eloChangeFor, fmtEloChange, gameModeLabel, isRankedGame, useRankedElo } from '../lib/gameRows'
import {
  currentMonthKey,
  ffaBucket,
  isTeam,
  is1v1,
  is2v2,
  isIncompleteRanked,
  monthLabel,
  oneVoneBucket,
  twoVTwoBucket,
  teamBucket,
} from '../lib/stats'
import { CLAN_TAG } from '../config'
import { useLanguage } from '../i18n/LanguageContext'
import { useIsAdmin } from '../lib/useSession'
import { isEventAdmin, addEventAdmin, removeEventAdmin } from '../lib/events'
import { isSupporter, addSupporter, removeSupporter } from '../lib/chat'

/** "Remove" that asks "Sure?" first: the second click within a few seconds removes the saved game. */
export default function MemberProfile() {
  const { id } = useParams()
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const [showLocked, setShowLocked] = useState(false)
  const [allGames, setAllGames] = useState(false)
  // own profile only: "Your last games" can be swiped to the ranked 1v1 and 2v2 breakdowns
  const [pane, setPane] = useState<'games' | '1v1' | '2v2'>('games')
  const { data, loading } = useRoster(!!profile)
  const [openGame, setOpenGame] = useState<string | null>(null)
  const { extras, reload: reloadExtras } = useProfileExtras(id)
  const donors = useClanDonors()
  const cardSets = useCardSets(!!profile)
  const cardOverall = useCardOverall(!!profile)
  const viewerIsAdmin = useIsAdmin()
  const [viewedIsAdmin, setViewedIsAdmin] = useState(false)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)
  const [viewedIsSupporter, setViewedIsSupporter] = useState(false)
  const [supporterMsg, setSupporterMsg] = useState<string | null>(null)
  const [trend, setTrend] = useState<SnapshotPoint[]>([])
  const [clanScores, setClanScores] = useState<Map<string, ClanScoreRow>>(new Map())
  const m = data?.members.find((x) => x.publicId === id)
  const isOwnProfile = profile?.openfront_id === m?.publicId
  // Clan Win Score of this member's team games of the month (the "this month" window shows it instead of points).
  const [teamLedger, setTeamLedger] = useState<Map<string, ClanScoreRow>>(new Map())
  const teamIds = m ? scoredGameIdsOf(m, currentMonthKey(), isTeam) : []
  useEffect(() => {
    if (teamIds.length === 0) {
      setTeamLedger(new Map())
      return
    }
    fetchClanScoreLedger(teamIds).then(setTeamLedger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIds.join(',')])

  const recentGameIds = (m?.cynGames ?? [])
    .filter((g) => g.type !== 'Private' && !isIncompleteRanked(g))
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, 20)
    .map((g) => g.gameId)

  useEffect(() => {
    if (!m?.discord || isOwnProfile) return
    let alive = true
    isEventAdmin(m.discord).then((result) => {
      if (alive) setViewedIsAdmin(result)
    })
    return () => {
      alive = false
    }
  }, [m?.discord, isOwnProfile])

  useEffect(() => {
    if (!m?.publicId) return
    let alive = true
    fetchMemberTrend(m.publicId).then((points) => {
      if (alive) setTrend(points)
    })
    isSupporter(m.publicId).then((result) => {
      if (alive) setViewedIsSupporter(result)
    })
    return () => {
      alive = false
    }
  }, [m?.publicId])

  // Warm the Max Tiles cache for the recent games shown below while the
  // visitor is browsing the profile, so opening one's report later is
  // instant instead of waiting on the replay - see prefetchGameTileStats.
  useEffect(() => {
    if (recentGameIds.length === 0) return
    import('../lib/replaySim').then(({ prefetchGameTileStats }) => prefetchGameTileStats(recentGameIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentGameIds.join(',')])

  // Win Score/Loss Score for the recent-games table below (see clanScore.ts) -
  // reuses the same recentGameIds already computed above for Max Tiles.
  useEffect(() => {
    if (recentGameIds.length === 0) return
    fetchClanScoreLedger(recentGameIds).then(setClanScores)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentGameIds.join(',')])

  async function onToggleAdmin() {
    if (!m?.discord) return
    const r = viewedIsAdmin ? await removeEventAdmin(m.discord) : await addEventAdmin(m.discord)
    setAdminMsg(r.message)
    if (r.ok) setViewedIsAdmin(!viewedIsAdmin)
  }

  async function onToggleSupporter() {
    if (!m?.publicId) return
    const r = viewedIsSupporter ? await removeSupporter(m.publicId) : await addSupporter(m.publicId)
    setSupporterMsg(r.message)
    if (r.ok) setViewedIsSupporter(!viewedIsSupporter)
  }

  // hooks of the last-games table (the games shown there), before any early return
  const shownGames = [...(m?.cynGames ?? [])]
    .filter((g) => g.type !== 'Private')
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, 20)
  const gameActions = useGameActions(shownGames.map((g) => g.gameId))
  const oneGames = useMemo(() => (m?.cynGames ?? []).filter(is1v1), [m])
  const twoGames = useMemo(() => (m?.cynGames ?? []).filter(is2v2), [m])
  const panes = ['games', '1v1', '2v2'] as const
  const swipe = useRef({ x: 0, y: 0 }).current // where the finger went down (a ref: a re-render between the touch start and end must not lose it)
  const eloByGame = useRankedElo(shownGames)

  if (!profile) return <RegistrationGate />
  if (loading) return <Spinner label={t.memberProfile.loadingMember} />
  if (!m) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-white">{t.memberProfile.notFoundTitle}</h1>
        <p className="mt-2 text-slate-400">{t.memberProfile.notFoundBody(CLAN_TAG)}</p>
        <Link to="/" className="btn-accent mt-6 inline-flex">{t.notFound.button}</Link>
      </div>
    )
  }

  const mk = currentMonthKey()
  const coop = data?.coopByGame ?? {}
  const ffa = ffaBucket(m.cynGames, mk)
  const team = teamBucket(m.cynGames, mk, coop)
  const one = oneVoneBucket(m.cynGames, mk)
  const twoVTwo = twoVTwoBucket(m.cynGames, mk)
  const teamWinScore = memberWinScore(m, mk, isTeam, teamLedger, cynPlayersByGame(data?.members ?? [], mk, isTeam))

  const recent = [...m.cynGames]
    .filter((g) => g.type !== 'Private')
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, 20)

  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m}m ${String(s % 60).padStart(2, '0')}s`
  }

  return (
    <div className="mx-auto grid max-w-[110rem] gap-6 md:grid-cols-2 2xl:grid-cols-[280px_minmax(0,1fr)_280px] 2xl:gap-8">
      <aside className="order-1 space-y-4 2xl:order-none 2xl:col-start-1 2xl:row-start-1 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100vh-3rem)] 2xl:overflow-y-auto 2xl:[scrollbar-width:thin] 2xl:self-start">
        <CareerWindow m={m} />
        <MonthWindow m={m} heading={`${t.memberProfile.thisMonthTitle} · ${monthLabel(mk)}`} ffa={ffa} team={team} teamWinScore={teamWinScore} one={one} twoVTwo={twoVTwo} />
      </aside>
      <aside className="order-2 space-y-4 2xl:order-none 2xl:col-start-3 2xl:row-start-1 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100vh-3rem)] 2xl:overflow-y-auto 2xl:[scrollbar-width:thin] 2xl:self-start">
        <LifetimeWindow publicId={m.publicId} />
        <TrendsWindow trend={trend} />
      </aside>
    <div className="order-3 mx-auto w-full min-w-0 max-w-4xl space-y-10 md:col-span-2 2xl:order-none 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1">
      <Link to="/" className="inline-block text-sm text-slate-400 hover:text-accent-light">{t.memberProfile.backToRoster}</Link>

      <ProfileHeader m={m} isOwn={isOwnProfile} viewerIsAdmin={viewerIsAdmin} extras={extras} reloadExtras={() => void reloadExtras()}>
        {!isOwnProfile && viewerIsAdmin && m.discord && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={onToggleAdmin}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  viewedIsAdmin ? 'bg-signal-red/15 text-signal-red hover:bg-signal-red/25' : 'bg-gold/15 text-gold-light hover:bg-gold/25'
                }`}
              >
                {viewedIsAdmin ? t.memberProfile.demoteFromAdmin : t.memberProfile.promoteToAdmin}
              </button>
              <button
                onClick={onToggleSupporter}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  viewedIsSupporter ? 'bg-signal-red/15 text-signal-red hover:bg-signal-red/25' : 'bg-gold/15 text-gold-light hover:bg-gold/25'
                }`}
              >
                {viewedIsSupporter ? t.memberProfile.unmarkSupporter : t.memberProfile.markSupporter}
              </button>
            </div>
            {adminMsg && <p className="text-xs text-slate-500">{adminMsg}</p>}
            {supporterMsg && <p className="text-xs text-slate-500">{supporterMsg}</p>}
          </div>
        )}
      </ProfileHeader>

      <section>
        <div className="mb-6 text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t.memberProfile.achievementsEyebrow}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <h2 className="font-display text-2xl font-bold text-white md:text-3xl">{t.memberProfile.badgesTitle}</h2>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-xs text-slate-300">
              <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} className="accent-[#8b5cf6]" />
              {language === 'de' ? 'Alle anzeigen' : 'Show all'}
            </label>
          </div>
        </div>
        <BadgeBoard badges={computeBadges(m, data?.members ?? [], t, { capsDonated: capsDonatedMap(donors), cardSets, cardOverall, de: language === 'de' })} showLocked={showLocked} />
      </section>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.recentEyebrow} title={t.memberProfile.statsOverviewTitle(recent.length)} />
        <ProfileStatsOverview member={m} games={recent} />
      </section>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.recentEyebrow} title={profile?.openfront_id === m.publicId ? t.memberProfile.yourLastGames : t.memberProfile.latestCynGames(CLAN_TAG)} />
        {isOwnProfile && (
          <div className="mb-4 flex items-center justify-center gap-2" role="tablist">
            <button type="button" aria-label={language === 'de' ? 'Zurück' : 'Previous'} disabled={pane === 'games'} onClick={() => setPane(panes[Math.max(0, panes.indexOf(pane) - 1)])} className="btn-ghost !px-2.5 !py-1 disabled:opacity-30">‹</button>
            {panes.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={pane === p} onClick={() => setPane(p)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${pane === p ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'}`}>
                {p === 'games' ? (language === 'de' ? 'Letzte Spiele' : 'Last games') : p}
              </button>
            ))}
            <button type="button" aria-label={language === 'de' ? 'Weiter' : 'Next'} disabled={pane === '2v2'} onClick={() => setPane(panes[Math.min(2, panes.indexOf(pane) + 1)])} className="btn-ghost !px-2.5 !py-1 disabled:opacity-30">›</button>
          </div>
        )}
        <div
          onTouchStart={(e) => {
            swipe.x = e.touches[0].clientX
            swipe.y = e.touches[0].clientY
          }}
          onTouchEnd={(e) => {
            if (!isOwnProfile) return
            const dx = e.changedTouches[0].clientX - swipe.x
            const dy = e.changedTouches[0].clientY - swipe.y
            // a clear sideways swipe (and not a scroll of the page or of the table): next / previous pane
            if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            const next = panes.indexOf(pane) + (dx < 0 ? 1 : -1)
            if (next >= 0 && next < panes.length) setPane(panes[next])
          }}
        >
        {isOwnProfile && pane !== 'games' ? (
          <RankedStatsPanel key={pane} ladder={pane} memberId={m.publicId} games={pane === '1v1' ? oneGames : twoGames} de={language === 'de'} />
        ) : (
        <>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[620px]">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.mode}</th>
                  <th className="px-4 py-3 text-right font-semibold">Win Score / Elo</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold">[{CLAN_TAG}] Ratio</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold">{t.common.table.players}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left font-semibold">{t.common.table.gameId}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                </tr>
              </thead>
              <>
                {(allGames ? recent : recent.slice(0, 10)).map((g) => {
                  const clanScore = clanScores.get(g.gameId)
                  const ratioChange = clanScore ? fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) : null
                  const elo = isRankedGame(g) ? eloChangeFor(eloByGame, g.gameId, [m.publicId]) : null
                  return (
                    <tbody key={g.gameId} className="hover:bg-base-800/50">
                    <tr onClick={() => setOpenGame(g.gameId)} className="cursor-pointer" title={t.home.clickForReportTitle}>
                      <td className="px-4 py-2.5 text-slate-400"><GameDate start={g.start} /></td>
                      <td className={`px-4 py-2.5 sm:whitespace-nowrap ${isRankedGame(g) ? 'font-medium text-gold-light' : 'text-slate-300'}`}>{gameModeLabel(g)}</td>
                      {isRankedGame(g) ? (
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${elo ? (elo.d >= 0 ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                          {elo ? (
                            <>
                              {elo.before != null && <span className="mr-1.5 font-normal text-slate-400">{elo.before}</span>}
                              {fmtEloChange(elo)}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                      ) : (
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${clanScore ? (clanScore.won ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                          {clanScore ? fmtScoreDelta(clanScore.score, clanScore.won) : '-'}
                        </td>
                      )}
                      <td className="hidden sm:table-cell px-4 py-2.5 text-right tabular-nums text-slate-400">{ratioChange ?? '-'}</td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-slate-400">{g.map}</td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-right tabular-nums text-slate-400">{g.totalPlayers ?? '-'}</td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                      <td className="hidden sm:table-cell px-4 py-2.5 font-mono text-xs text-slate-500">{g.gameId}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                        {g.result}
                      </td>
                    </tr>
                    <tr onClick={() => setOpenGame(g.gameId)} className="cursor-pointer border-b border-base-700/50">
                      <td colSpan={9} className="px-3 pb-2">
                        <GameActionsBar gameId={g.gameId} memberIds={[m.publicId]} title={`${gameModeLabel(g)} · ${g.map}`} actions={gameActions} onOpenComments={(id) => setOpenGame(id)} />
                      </td>
                    </tr>
                    </tbody>
                  )
                })}
              </>
            </table>
          </div>
        </div>
        {recent.length > 10 && (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => setAllGames((v) => !v)} className="btn-ghost text-sm">
              {allGames ? t.common.showTopOnly(10) : t.common.showAll(recent.length)}
            </button>
          </div>
        )}
        <p className="mt-2 text-center text-xs text-slate-500">{t.memberProfile.clickForReport}</p>
        </>
        )}
        </div>
      </section>

      <ProfileWall profileId={m.publicId} />

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </div>
    </div>
  )
}
