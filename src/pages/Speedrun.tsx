import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { Card, SectionHeading, Spinner } from '../components/ui'
import { Emoji, EMOJI, RankMedal } from '../components/Emoji'
import { fmtTime, submitSpeedrun, replayToolUrl, type SubmitResult } from '../lib/speedruns'
import { useLanguage } from '../i18n/LanguageContext'

export default function Speedrun() {
  const { profile } = useProfile()
  const { t } = useLanguage()
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
    const r = await submitSpeedrun(profile.openfront_id, link, profile.in_game_name)
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
        <SectionHeading center eyebrow={t.speedrun.eyebrowChallenge} title={t.speedrun.title} />
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-5 py-4 text-center">
          <p className="flex items-center justify-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-gold-light">
            <Emoji char={EMOJI.flag} className="h-5 w-5" /> {t.speedrun.ruleBadge}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {t.speedrun.introPrefix} <span className="font-semibold text-white">Australia</span> {t.speedrun.introMid}{' '}
            <span className="font-semibold text-white">{t.speedrun.introNationsDisabled}</span> {t.speedrun.introSuffix}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading center eyebrow={t.speedrun.eyebrowSubmit} title={t.speedrun.postYourRun} />
        <Card>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t.speedrun.linkPlaceholder}
              className="flex-1 rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={busy || !link.trim()} className="btn-accent disabled:opacity-60">
              {busy ? t.speedrun.verifying : t.speedrun.verifyAndSubmit}
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
                  {t.speedrun.openReplayTool}
                </a>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">{t.speedrun.submitNote}</p>
        </Card>
      </section>

      <section>
        <div className="rounded-xl border border-base-600 bg-base-850/60 px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{t.speedrun.fairnessLabel}</p>
          <p className="text-xs text-slate-400">{t.speedrun.fairnessText}</p>
        </div>
      </section>

      <TagNotice />

      <section className="space-y-4">
        <SectionHeading center eyebrow={t.speedrun.leaderboardEyebrow} title={t.speedrun.bestTimes} />
        {loading && <Spinner label={t.speedrun.loadingTimes} />}
        {data && board.length === 0 && (
          <p className="panel px-5 py-8 text-center text-sm text-slate-500">{t.speedrun.noRuns}</p>
        )}
        {board.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.monthly.colName}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.speedrun.colAttempts}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.speedrun.colBestTime}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.speedrun.colGame}</th>
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
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">{m.speedrunAttempts}</td>
                    <td className="px-4 py-3 text-right font-display text-lg font-bold text-gold-light tabular-nums">
                      {fmtTime(m.speedrunSeconds ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {m.speedrunGameId ? (
                        <a
                          href={replayToolUrl(m.speedrunGameId)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-accent-light underline decoration-dotted hover:text-accent"
                          title={t.speedrun.watchInReplayTool}
                        >
                          {m.speedrunGameId}
                        </a>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
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
