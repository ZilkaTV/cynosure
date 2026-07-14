import { useEffect, useState, useCallback } from 'react'
import { useProfile } from '../lib/useProfile'
import { useSession, discordDisplayName } from '../lib/useSession'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card, Spinner } from '../components/ui'
import { RankMedal } from '../components/Emoji'
import { EVENTS, type ClanEvent } from '../data/events'
import {
  fetchEventTeams,
  fetchEventSubmissions,
  computeStandings,
  isEventAdmin,
  submitEventEntry,
  reviewSubmission,
  CATEGORY_LABELS,
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
function SkinPreview({ url, alt }: { url?: string; alt: string }) {
  const [ok, setOk] = useState(!!url)
  const [expanded, setExpanded] = useState(false)

  if (!url || !ok) {
    return (
      <div className="flex h-full min-h-[180px] w-full items-center justify-center rounded-xl border border-gold/30 bg-base-850/60 px-3 text-center text-xs text-slate-500">
        Reward skin preview coming soon
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-gold/30"
        aria-label="Expand reward skin preview"
      >
        <img src={url} alt={alt} onError={() => setOk(false)} className="max-h-[420px] w-full object-contain bg-base-950" />
        <span className="absolute bottom-2 right-2 rounded-md bg-base-950/80 px-2 py-1 text-[11px] font-medium text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
          Click to expand ⤢
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
            aria-label="Close"
          >
            ✕ Close
          </button>
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}

function EventCard({ event }: { event: ClanEvent }) {
  const { profile } = useProfile()
  const session = useSession()
  const discordName = session ? discordDisplayName(session) : undefined

  const [teams, setTeams] = useState<EventTeam[]>([])
  const [submissions, setSubmissions] = useState<EventSubmission[]>([])
  const [admin, setAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [teamId, setTeamId] = useState('')
  const [gameLink, setGameLink] = useState('')
  const [category, setCategory] = useState<SubmissionCategory>('public')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [t, s, a] = await Promise.all([
      fetchEventTeams(event.id).catch(() => []),
      fetchEventSubmissions(event.id).catch(() => []),
      isEventAdmin(discordName),
    ])
    setTeams(t)
    setSubmissions(s)
    setAdmin(a)
    if (!teamId && t.length) setTeamId(t[0].id)
    setLoading(false)
  }, [event.id, discordName]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <span className={`badge border ${STATUS_STYLE[event.status]}`}>{event.status}</span>
        <h3 className="mt-2 font-display text-2xl font-bold text-white">{event.name}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {fmtDate(event.start)} - {fmtDate(event.end)}
        </p>
      </div>

      {/* rules */}
      <div>
        <BlockLabel>Regeln</BlockLabel>
        <p className="text-sm leading-relaxed text-slate-300">{event.description}</p>
      </div>

      {/* points */}
      <div>
        <BlockLabel>Punkte</BlockLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(CATEGORY_LABELS) as SubmissionCategory[]).map((c) => (
            <div key={c} className="flex items-center justify-between rounded-lg border border-base-700 bg-base-850/40 px-3 py-2 text-sm">
              <span className="text-slate-300">{CATEGORY_LABELS[c].replace(/\s*\(\d+ pts?\)$/, '')}</span>
              <span className="font-display font-bold text-accent-light">{CATEGORY_POINTS[c]} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* reward */}
      <div>
        <BlockLabel>Reward</BlockLabel>
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-slate-300">{event.reward}</div>
      </div>

      <SkinPreview url={event.skinImageUrl} alt={`${event.name} reward skin`} />

      {/* standings */}
      <div>
        <BlockLabel>Standings</BlockLabel>
        {loading ? (
          <Spinner />
        ) : teams.length === 0 ? (
          <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-6 text-center text-sm text-slate-500">
            No teams set up yet for this event.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-sm">
              <tbody>
                {standings.map((row, i) => (
                  <tr key={row.team.id} className="border-b border-base-700/50 last:border-0">
                    <td className="w-12 px-4 py-2.5 text-center">
                      <RankMedal rank={i + 1} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-200">{row.team.name}</td>
                    <td className="px-4 py-2.5 text-right font-display font-bold text-accent-light">{row.points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* submit */}
      {profile && teams.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">Submit a win</p>
          <Card>
            <form className="space-y-3" onSubmit={onSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Team</label>
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SubmissionCategory)}
                    className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  >
                    {(Object.keys(CATEGORY_LABELS) as SubmissionCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Game link</label>
                <input
                  value={gameLink}
                  onChange={(e) => setGameLink(e.target.value)}
                  placeholder="https://openfront.io/#..."
                  className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Win-screen screenshot</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-base-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-base-600"
                />
              </div>
              <button type="submit" disabled={busy || !gameLink.trim() || !screenshot} className="btn-accent w-full disabled:opacity-60">
                {busy ? 'Submitting...' : 'Submit for review'}
              </button>
              {msg && <p className="text-sm text-slate-300">{msg}</p>}
            </form>
          </Card>

          {mySubmissions.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {mySubmissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-base-700 bg-base-850/50 px-3 py-2 text-xs">
                  <span className="text-slate-400">{CATEGORY_LABELS[s.category]}</span>
                  <span
                    className={
                      s.status === 'accepted' ? 'font-semibold text-signal-green' : s.status === 'denied' ? 'font-semibold text-signal-red' : 'text-slate-500'
                    }
                  >
                    {s.status}
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">Pending review ({pending.length})</p>
          <div className="space-y-3">
            {pending.map((s) => {
              const team = teams.find((t) => t.id === s.team_id)
              return (
                <Card key={s.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-white">{team?.name ?? '?'}</span>
                    <span className="text-slate-400">{CATEGORY_LABELS[s.category]}</span>
                  </div>
                  <a href={s.game_link} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent-light hover:text-accent">
                    {s.game_link}
                  </a>
                  <a href={s.screenshot_url} target="_blank" rel="noreferrer">
                    <img src={s.screenshot_url} alt="Win screen" className="max-h-48 rounded-lg border border-base-700" />
                  </a>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => onReview(s.id, 'accepted')} className="rounded-lg bg-signal-green/15 px-3 py-1.5 text-xs font-semibold text-signal-green hover:bg-signal-green/25">
                      Accept
                    </button>
                    <button onClick={() => onReview(s.id, 'denied')} className="rounded-lg bg-signal-red/15 px-3 py-1.5 text-xs font-semibold text-signal-red hover:bg-signal-red/25">
                      Deny
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Events() {
  const { profile } = useProfile()
  if (!profile) return <RegistrationGate />

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow="Compete" title="Events" />
        {EVENTS.length === 0 && <Card className="text-center text-sm text-slate-400">No events right now - check back soon.</Card>}
        {EVENTS.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </section>
    </StatsShell>
  )
}
