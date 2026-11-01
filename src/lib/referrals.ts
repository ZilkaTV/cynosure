import { useCallback, useEffect, useState } from 'react'
import { QUESTS_CHANGED } from './notifications'
import { refreshBoosterState } from './boosters'

// "Invite a friend" (the Worker side is worker/boosters.js, table cyn_referrals): a member names once, in the settings, who brought them to the site.
// The named member collects one booster for every friend (the quest at the top of the Quests page; it gives a booster, not XP).

export interface ReferralState {
  /** the member who brought me (null = not named; it can only be named once) */
  referrer: { id: string; name: string | null } | null
  /** how many friends named me in total */
  total: number
  /** how many boosters wait for me */
  pending: number
}

async function call<T>(path: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
    return { ok: res.ok, data: (await res.json().catch(() => null)) as T | null }
  } catch {
    return { ok: false, data: null }
  }
}

export async function fetchReferral(): Promise<ReferralState | null> {
  const r = await call<ReferralState>('/api/referrals/me')
  return r.ok ? r.data : null
}

/** Names the member who brought me. Null when it worked, otherwise what is wrong (not_yourself, already_set, circular, unknown_member). */
export async function setReferrer(referrerId: string): Promise<string | null> {
  const r = await call<{ error?: string }>('/api/referrals/set', { referrer_id: referrerId })
  if (r.ok) window.dispatchEvent(new Event(QUESTS_CHANGED))
  return r.ok ? null : (r.data?.error ?? 'failed')
}

/** Collects the booster for one friend. Null when it worked, otherwise what is wrong. */
export async function claimReferral(): Promise<string | null> {
  const r = await call<{ error?: string }>('/api/referrals/claim', {})
  if (r.ok) {
    await refreshBoosterState()
    window.dispatchEvent(new Event(QUESTS_CHANGED)) // the quest resets (or the next friend waits) and the menu stops glowing
  }
  return r.ok ? null : (r.data?.error ?? 'failed')
}

/** The state of the own referrals, looked at again whenever the quests change. */
export function useReferral(enabled = true): { state: ReferralState | null; reload: () => void } {
  const [state, setState] = useState<ReferralState | null>(null)
  const reload = useCallback(() => void fetchReferral().then(setState), [])
  useEffect(() => {
    if (!enabled) return
    reload()
    window.addEventListener(QUESTS_CHANGED, reload)
    return () => window.removeEventListener(QUESTS_CHANGED, reload)
  }, [enabled, reload])
  return { state, reload }
}
