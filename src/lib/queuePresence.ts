import { useCallback, useEffect, useState } from 'react'
import { isCalm } from './calm'

// Who of the clan says they are in the ranked queue right now (the Worker side is worker/queuePresence.js): shown on the Live Ranked Queue page so
// the members do not queue into each other. A report counts for 20 minutes.

export type PresenceLadder = '1v1' | '2v2' | 'ffa'
export interface PresenceMember {
  id: string
  name: string | null
  ladder: PresenceLadder
  since: string
}
export const PRESENCE_MINUTES = 20

async function call<T>(init?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch('/api/queue-presence', { credentials: 'same-origin', ...init })
    return { ok: res.ok, data: (await res.json().catch(() => null)) as T | null }
  } catch {
    return { ok: false, data: null }
  }
}

/** Says (or takes back with null) that the signed-in member is in the queue. Null when it worked. */
export async function setInQueue(ladder: PresenceLadder | null): Promise<string | null> {
  const r = await call<{ error?: string }>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ladder }) })
  return r.ok ? null : (r.data?.error ?? 'failed')
}

/** The members in the queue (looked at again every 30 seconds while the page is in front) and the own id. */
export function useQueuePresence(enabled = true): { me: string | null; members: PresenceMember[]; loaded: boolean; reload: () => void } {
  const [state, setState] = useState<{ me: string | null; members: PresenceMember[]; loaded: boolean }>({ me: null, members: [], loaded: false })
  const reload = useCallback(() => {
    void call<{ me: string; members: PresenceMember[] }>().then((r) => {
      if (r.ok && r.data) setState({ me: r.data.me, members: r.data.members, loaded: true })
      else setState((s) => ({ ...s, loaded: true }))
    })
  }, [])
  useEffect(() => {
    if (!enabled) return
    reload()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && !isCalm() && reload(), 30_000)
    const wake = () => document.visibilityState === 'visible' && reload()
    window.addEventListener('focus', wake)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', wake)
    }
  }, [enabled, reload])
  return { ...state, reload }
}
