import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useSession, discordDisplayName } from '../lib/useSession'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card, Spinner } from '../components/ui'
import { Flag, RankMedal } from '../components/Emoji'
import { EVENTS, type ClanEvent } from '../data/events'
import { fetchTopClanLeaderboard } from '../lib/clanScore'
import { CLAN_TAG } from '../config'
import FactorWheel from '../components/FactorWheel'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationShape } from '../i18n/translations'
import {
  fetchEventTeams,
  fetchEventSubmissions,
  fetchEventAdmins,
  addEventAdmin,
  removeEventAdmin,
  computeStandings,
  isEventAdmin,
  submitEventEntry,
  reviewSubmission,
  safeHttpUrl,
  CATEGORY_POINTS,
  type EventTeam,
  type EventSubmission,
  type SubmissionCategory,
} from '../lib/events'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_STYLE: Record<ClanEvent['status'], string> = {
  live: 'bg-signal-green/15 text-signal-green border-signal-green/30',
  upcoming: 'bg-signal-blue/15 text-signal-blue border-signal-blue/30',
  ended: 'bg-signal-red/15 text-signal-red border-signal-red/30',
}

/** Section label used for Rules / Points / Reward, so the event card reads as clearly separated blocks. */
function BlockLabel({ children }: { children: string }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">{children}</p>
}

/** Reward skin image - bigger, and expandable to a fullscreen lightbox for a clean close look. */
function SkinPreview({ url, alt, t }: { url?: string; alt: string; t: TranslationShape }) {
  const [ok, setOk] = useState(!!url)
  const [expanded, setExpanded] = useState(false)

  if (!url || !ok) {
    return (
      <div className="flex h-full min-h-[180px] w-full items-center justify-center rounded-xl border border-gold/30 bg-base-850/60 px-3 text-center text-xs text-slate-500">
        {t.events.rewardSkinComingSoon}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-gold/30"
        aria-label={t.events.expandAria}
      >
        <img src={url} alt={alt} onError={() => setOk(false)} className="max-h-[420px] w-full object-contain bg-base-950" />
        <span className="absolute bottom-2 right-2 rounded-md bg-base-950/80 px-2 py-1 text-[11px] font-medium text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
          {t.events.clickToExpand}
        </span>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 rounded-lg bg-base-800/80 px-3 py-1.5 text-sm font-semibold text-white hover:bg-base-700"
            aria-label={t.events.closeAria}
          >
            {t.events.closeButton}
          </button>
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}

/** Team roster name - linked to the member's profile if that name matches a registered [CYN] member. */
// Some team rosters use the name people actually call each other rather than
// their exact registered in-game name (e.g. "Calos" vs the registered
// "cal0s_") - this maps those so the link still resolves without changing
// what's displayed.
const PLAYER_LINK_ALIASES: Record<string, string> = {
  calos: 'cal0s_',
  franquito: 'frqnquitqu',
}

function PlayerTag({ name, roster }: { name: string; roster: { publicId: string; name: string; nationality?: string }[] }) {
  const lookupName = PLAYER_LINK_ALIASES[name.toLowerCase()] ?? name
  const match = roster.find((m) => m.name.toLowerCase() === lookupName.toLowerCase())
  if (!match) return <span>{name}</span>
  return (
    <Link to={`/member/${match.publicId}`} className="inline-flex items-center gap-1 text-accent-light hover:text-accent">
      {match.nationality && <Flag code={match.nationality} />}
      {name}
    </Link>
  )
}

/** Translated category label (base label + the point value, pluralised per language). */
function categoryLabel(t: TranslationShape, c: SubmissionCategory): string {
  return `${t.events.category[c]} (${t.common.pts(CATEGORY_POINTS[c])})`
}

/** The info card of a raffle event: goal, who can take part, how the points work, the prize and pictures of the skin. */
function RaffleCard({ event, t }: { event: ClanEvent; t: TranslationShape }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const [rank, setRank] = useState<number | null | undefined>(undefined)
  const [open, setOpen] = useState(true)
  // ?wheelFrom=2026-10-01 shows the wheel as if the event had started that day (to look at it before 1 November)
  // On the dev copy the wheel counts from 1 October by default, so there is real data to look at before the event starts.
  const onDev = /^(dev\.|cynosure-dev\.)/.test(window.location.hostname)
  const previewFrom = new URLSearchParams(window.location.search).get('wheelFrom')?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? (onDev ? '2026-10-01' : null)
  useEffect(() => {
    fetchTopClanLeaderboard()
      .then((top) => {
        const i = top.findIndex((c) => c.clanTag === CLAN_TAG)
        setRank(i >= 0 ? i + 1 : null)
      })
      .catch(() => setRank(null))
  }, [])

  const line = 'flex items-start gap-2 text-sm leading-relaxed text-slate-300'
  const dot = <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
  return (
    <div className="panel space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`badge border ${STATUS_STYLE[event.status]}`}>{t.events.status[event.status]}</span>
          <h3 className="mt-2 font-display text-2xl font-bold text-white">{event.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {fmtDate(event.start)} - {fmtDate(event.end)}
            {event.endTime && ` ${event.endTime} ${de ? '(deutsche Zeit)' : '(German time)'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={event.name}
          className="mt-1 shrink-0 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-slate-300 hover:bg-base-700 hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {open && (
        <>
      <div>
        <BlockLabel>{de ? 'Ziel' : 'Goal'}</BlockLabel>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-slate-300">
          <span>{de ? `Clan-Leaderboard Rang ${event.goalRank}` : `Clan leaderboard rank ${event.goalRank}`}</span>
          <span className="font-display font-bold text-gold-light">
            {de ? 'Aktuell' : 'Currently'}: {rank === undefined ? '…' : rank === null ? (de ? 'außerhalb der Top 20' : 'outside the top 20') : `#${rank}`}
          </span>
        </div>
      </div>

      <div>
        <BlockLabel>{de ? 'Preis' : 'Prize'}</BlockLabel>
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-slate-300">
          {de
            ? 'Ein exklusiver Skin, den es nur 3x auf der Welt geben wird, dazu Plutonium.'
            : 'An exclusive skin that will exist only 3 times in the world, plus Plutonium.'}
        </div>
        {event.skinImages && (
          <div className="mt-3">
            <div className="grid gap-4 sm:grid-cols-2">
              {event.skinImages.map((img) => (
                <div key={img.url} className="space-y-1.5">
                  <SkinPreview url={img.url} alt={`${event.name} ${img.label}`} t={t} />
                  <p className="text-center text-xs text-slate-500">{de ? (img.label === 'FFA mode' ? 'FFA-Modus' : 'Team-Modus') : img.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <BlockLabel>{de ? 'So nimmst du teil' : 'How to take part'}</BlockLabel>
        <ul className="space-y-2">
          <li className={line}>
            {dot}
            <span>
              {de
                ? 'Ein einziges Team-Game reicht, aber mindestens ein anderes CYN-Mitglied muss dabei gewesen sein.'
                : 'One team game is enough, but at least one other CYN member must have been in it.'}
            </span>
          </li>
          <li className={line}>
            {dot}
            <span>
              {de
                ? 'Jedes Team-Spiel mit einem anderen CYN-Mitglied gibt 1 Punkt, egal ob Sieg oder Niederlage. Dazu kommt dein persönlicher Win Score im Clan: je höher, desto mehr Punkte.'
                : 'Every team game with another CYN member gives 1 point, win or loss. On top comes your personal Win Score in the clan: the higher, the more points.'}
            </span>
          </li>
          <li className={line}>
            {dot}
            <span>
              {de
                ? 'Im nächsten Jahr werden live auf Zilkas Stream 3 Spieler mit dem Factor Wheel ausgelost, die den Skin erhalten. Wer mehr Punkte hat, hat auf dem Rad ein größeres Stück.'
                : "Next year, 3 players are drawn live on Zilka's stream with the Factor Wheel and receive the skin. The more points you have, the bigger your slice of the wheel."}
            </span>
          </li>
        </ul>
      </div>

      <div>
        <BlockLabel>{de ? 'Punkte' : 'Points'}</BlockLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {(de
            ? [
                ['Basispunkte von Anfang an', ''],
                ['Pro Discord-Server-Boost', '+3'],
                ['Pro 5 € Spende an die Website', '+3'],
                ['Für alle', ''],
                ['1 Spiel = 1 Punkt: je Team-Spiel mit einem anderen CYN-Mitglied (Sieg oder Niederlage)', '+1'],
                ['Je 10 Win Score (0-9 = 0, 10-19 = +1, 20-29 = +2 ...)', '+1'],
              ]
            : [
                ['Base points from the start', ''],
                ['Per Discord server boost', '+3'],
                ['Per 5 € donated to the website', '+3'],
                ['For everybody', ''],
                ['1 game = 1 point: per team game with another CYN member (win or loss)', '+1'],
                ['Per 10 Win Score (0-9 = 0, 10-19 = +1, 20-29 = +2 ...)', '+1'],
              ]
          ).map(([label, pts], i) =>
            pts === '' ? (
              <p key={i} className="pt-1 text-xs font-semibold uppercase tracking-widest text-slate-500 sm:col-span-2">
                {label}
              </p>
            ) : (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-base-700 bg-base-850/40 px-3 py-2 text-sm">
                <span className="text-slate-300">{label}</span>
                <span className="font-display font-bold text-accent-light">{pts}</span>
              </div>
            ),
          )}
        </div>
      </div>

      {event.windowFrom && event.windowTo && (
        <div>
          <BlockLabel>Factor Wheel</BlockLabel>
          {previewFrom && <p className="mb-2 text-xs text-amber-300">{de ? 'Vorschau: gezählt wird ab ' : 'Preview: counting from '}{previewFrom}</p>}
          <FactorWheel fromMs={previewFrom ? Date.parse(previewFrom + 'T00:00:00Z') : Date.parse(event.windowFrom)} toMs={Date.parse(event.windowTo)} />
        </div>
      )}

        </>
      )}
    </div>
  )
}

function EventCard({ event, t }: { event: ClanEvent; t: TranslationShape }) {
  const { profile } = useProfile()
  const session = useSession()
  const discordName = session ? discordDisplayName(session) : undefined
  const { data: roster } = useRoster(!!profile)

  const [teams, setTeams] = useState<EventTeam[]>([])
  const [submissions, setSubmissions] = useState<EventSubmission[]>([])
  const [admin, setAdmin] = useState(false)
  const [admins, setAdmins] = useState<string[]>([])
  const [newAdminName, setNewAdminName] = useState('')
  const [adminMsg, setAdminMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [teamId, setTeamId] = useState('')
  const [gameLink, setGameLink] = useState('')
  const [category, setCategory] = useState<SubmissionCategory>('public')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Collapsed on every page load; the arrow button expands it.
  const [open, setOpen] = useState(false)
  const toggleOpen = () => setOpen((o) => !o)

  const load = useCallback(async () => {
    const [teamsResult, submissionsResult, adminResult] = await Promise.all([
      fetchEventTeams(event.id).catch(() => []),
      fetchEventSubmissions(event.id).catch(() => []),
      isEventAdmin(discordName),
    ])
    setTeams(teamsResult)
    setSubmissions(submissionsResult)
    setAdmin(adminResult)
    if (adminResult) setAdmins(await fetchEventAdmins().catch(() => []))
    if (!teamId && teamsResult.length) setTeamId(teamsResult[0].id)
    setLoading(false)
  }, [event.id, discordName]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    const r = await addEventAdmin(newAdminName)
    setAdminMsg(r.message)
    if (r.ok) {
      setNewAdminName('')
      setAdmins(await fetchEventAdmins().catch(() => []))
    }
  }

  async function onRemoveAdmin(discordUsername: string) {
    const r = await removeEventAdmin(discordUsername)
    setAdminMsg(r.message)
    if (r.ok) setAdmins(await fetchEventAdmins().catch(() => []))
  }

  useEffect(() => {
    load()
  }, [load])

  const standings = computeStandings(teams, submissions)
  const pending = submissions.filter((s) => s.status === 'pending')
  const mySubmissions = profile ? submissions.filter((s) => s.submitted_by === profile.openfront_id) : []

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !screenshot || !teamId) return
    setBusy(true)
    setMsg(null)
    const r = await submitEventEntry({
      eventId: event.id,
      teamId,
      openfrontId: profile.openfront_id,
      gameLink,
      category,
      screenshotFile: screenshot,
    })
    setMsg(r.message)
    setBusy(false)
    if (r.ok) {
      setGameLink('')
      setScreenshot(null)
      load()
    }
  }

  async function onReview(id: string, decision: 'accepted' | 'denied') {
    if (!discordName) return
    await reviewSubmission(id, decision, discordName)
    load()
  }

  return (
    <div className="panel space-y-6 p-6">
      {/* header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`badge border ${STATUS_STYLE[event.status]}`}>{t.events.status[event.status]}</span>
            <h3 className="mt-2 font-display text-2xl font-bold text-white">{event.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {fmtDate(event.start)} - {fmtDate(event.end)}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label={event.name}
            className="mt-1 shrink-0 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-slate-300 hover:bg-base-700 hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        {event.status === 'ended' && event.winner && (
          <p className="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-center font-display text-sm font-bold text-gold-light">
            🏆 {t.events.winner}: {event.winner}
          </p>
        )}
      </div>

      {open && (
        <>
      {/* rules */}
      <div>
        <BlockLabel>{t.events.rules}</BlockLabel>
        <p className="text-sm leading-relaxed text-slate-300">{event.description}</p>
      </div>

      {/* points */}
      <div>
        <BlockLabel>{t.events.points}</BlockLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(t.events.category) as SubmissionCategory[]).map((c) => (
            <div key={c} className="flex items-center justify-between rounded-lg border border-base-700 bg-base-850/40 px-3 py-2 text-sm">
              <span className="text-slate-300">{t.events.category[c]}</span>
              <span className="font-display font-bold text-accent-light">{t.common.pts(CATEGORY_POINTS[c])}</span>
            </div>
          ))}
        </div>
      </div>

      {/* reward */}
      <div>
        <BlockLabel>{t.events.reward}</BlockLabel>
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-slate-300">{event.reward}</div>
      </div>

      <SkinPreview url={event.skinImageUrl} alt={`${event.name} ${t.events.rewardSkinAlt}`} t={t} />

      {/* standings */}
      <div>
        <BlockLabel>{t.events.standings}</BlockLabel>
        {loading ? (
          <Spinner />
        ) : teams.length === 0 ? (
          <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-6 text-center text-sm text-slate-500">
            {t.events.noTeams}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-sm">
              <tbody>
                {standings.map((row, i) => {
                  const rosterNames = (roster?.members ?? []).map((m) => ({ publicId: m.publicId, name: m.name, nationality: m.nationality }))
                  return (
                    <tr key={row.team.id} className="border-b border-base-700/50 last:border-0">
                      <td className="w-12 px-4 py-2.5 text-center">
                        <RankMedal rank={i + 1} />
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-200">{row.team.name}</p>
                        {(row.team.captain || row.team.players.length > 0) && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {row.team.captain && (
                              <>
                                <span className="text-slate-400">{t.events.captain}</span>{' '}
                                <PlayerTag name={row.team.captain} roster={rosterNames} />
                                {row.team.players.length > 0 && ' · '}
                              </>
                            )}
                            {row.team.players.map((p, j) => (
                              <span key={p}>
                                <PlayerTag name={p} roster={rosterNames} />
                                {j < row.team.players.length - 1 && ', '}
                              </span>
                            ))}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-display font-bold text-accent-light">{t.common.pts(row.points)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* submit */}
      {profile && teams.length > 0 && event.status !== 'ended' && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">{t.events.submitAWin}</p>
          <Card>
            <form className="space-y-3" onSubmit={onSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">{t.events.teamLabel}</label>
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  >
                    {teams.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">{t.events.categoryLabel}</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SubmissionCategory)}
                    className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  >
                    {(Object.keys(t.events.category) as SubmissionCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {categoryLabel(t, c)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t.events.gameLinkLabel}</label>
                <input
                  value={gameLink}
                  onChange={(e) => setGameLink(e.target.value)}
                  placeholder="https://openfront.io/#..."
                  className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t.events.screenshotLabel}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-base-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-base-600"
                />
              </div>
              <button type="submit" disabled={busy || !gameLink.trim() || !screenshot} className="btn-accent w-full disabled:opacity-60">
                {busy ? t.events.submitting : t.events.submitForReview}
              </button>
              {msg && <p className="text-sm text-slate-300">{msg}</p>}
            </form>
          </Card>

          {mySubmissions.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {mySubmissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-base-700 bg-base-850/50 px-3 py-2 text-xs">
                  <span className="text-slate-400">
                    {categoryLabel(t, s.category)}
                    <span className="ml-2 text-slate-600">{new Date(s.created_at).toLocaleString('en-GB')}</span>
                  </span>
                  <span
                    className={
                      s.status === 'accepted' ? 'font-semibold text-signal-green' : s.status === 'denied' ? 'font-semibold text-signal-red' : 'text-slate-500'
                    }
                  >
                    {t.events.submissionStatus[s.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* admin review */}
      {admin && pending.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">{t.events.pendingReview(pending.length)}</p>
          <div className="space-y-3">
            {pending.map((s) => {
              const team = teams.find((tm) => tm.id === s.team_id)
              return (
                <Card key={s.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-white">{team?.name ?? '?'}</span>
                    <span className="text-slate-400">{categoryLabel(t, s.category)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString('en-GB')}</p>
                  {safeHttpUrl(s.game_link) ? (
                    <a href={safeHttpUrl(s.game_link)!} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent-light hover:text-accent">
                      {s.game_link}
                    </a>
                  ) : (
                    <span className="block truncate text-xs text-signal-red">{s.game_link} (blocked: not an http(s) link)</span>
                  )}
                  {safeHttpUrl(s.screenshot_url) && (
                    <a href={safeHttpUrl(s.screenshot_url)!} target="_blank" rel="noreferrer">
                      <img src={safeHttpUrl(s.screenshot_url)!} alt={t.events.winScreenAlt} className="max-h-48 rounded-lg border border-base-700" />
                    </a>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => onReview(s.id, 'accepted')} className="rounded-lg bg-signal-green/15 px-3 py-1.5 text-xs font-semibold text-signal-green hover:bg-signal-green/25">
                      {t.events.accept}
                    </button>
                    <button onClick={() => onReview(s.id, 'denied')} className="rounded-lg bg-signal-red/15 px-3 py-1.5 text-xs font-semibold text-signal-red hover:bg-signal-red/25">
                      {t.events.deny}
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* admin whitelist management */}
      {admin && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">{t.events.adminsTitle}</p>
          <Card className="space-y-3">
            <form className="flex flex-wrap gap-2" onSubmit={onAddAdmin}>
              <input
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder={t.events.adminUsernamePlaceholder}
                className="min-w-0 flex-1 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              />
              <button type="submit" disabled={!newAdminName.trim()} className="btn-accent !px-4 !py-2 text-sm disabled:opacity-60">
                {t.events.addAdmin}
              </button>
            </form>
            {adminMsg && <p className="text-xs text-slate-400">{adminMsg}</p>}
            <div className="space-y-1.5">
              {admins.map((name) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-base-700 bg-base-850/50 px-3 py-2 text-sm">
                  <span className="text-slate-200">{name}</span>
                  <button
                    onClick={() => onRemoveAdmin(name)}
                    disabled={name === discordName}
                    title={name === discordName ? t.events.cantRemoveSelf : undefined}
                    className="text-xs font-semibold text-signal-red hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t.events.removeAdmin}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
        </>
      )}
    </div>
  )
}

export default function Events() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  if (!profile) return <RegistrationGate />

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow={t.events.eyebrow} title={t.events.title} />
        {EVENTS.length === 0 && <Card className="text-center text-sm text-slate-400">{t.events.noEvents}</Card>}
        {/* Every event is one window of its own; the arrow at the top right folds it. */}
        {EVENTS.map((ev) => (ev.kind === 'raffle' ? <RaffleCard key={ev.id} event={ev} t={t} /> : <EventCard key={ev.id} event={ev} t={t} />))}
      </section>
    </StatsShell>
  )
}
