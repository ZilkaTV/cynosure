import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { Card, SectionHeading, Spinner } from '../components/ui'
import { FlagIcon, RankMedal } from '../components/Icons'
import { fmtTime, submitSpeedrun, SPEEDRUN_RULE, type SubmitResult } from '../lib/speedruns'

export default function Speedrun() {
  const { profile } = useProfile()
  const { data, loading, refresh } = useRoster(!!profile)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  if (!profile) return <RegistrationGate />

  const board = (data?.members ?? [])
    .filter((m) => m.speedrunSeconds != null)
    .sort((a, b) => (a.speedrunSeconds ?? 0) - (b.speedrunSeconds ?? 0))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setResult(null)
    const r = await submitSpeedrun(profile.openfront_id, link)
    setResult(r)
    setBusy(false)
    if (r.ok && r.best) {
      setLink('')
      refresh()
    }
  }

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow="Challenge" title="Speedrun" />
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-5 py-4 text-center">
          <p className="flex items-center justify-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-gold-light">
            <FlagIcon className="h-5 w-5" /> {SPEEDRUN_RULE}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Play a solo game on <span className="font-semibold text-white">Australia</span> with{' '}
            <span className="font-semibold text-white">nations disabled</span> and{' '}
            <span className="font-semibold text-white">no bots</span>, then submit the game link. Fastest
            completion wins.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading center eyebrow="Submit" title="Post your run" />
        <Card>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Game link or id, e.g. https://openfront.io/#… or GEiyYVf3"
              className="flex-1 rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={busy || !link.trim()} className="btn-accent disabled:opacity-60">
              {busy ? 'Verifying…' : 'Verify & submit'}
            </button>
          </form>
          {result && (
            <div className={`mt-3 text-sm ${result.ok ? 'text-signal-green' : 'text-signal-red'}`}>
              <p>
                {result.ok ? '✓ ' : '✗ '}
                {result.message}
              </p>
              {result.replayUrl && (
                <a href={result.replayUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-accent-light underline hover:text-accent">
                  Open in replay tool ↗
                </a>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            The site pulls the game from OpenFront and checks every rule automatically. Only your own
            fastest valid run is kept. Old-version games can't be auto-verified - use the replay tool link
            above with the game id to check them manually.
          </p>
        </Card>
      </section>

      <section>
        <div className="rounded-xl border border-base-600 bg-base-850/60 px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">A note on fairness</p>
          <p className="text-xs text-slate-400">
            Solo games run in your own browser, so a player could change the in-game replay speed while
            playing to shorten the recorded time. OpenFront's public data doesn't expose anything that would
            reveal this, so it can't be auto-detected. Staff can review a run's replay for anything that looks
            off, and any confirmed abuse gets a run removed.
          </p>
        </div>
      </section>

      <TagNotice />

      <section className="space-y-4">
        <SectionHeading center eyebrow="Leaderboard" title="Best Times" />
        {loading && <Spinner label="Loading times…" />}
        {data && board.length === 0 && (
          <p className="panel px-5 py-8 text-center text-sm text-slate-500">No verified runs yet - be the first!</p>
        )}
        {board.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-right font-semibold">Best Time</th>
                </tr>
              </thead>
              <tbody>
                {board.map((m, i) => (
                  <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                    <td className="px-4 py-3 font-display font-bold">
                      <RankMedal rank={i + 1} />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/member/${m.publicId}`} className="font-medium text-white hover:text-accent-light">{m.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right font-display text-lg font-bold text-gold-light tabular-nums">
                      {fmtTime(m.speedrunSeconds ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </StatsShell>
  )
}
