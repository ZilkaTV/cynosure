import { useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { Card, MemberNameLink, SectionHeading, Spinner } from '../components/ui'
import { Emoji, EMOJI, RankMedal } from '../components/Emoji'
import { fmtTime, submitSpeedrun, replayToolUrl, type SubmitResult } from '../lib/speedruns'
import { fmtPercent, submitTiles3Min, type SubmitTiles3MinResult } from '../lib/tiles3min'
import { useLanguage } from '../i18n/LanguageContext'

export default function Speedrun() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading, refresh } = useRoster(!!profile)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [tilesLink, setTilesLink] = useState('')
  const [tilesBusy, setTilesBusy] = useState(false)
  const [tilesResult, setTilesResult] = useState<SubmitTiles3MinResult | null>(null)

  if (!profile) return <RegistrationGate />

  const board = (data?.members ?? [])
    .filter((m) => m.speedrunSeconds != null)
    .sort((a, b) => (a.speedrunSeconds ?? 0) - (b.speedrunSeconds ?? 0))

  const tilesBoard = (data?.members ?? [])
    .filter((m) => m.tiles3minPercent != null)
    .sort((a, b) => (b.tiles3minPercent ?? 0) - (a.tiles3minPercent ?? 0))

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

  async function onSubmitTiles(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setTilesBusy(true)
    setTilesResult(null)
    const r = await submitTiles3Min(profile.openfront_id, tilesLink, profile.in_game_name)
    setTilesResult(r)
    setTilesBusy(false)
    if (r.ok && r.best) {
      setTilesLink('')
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
                      <MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} />
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

      <section className="space-y-4">
        <SectionHeading center eyebrow={t.tiles3min.eyebrowChallenge} title={t.tiles3min.title} />
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-5 py-4 text-center">
          <p className="flex items-center justify-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-gold-light">
            <Emoji char={EMOJI.globeAfrica} className="h-5 w-5" /> {t.tiles3min.ruleBadge}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {t.tiles3min.introPrefix} <span className="font-semibold text-white">Australia</span> {t.tiles3min.introMid}{' '}
            <span className="font-semibold text-white">{t.tiles3min.introNationsDisabled}</span> {t.tiles3min.introSuffix}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading center eyebrow={t.tiles3min.eyebrowSubmit} title={t.tiles3min.postYourRun} />
        <Card>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmitTiles}>
            <input
              value={tilesLink}
              onChange={(e) => setTilesLink(e.target.value)}
              placeholder={t.tiles3min.linkPlaceholder}
              className="flex-1 rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={tilesBusy || !tilesLink.trim()} className="btn-accent disabled:opacity-60">
              {tilesBusy ? t.tiles3min.verifying : t.tiles3min.verifyAndSubmit}
            </button>
          </form>
          {tilesResult && (
            <div className={`mt-3 text-sm ${tilesResult.ok ? 'text-signal-green' : 'text-signal-red'}`}>
              <p>
                {tilesResult.ok ? '✓ ' : '✗ '}
                {tilesResult.message}
              </p>
              {tilesResult.replayUrl && (
                <a href={tilesResult.replayUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-accent-light underline hover:text-accent">
                  {t.tiles3min.openReplayTool}
                </a>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">{t.tiles3min.submitNote}</p>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading center eyebrow={t.tiles3min.leaderboardEyebrow} title={t.tiles3min.bestPercents} />
        {loading && <Spinner label={t.tiles3min.loadingPercents} />}
        {data && tilesBoard.length === 0 && (
          <p className="panel px-5 py-8 text-center text-sm text-slate-500">{t.tiles3min.noRuns}</p>
        )}
        {tilesBoard.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.monthly.colName}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.tiles3min.colAttempts}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t.tiles3min.colBestPercent}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t.tiles3min.colGame}</th>
                </tr>
              </thead>
              <tbody>
                {tilesBoard.map((m, i) => (
                  <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                    <td className="px-4 py-3 font-display font-bold">
                      <RankMedal rank={i + 1} />
                    </td>
                    <td className="px-4 py-3">
                      <MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">{m.tiles3minAttempts}</td>
                    <td className="px-4 py-3 text-right font-display text-lg font-bold text-gold-light tabular-nums">
                      {fmtPercent(m.tiles3minPercent ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {m.tiles3minGameId ? (
                        <a
                          href={replayToolUrl(m.tiles3minGameId)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-accent-light underline decoration-dotted hover:text-accent"
                          title={t.tiles3min.watchInReplayTool}
                        >
                          {m.tiles3minGameId}
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
