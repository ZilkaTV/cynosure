import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import { BadgeBoard } from '../components/Badges'
import { computeBadges } from '../lib/badges'
import { BumpCard } from '../components/BumpButton'
import { Card, EloDelta, SectionHeading, StatCard, Spinner } from '../components/ui'
import {
  currentMonthKey,
  ffaBucket,
  isFfa,
  isTeam,
  is1v1,
  monthLabel,
  oneVoneBucket,
  teamBucket,
} from '../lib/stats'
import { CLAN_TAG } from '../config'
import { useLanguage } from '../i18n/LanguageContext'
import { useIsAdmin } from '../lib/useSession'
import { isEventAdmin, addEventAdmin, removeEventAdmin } from '../lib/events'

export default function MemberProfile() {
  const { id } = useParams()
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading, refresh } = useRoster(!!profile)
  const [openGame, setOpenGame] = useState<string | null>(null)
  const viewerIsAdmin = useIsAdmin()
  const [viewedIsAdmin, setViewedIsAdmin] = useState(false)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)

  const m = data?.members.find((x) => x.publicId === id)
  const isOwnProfile = profile?.openfront_id === m?.publicId

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

  async function onToggleAdmin() {
    if (!m?.discord) return
    const r = viewedIsAdmin ? await removeEventAdmin(m.discord) : await addEventAdmin(m.discord)
    setAdminMsg(r.message)
    if (r.ok) setViewedIsAdmin(!viewedIsAdmin)
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

  const recent = [...m.cynGames]
    .filter((g) => g.type !== 'Private')
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, 12)

  const modeLabel = (g: (typeof recent)[number]) => (is1v1(g) ? '1v1' : isTeam(g) ? 'Team' : isFfa(g) ? 'FFA' : g.mode)
  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m}m ${String(s % 60).padStart(2, '0')}s`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <Link to="/" className="inline-block text-sm text-slate-400 hover:text-accent-light">{t.memberProfile.backToRoster}</Link>

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t.memberProfile.memberBadge(CLAN_TAG)}</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-white">
          {m.name}
          {isOwnProfile && viewerIsAdmin && (
            <span className="ml-2 align-middle rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gold-light">
              {t.accountMenu.adminBadge}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {m.timezone && <span>{m.timezone}</span>}
          {m.discord && <span> · {t.memberProfile.discordPrefix} {m.discord}</span>}
        </p>
        {isOwnProfile ? (
          <div className="mx-auto mt-4 max-w-xs">
            <BumpCard openfrontId={m.publicId} bumpCount={m.bumpCount} lastBumpAt={m.lastBumpAt} onDone={refresh} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{t.memberProfile.bumpsCount(m.bumpCount)}</p>
        )}
        {!isOwnProfile && viewerIsAdmin && m.discord && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <button
              onClick={onToggleAdmin}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewedIsAdmin ? 'bg-signal-red/15 text-signal-red hover:bg-signal-red/25' : 'bg-gold/15 text-gold-light hover:bg-gold/25'
              }`}
            >
              {viewedIsAdmin ? t.memberProfile.demoteFromAdmin : t.memberProfile.promoteToAdmin}
            </button>
            {adminMsg && <p className="text-xs text-slate-500">{adminMsg}</p>}
          </div>
        )}
      </div>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.lifetimeEyebrow} title={t.memberProfile.careerTitle(CLAN_TAG)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t.memberProfile.stat1v1Elo} value={m.elo ?? '-'} accent="gold" sub={m.peakElo ? t.memberProfile.peakPrefix(m.peakElo) : undefined} />
          <StatCard label={t.memberProfile.statFfaWins} value={m.ffaWins} accent="purple" />
          <StatCard label={t.memberProfile.statTeamWins} value={m.teamWins} accent="purple" />
          <StatCard label={t.memberProfile.stat1v1Wins} value={m.rankedWins} accent="purple" />
          <StatCard label={t.memberProfile.statAllWins} value={m.allWins} accent="gold" />
          <StatCard label={t.memberProfile.statGames30d} value={m.gamesLast30d} accent="plain" />
        </div>
        {m.elo == null && (
          <p className="mt-2 text-center text-xs text-slate-500">{t.memberProfile.noEloNote}</p>
        )}
      </section>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.achievementsEyebrow} title={t.memberProfile.badgesTitle} />
        <BadgeBoard badges={computeBadges(m, data?.members ?? [], t)} />
      </section>

      <section>
        <SectionHeading center eyebrow={monthLabel(mk)} title={t.memberProfile.thisMonthTitle} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.monthly.titleFfa}</p>
            <p className="mt-1 font-display text-2xl font-bold text-accent-light">{t.common.pts(ffa.points)}</p>
            <p className="text-xs text-slate-500">{t.common.winsLosses(ffa.wins, ffa.losses)}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.monthly.titleTeam}</p>
            <p className="mt-1 font-display text-2xl font-bold text-accent-light">{t.common.pts(team.points)}</p>
            <p className="text-xs text-slate-500">{t.common.winsLosses(team.wins, team.losses)}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.home.col1v1}</p>
            <p className="mt-1 font-display text-2xl font-bold text-gold-light">
              <EloDelta delta={m.eloMonthDelta} />
            </p>
            <p className="text-xs text-slate-500">{t.common.winsLosses(one.wins, one.losses)}</p>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeading center eyebrow={t.memberProfile.recentEyebrow} title={profile?.openfront_id === m.publicId ? t.memberProfile.yourLastGames : t.memberProfile.latestCynGames(CLAN_TAG)} />
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.mode}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.players}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.common.table.gameId}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => (
                  <tr
                    key={g.gameId}
                    onClick={() => setOpenGame(g.gameId)}
                    className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                    title={t.home.clickForReportTitle}
                  >
                    <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-2.5 text-slate-300">{modeLabel(g)}</td>
                    <td className="px-4 py-2.5 text-slate-400">{g.map}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{g.totalPlayers ?? '-'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{g.gameId}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                      {g.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">{t.memberProfile.clickForReport}</p>
      </section>

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </div>
  )
}
