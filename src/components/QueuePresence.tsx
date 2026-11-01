import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RoleName, useWinsIndex } from './RoleName'
import { Card } from './ui'
import { useLanguage } from '../i18n/LanguageContext'
import { cleanDisplayName } from '../lib/displayName'
import { PRESENCE_MINUTES, setInQueue, useQueuePresence, type PresenceLadder } from '../lib/queuePresence'
import { useProfile } from '../lib/useProfile'

const LADDERS: PresenceLadder[] = ['1v1', '2v2', 'ffa']
const LOOK: Record<PresenceLadder, string> = { '1v1': 'bg-violet-500/25 text-violet-200', '2v2': 'bg-teal-500/25 text-teal-200', ffa: 'bg-amber-500/25 text-amber-200' }

/** "I am in the queue": a member says so, and everybody sees who of the clan is queueing right now (so nobody queues into a clan mate). */
export default function QueuePresence() {
  const { language } = useLanguage()
  const de = language === 'de'
  const { profile } = useProfile()
  const { me, members, loaded, reload } = useQueuePresence(!!profile)
  const wins = useWinsIndex()
  const [busy, setBusy] = useState(false)
  if (!profile) return null
  const mine = members.find((m) => m.id === me)
  const minutes = (since: string) => Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60_000))

  async function toggle(ladder: PresenceLadder | null) {
    setBusy(true)
    await setInQueue(ladder)
    setBusy(false)
    reload()
  }

  return (
    <Card className="mx-auto max-w-3xl space-y-3 !py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-200">🎮 {de ? 'Wer von CYN ist gerade in der Queue?' : 'Who of CYN is in the queue right now?'}</span>
        <span className="text-[11px] text-slate-500">{de ? `Eine Meldung gilt ${PRESENCE_MINUTES} Minuten.` : `A report counts for ${PRESENCE_MINUTES} minutes.`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">{mine ? (de ? 'Du bist in der Queue:' : 'You are in the queue:') : de ? 'Ich bin jetzt in der Queue:' : 'I am in the queue now:'}</span>
        {LADDERS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={busy}
            onClick={() => void toggle(mine?.ladder === l ? null : l)}
            aria-pressed={mine?.ladder === l}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${mine?.ladder === l ? 'bg-emerald-500 text-white' : 'bg-base-800 text-slate-300 hover:bg-base-700'}`}
          >
            {l === 'ffa' ? 'FFA' : l}
          </button>
        ))}
        {mine && (
          <button type="button" disabled={busy} onClick={() => void toggle(null)} className="rounded-lg border border-base-600 px-3 py-1.5 text-sm text-slate-300 hover:border-accent hover:text-white disabled:opacity-50">
            {de ? 'Nicht mehr in der Queue' : 'Not in the queue any more'}
          </button>
        )}
      </div>
      {loaded && members.length === 0 && <p className="text-sm text-slate-500">{de ? 'Gerade hat sich niemand aus dem Clan eingetragen.' : 'Nobody of the clan has reported being in the queue right now.'}</p>}
      {members.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.id} className="inline-flex items-center gap-2 rounded-full border border-base-600 bg-base-900/70 px-3 py-1 text-sm text-slate-200">
              <Link to={`/member/${m.id}`} className="hover:text-accent-light">
                <RoleName wins={wins.byId.get(m.id)}>{cleanDisplayName(m.name ?? m.id)}</RoleName>
              </Link>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${LOOK[m.ladder]}`}>{m.ladder === 'ffa' ? 'FFA' : m.ladder}</span>
              <span className="text-xs text-slate-500">{de ? `seit ${minutes(m.since)} Min.` : `${minutes(m.since)} min ago`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
