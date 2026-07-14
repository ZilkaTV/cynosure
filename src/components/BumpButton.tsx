import { useState } from 'react'
import { BUMP_POST_URL } from '../config'
import { BUMP_COOLDOWN_MS, recordBump } from '../lib/bumps'
import { Emoji, EMOJI } from './Emoji'
import { useCountdown } from './ui'

/** Bump card: shows the member's count, a self-report button (2h cooldown), and the Discord post link. */
export function BumpCard({
  openfrontId,
  bumpCount,
  lastBumpAt,
  onDone,
}: {
  openfrontId: string
  bumpCount: number
  lastBumpAt: string | null
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const cooldownEndsAt = lastBumpAt != null ? new Date(lastBumpAt).getTime() + BUMP_COOLDOWN_MS : null
  const countdown = useCountdown(cooldownEndsAt)
  const onCooldown = countdown != null

  return (
    <div className="panel flex flex-col items-center gap-2 px-5 py-4 text-center">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Emoji char={EMOJI.bell} className="h-3.5 w-3.5" /> Discord Bumps
      </p>
      <p className="font-display text-2xl font-bold text-gold-light">{bumpCount}</p>
      <a href={BUMP_POST_URL} target="_blank" rel="noreferrer" className="text-xs text-accent-light hover:text-accent">
        Open the bump post ↗
      </a>
      <button
        disabled={busy || onCooldown}
        onClick={async () => {
          setBusy(true)
          const r = await recordBump(openfrontId)
          setMsg(r.message)
          setBusy(false)
          if (r.ok) onDone()
        }}
        className="btn-ghost mt-1 inline-flex items-center gap-2 !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Emoji char={EMOJI.bell} className="h-4 w-4" /> I just bumped
      </button>
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
      <p className="text-[11px] text-slate-600">
        {onCooldown ? `Ready again in ${countdown}` : 'Ready to bump'} - resets every 2 hours, matching Disboard's cooldown.
      </p>
    </div>
  )
}
