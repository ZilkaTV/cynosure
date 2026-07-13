import { useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card } from '../components/ui'
import { EVENTS, type ClanEvent } from '../data/events'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_STYLE: Record<ClanEvent['status'], string> = {
  live: 'bg-signal-green/15 text-signal-green border-signal-green/30',
  upcoming: 'bg-signal-blue/15 text-signal-blue border-signal-blue/30',
  ended: 'bg-base-700 text-slate-400 border-base-600',
}

/** Reward skin preview - shows /events/<id>.png if present, else a simple fallback. */
function SkinPreview({ eventId, alt }: { eventId: string; alt: string }) {
  const [ok, setOk] = useState(true)
  if (!ok) {
    return (
      <div className="flex h-full min-h-[140px] w-full items-center justify-center rounded-xl border border-gold/30 bg-base-850/60 text-center text-xs text-slate-500">
        Reward skin preview
        <br />
        (add /events/{eventId}.png)
      </div>
    )
  }
  return (
    <img
      src={`/events/${eventId}.png`}
      alt={alt}
      onError={() => setOk(false)}
      className="h-full w-full rounded-xl border border-gold/30 object-cover"
    />
  )
}

function EventCard({ event }: { event: ClanEvent }) {
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`)
  return (
    <div className="panel space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`badge border ${STATUS_STYLE[event.status]}`}>{event.status}</span>
          <h3 className="mt-2 font-display text-2xl font-bold text-white">{event.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {fmtDate(event.start)} - {fmtDate(event.end)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">{event.description}</p>

          <div className="rounded-xl border border-base-600 bg-base-850/60 px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">Scoring</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">
              {event.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-slate-300">
            Post your game link + a screenshot of the win screen in{' '}
            <span className="font-semibold text-accent-light">{event.submitChannel}</span>. A staff member
            confirms it and awards the points to your team.
          </div>

          <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-slate-300">
            <span className="font-semibold text-gold-light">Reward: </span>
            {event.reward}
          </div>
        </div>

        <SkinPreview eventId={event.id} alt={`${event.name} reward skin`} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">Leaderboard</p>
          <p className="text-xs text-slate-500">Last update: {event.leaderboardUpdated}</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-base-700">
          <table className="w-full text-sm">
            <tbody>
              {event.leaderboard.map((row, i) => (
                <tr key={i} className="border-b border-base-700/50 last:border-0">
                  <td className="w-12 px-4 py-2.5 text-center font-display font-bold text-slate-400">{medal(i)}</td>
                  <td className="px-4 py-2.5 text-slate-200">{row.team}</td>
                  <td className="px-4 py-2.5 text-right font-display font-bold text-accent-light">{row.points} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Events() {
  const { profile } = useProfile()
  if (!profile) return <RegistrationGate />

  const live = EVENTS.filter((e) => e.status === 'live')
  const others = EVENTS.filter((e) => e.status !== 'live')

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow="Compete" title="Events" />
        {live.length === 0 && others.length === 0 && (
          <Card className="text-center text-sm text-slate-400">No events right now - check back soon.</Card>
        )}
        {live.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
        {others.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </section>
    </StatsShell>
  )
}
