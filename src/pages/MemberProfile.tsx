import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import ProfileStatsOverview from '../components/ProfileStatsOverview'
import { CareerWindow, LifetimeWindow, MonthWindow, TrendsWindow } from '../components/ProfileWindows'
import { fetchMemberTrend, type SnapshotPoint } from '../lib/trends'
import { fetchClanScoreLedger, fmtScoreDelta, fmtRatioChange, type ClanScoreRow } from '../lib/clanScore'
import { cynPlayersByGame, memberWinScore, scoredGameIdsOf } from '../lib/winScore'
import { BadgeBoard } from '../components/Badges'
import { computeBadges } from '../lib/badges'
import { Flag } from '../components/Emoji'
import { splitAccountUsername } from '../lib/openfront'
import { cleanDisplayName } from '../lib/displayName'
import { SectionHeading, Spinner } from '../components/ui'
import {
  currentMonthKey,
  ffaBucket,
  isFfa,
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
import { unsaveGame, useSavedGames } from '../lib/savedGames'
import { useIsAdmin } from '../lib/useSession'
import { isEventAdmin, addEventAdmin, removeEventAdmin } from '../lib/events'
import { isChatModerator, addChatModerator, removeChatModerator, isSupporter, addSupporter, removeSupporter } from '../lib/chat'

export default function MemberProfile() {
  const { id } = useParams()
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading } = useRoster(!!profile)
  const [openGame, setOpenGame] = useState<string | null>(null)
  const savedGames = useSavedGames(profile?.openfront_id)
  // The menu entry "Saved games" links to #saved: scroll there once the profile has rendered.
  useEffect(() => {
    if (window.location.hash !== '#saved') return
    const timer = setTimeout(() => document.getElementById('saved')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
    return () => clearTimeout(timer)
  }, [id, data])
  const viewerIsAdmin = useIsAdmin()
  const [viewedIsAdmin, setViewedIsAdmin] = useState(false)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)
  const [viewedIsModerator, setViewedIsModerator] = useState(false)
  const [moderatorMsg, setModeratorMsg] = useState<string | null>(null)
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
    isChatModerator(m.discord).then((result) => {
      if (alive) setViewedIsModerator(result)
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

  async function onToggleModerator() {
    if (!m?.discord) return
    const r = viewedIsModerator ? await removeChatModerator(m.discord) : await addChatModerator(m.discord)
    setModeratorMsg(r.message)
    if (r.ok) setViewedIsModerator(!viewedIsModerator)
  }

  async function onToggleSupporter() {
    if (!m?.publicId) return
    const r = viewedIsSupporter ? await removeSupporter(m.publicId) : await addSupporter(m.publicId)
    setSupporterMsg(r.message)
    if (r.ok) setViewedIsSupporter(!viewedIsSupporter)
  }

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

  const modeLabel = (g: (typeof recent)[number]) => (is1v1(g) ? '1v1' : is2v2(g) ? '2v2' : isTeam(g) ? 'Team' : isFfa(g) ? 'FFA' : g.mode)
  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m}m ${String(s % 60).padStart(2, '0')}s`
  }

  return (
    <div className="mx-auto grid max-w-[110rem] gap-6 md:grid-cols-2 2xl:grid-cols-[280px_minmax(0,1fr)_280px] 2xl:gap-8">
      <aside className="order-1 space-y-4 2xl:order-none 2xl:col-start-1 2xl:row-start-1 2xl:self-start">
        <CareerWindow m={m} />
        <MonthWindow m={m} heading={`${t.memberProfile.thisMonthTitle} · ${monthLabel(mk)}`} ffa={ffa} team={team} teamWinScore={teamWinScore} one={one} twoVTwo={twoVTwo} />
      </aside>
      <aside className="order-2 space-y-4 2xl:order-none 2xl:col-start-3 2xl:row-start-1 2xl:self-start">
        <LifetimeWindow publicId={m.publicId} />
        <TrendsWindow trend={trend} />
      </aside>
    <div className="order-3 mx-auto w-full min-w-0 max-w-4xl space-y-10 md:col-span-2 2xl:order-none 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1">
      <Link to="/" className="inline-block text-sm text-slate-400 hover:text-accent-light">{t.memberProfile.backToRoster}</Link>

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t.memberProfile.memberBadge(CLAN_TAG)}</p>
        <h1 className="mt-1 inline-flex items-center gap-2 font-display text-3xl font-bold text-white">
          {m.nationality && <Flag code={m.nationality} className="h-5 w-7" />}
          {cleanDisplayName(m.name)}
          {isOwnProfile && viewerIsAdmin && (
            <span className="ml-2 align-middle rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gold-light">
              {t.accountMenu.adminBadge}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {m.timezone && <span>{m.timezone}</span>}
          {m.discord && <span> · {t.memberProfile.discordPrefix} {m.discord}</span>}
          {m.accountUsername && (
            <span>
              {' '}
              · {t.memberProfile.accountUsernamePrefix}{' '}
              {(() => {
                const { base, discriminator } = splitAccountUsername(m.accountUsername)
                return (
                  <>
                    {base}
                    {discriminator && <span className="text-slate-600">#{discriminator}</span>}
                  </>
                )
              })()}
            </span>
          )}
        </p>
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
                onClick={onToggleModerator}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  viewedIsModerator ? 'bg-signal-red/15 text-signal-red hover:bg-signal-red/25' : 'bg-accent/15 text-accent-light hover:bg-accent/25'
                }`}
              >
                {viewedIsModerator ? t.memberProfile.demoteFromModerator : t.memberProfile.promoteToModerator}
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
            {moderatorMsg && <p className="text-xs text-slate-500">{moderatorMsg}</p>}
            {supporterMsg && <p className="text-xs text-slate-500">{supporterMsg}</p>}
          </div>
        )}
      </div>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.achievementsEyebrow} title={t.memberProfile.badgesTitle} />
        <BadgeBoard badges={computeBadges(m, data?.members ?? [], t)} />
      </section>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.recentEyebrow} title={t.memberProfile.statsOverviewTitle(recent.length)} />
        <ProfileStatsOverview member={m} games={recent} />
      </section>

      {profile?.openfront_id === m.publicId && (
        <section id="saved" className="scroll-mt-6">
          <SectionHeading center eyebrow={t.memberProfile.savedEyebrow} title={t.memberProfile.savedTitle} />
          <div className="panel divide-y divide-base-700/60">
            {savedGames.games.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">{t.memberProfile.savedEmpty}</p>
            ) : (
              savedGames.games.map((g) => (
                <div key={g.game_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <button type="button" onClick={() => setOpenGame(g.game_id)} className="font-mono text-accent-light underline-offset-2 hover:underline">
                    {g.game_id}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-slate-300">{g.title ?? ''}</span>
                  <span className="text-xs text-slate-500">{new Date(g.saved_at).toLocaleDateString()}</span>
                  <button type="button" onClick={() => void unsaveGame(profile.openfront_id, g.game_id)} className="text-xs text-slate-500 hover:text-signal-red">
                    {t.memberProfile.savedRemove}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <section>
        <SectionHeading center eyebrow={t.memberProfile.recentEyebrow} title={profile?.openfront_id === m.publicId ? t.memberProfile.yourLastGames : t.memberProfile.latestCynGames(CLAN_TAG)} />
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.mode}</th>
                  <th className="px-4 py-3 text-right font-semibold">Win Score</th>
                  <th className="px-4 py-3 text-right font-semibold">[{CLAN_TAG}] Ratio</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.players}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.gameId}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => {
                  const clanScore = clanScores.get(g.gameId)
                  const ratioChange = clanScore ? fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) : null
                  return (
                    <tr
                      key={g.gameId}
                      onClick={() => setOpenGame(g.gameId)}
                      className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                      title={t.home.clickForReportTitle}
                    >
                      <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-2.5 text-slate-300">{modeLabel(g)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${clanScore ? (clanScore.won ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                        {clanScore ? fmtScoreDelta(clanScore.score, clanScore.won) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{ratioChange ?? '-'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{g.map}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{g.totalPlayers ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{g.gameId}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                        {g.result}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">{t.memberProfile.clickForReport}</p>
      </section>

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </div>
    </div>
  )
}
