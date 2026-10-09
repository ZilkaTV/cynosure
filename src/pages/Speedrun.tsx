import { useEffect, useRef, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { Card, MemberNameLink, SectionHeading, Spinner } from '../components/ui'
import { Emoji, EMOJI, RankMedal } from '../components/Emoji'
import { fmtTime, fmtPercent, submitSpeedrun, replayToolUrl, fetchRecentSoloGames, type SubmitResult } from '../lib/speedruns'
import { useLanguage } from '../i18n/LanguageContext'

const WATCH_POLL_MS = 20_000
const WATCH_MAX_MS = 90 * 60 * 1000
// OpenFront opens straight on its solo menu with this hash; the Steam app id is from its store page.
const OPENFRONT_SOLO_URL = 'https://openfront.io/#modal=single-player'
const OPENFRONT_STEAM_URL = 'steam://run/3560670'

export default function Speedrun() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading, refresh } = useRoster(!!profile)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  // 0..1 while a submission replays the game (the replay takes 20-30 s), null otherwise.
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  // Set when the player pressed one of the Start buttons: the page then polls for their finished run.
  const [watchSince, setWatchSince] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const handled = useRef(new Set<string>())
  const profileId = profile?.openfront_id
  const profileName = profile?.in_game_name

  useEffect(() => {
    if (watchSince == null || !profileId || !profileName) return
    let inFlight = false
    const tick = async () => {
      if (inFlight) return
      if (Date.now() - watchSince > WATCH_MAX_MS) {
        setWatchSince(null)
        setTimedOut(true)
        return
      }
      inFlight = true
      try {
        const games = await fetchRecentSoloGames(profileId)
        // 5 min of tolerance for clock differences between this device and OpenFront.
        const g = games.find(
          (x) => !handled.current.has(x.gameId) && x.map === 'Australia' && x.result === 'victory' && Date.parse(x.start) >= watchSince - 5 * 60 * 1000,
        )
        if (!g) return
        handled.current.add(g.gameId)
        setWatchSince(null)
        setBusy(true)
        setProgress(0)
        const r = await submitSpeedrun(profileId, g.gameId, profileName, setProgress)
        setProgress(null)
        setResult(r)
        setBusy(false)
        if (r.ok && r.best) refresh()
      } catch {
        /* temporary network / rate-limit problem - the next tick tries again */
      } finally {
        inFlight = false
      }
    }
    const timer = setInterval(tick, WATCH_POLL_MS)
    return () => clearInterval(timer)
  }, [watchSince, profileId, profileName, refresh])

  const startWatching = () => {
    setResult(null)
    setTimedOut(false)
    setWatchSince(Date.now())
  }

  if (!profile) return <RegistrationGate />

  const board = (data?.members ?? [])
    .filter((m) => m.speedrunSeconds != null)
    .sort((a, b) => (a.speedrunSeconds ?? 0) - (b.speedrunSeconds ?? 0))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setResult(null)
    setProgress(0)
    const r = await submitSpeedrun(profile.openfront_id, link, profile.in_game_name, setProgress)
    setProgress(null)
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
        <SectionHeading center eyebrow={t.speedrun.eyebrowChallenge} title={t.speedrun.startTitle} />
        <Card className="space-y-3 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <a href={OPENFRONT_SOLO_URL} target="_blank" rel="noreferrer" onClick={startWatching} className="btn-accent">
              {t.speedrun.startBrowser}
            </a>
            <a href={OPENFRONT_STEAM_URL} onClick={startWatching} className="rounded-lg border border-base-600 bg-base-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-base-700">
              {t.speedrun.startSteam}
            </a>
          </div>
          <p className="text-sm text-slate-300">{t.speedrun.startSteps}</p>
          <p className="text-xs text-slate-500">{t.speedrun.startNote}</p>
          {watchSince != null && (
            <p className="flex flex-wrap items-center justify-center gap-3 text-sm text-gold-light">
              <span>{t.speedrun.watching}</span>
              <button type="button" onClick={() => setWatchSince(null)} className="text-xs text-slate-400 underline hover:text-white">
                {t.speedrun.watchStop}
              </button>
            </p>
          )}
          {timedOut && <p className="text-sm text-slate-400">{t.speedrun.watchTimeout}</p>}
          {result && watchSince == null && (
            <p className={`text-sm ${result.ok ? 'text-signal-green' : 'text-signal-red'}`}>
              {result.ok ? '✓ ' : '✗ '}
              {result.message}
            </p>
          )}
        </Card>
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
          {progress != null && (
            <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
              <p className="text-sm text-gold-light">{t.speedrun.replaying}</p>
              <div className="h-2 overflow-hidden rounded-full bg-base-700">
                <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
              </div>
              <p className="text-xs text-slate-500">{t.speedrun.replayingHint}</p>
            </div>
          )}
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.monthly.colName}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.speedrun.colAttempts}</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <Emoji char={EMOJI.globeAfrica} className="h-3.5 w-3.5" /> {t.speedrun.colTiles3min}
                      </span>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">{t.speedrun.colBestTime}</th>
                    <th className="px-4 py-3 text-center font-semibold" title={t.speedrun.verifiedHint}>{t.speedrun.colVerified}</th>
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
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {m.tiles3minPercent != null ? fmtPercent(m.tiles3minPercent) : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-display text-lg font-bold text-gold-light tabular-nums">
                        {fmtTime(m.speedrunSeconds ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-center" title={m.speedrunVerified ? t.speedrun.verifiedHint : t.speedrun.notVerifiedHint}>
                        {m.speedrunVerified ? (
                          <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label={t.speedrun.verifiedHint}>
                            <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                            <path d="M7.5 12.5l3 3 6-7" />
                          </svg>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
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
          </div>
        )}
      </section>
    </StatsShell>
  )
}
