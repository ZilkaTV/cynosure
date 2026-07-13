import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import { BadgeBoard } from '../components/Badges'
import { computeBadges } from '../lib/badges'
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

export default function MemberProfile() {
  const { id } = useParams()
  const { profile } = useProfile()
  const { data, loading } = useRoster(!!profile)
  const [openGame, setOpenGame] = useState<string | null>(null)

  if (!profile) return <RegistrationGate />
  if (loading) return <Spinner label="Loading member…" />

  const m = data?.members.find((x) => x.publicId === id)
  if (!m) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Member not found</h1>
        <p className="mt-2 text-slate-400">Only registered [{CLAN_TAG}] members have a profile.</p>
        <Link to="/" className="btn-accent mt-6 inline-flex">Back to overview</Link>
      </div>
    )
  }

  const mk = currentMonthKey()
  const coop = data?.coopByGame ?? {}
  const ffa = ffaBucket(m.cynGames, mk)
  const team = teamBucket(m.cynGames, mk, coop)
  const one = oneVoneBucket(m.cynGames, mk)

  const recent = [...m.cynGames]
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, 12)

  const modeLabel = (g: (typeof recent)[number]) => (is1v1(g) ? '1v1' : isTeam(g) ? 'Team' : isFfa(g) ? 'FFA' : g.mode)
  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m}m ${String(s % 60).padStart(2, '0')}s`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <Link to="/" className="inline-block text-sm text-slate-400 hover:text-accent-light">← Back to roster</Link>

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">[{CLAN_TAG}] Member</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-white">{m.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {m.timezone && <span>{m.timezone}</span>}
          {m.discord && <span> · Discord: {m.discord}</span>}
        </p>
      </div>

      <section>
        <SectionHeading center eyebrow="Lifetime" title="Career (CYN tag only)" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="1v1 Elo" value={m.elo ?? '-'} accent="gold" sub={m.peakElo ? `peak ${m.peakElo}` : undefined} />
          <StatCard label="FFA Wins" value={m.ffaWins} accent="purple" />
          <StatCard label="Team Wins" value={m.teamWins} accent="purple" />
          <StatCard label="1v1 Wins" value={m.rankedWins} accent="purple" />
          <StatCard label="All Wins" value={m.allWins} accent="gold" />
          <StatCard label="Games (30d)" value={m.gamesLast30d} accent="plain" />
        </div>
        {m.elo == null && (
          <p className="mt-2 text-center text-xs text-slate-500">
            No live elo - this member isn’t in OpenFront’s global top 100 ranked ladder.
          </p>
        )}
      </section>

      <section>
        <SectionHeading center eyebrow="Achievements" title="Badges" />
        <BadgeBoard badges={computeBadges(m, data?.members ?? [])} />
      </section>

      <section>
        <SectionHeading center eyebrow={monthLabel(mk)} title="This Month" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">FFA</p>
            <p className="mt-1 font-display text-2xl font-bold text-accent-light">{ffa.points} pts</p>
            <p className="text-xs text-slate-500">{ffa.wins}W · {ffa.losses}L</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">Team</p>
            <p className="mt-1 font-display text-2xl font-bold text-accent-light">{team.points} pts</p>
            <p className="text-xs text-slate-500">{team.wins}W · {team.losses}L</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">1v1</p>
            <p className="mt-1 font-display text-2xl font-bold text-gold-light">
              <EloDelta delta={m.eloMonthDelta} />
            </p>
            <p className="text-xs text-slate-500">{one.wins}W · {one.losses}L</p>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeading center eyebrow="Recent" title="Latest CYN games" />
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Mode</th>
                  <th className="px-4 py-3 text-left font-semibold">Map</th>
                  <th className="px-4 py-3 text-right font-semibold">Players</th>
                  <th className="px-4 py-3 text-right font-semibold">Duration</th>
                  <th className="px-4 py-3 text-left font-semibold">Game ID</th>
                  <th className="px-4 py-3 text-right font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => (
                  <tr
                    key={g.gameId}
                    onClick={() => setOpenGame(g.gameId)}
                    className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                    title="Click for the full post-game report"
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
        <p className="mt-2 text-center text-xs text-slate-500">Click a game for the full post-game report.</p>
      </section>

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </div>
  )
}
