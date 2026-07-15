import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { useSession, discordDisplayName } from '../lib/useSession'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card, Spinner } from '../components/ui'
import { Flag, RankMedal } from '../components/Emoji'
import { EVENTS, type ClanEvent } from '../data/events'
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
  ended: 'bg-base-700 text-slate-400 border-base-600',
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
        <span className={`badge border ${STATUS_STYLE[event.status]}`}>{t.events.status[event.status]}</span>
        <h3 className="mt-2 font-display text-2xl font-bold text-white">{event.name}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {fmtDate(event.start)} - {fmtDate(event.end)}
        </p>
      </div>

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
      {profile && teams.length > 0 && (
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
                  <span className="text-slate-400">{categoryLabel(t, s.category)}</span>
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
                  <a href={s.game_link} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent-light hover:text-accent">
                    {s.game_link}
                  </a>
                  <a href={s.screenshot_url} target="_blank" rel="noreferrer">
                    <img src={s.screenshot_url} alt={t.events.winScreenAlt} className="max-h-48 rounded-lg border border-base-700" />
                  </a>
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
        {EVENTS.map((e) => (
          <EventCard key={e.id} event={e} t={t} />
        ))}
      </section>
    </StatsShell>
  )
}
