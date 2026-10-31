import { useEffect, useSyncExternalStore } from 'react'

// Boosters and the card collection (the Worker side is worker/boosters.js: the draw happens there).

export type Rarity = 'common' | 'rare' | 'epic' | 'ultra' | 'legendary'
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'ultra', 'legendary']

export const RARITY_INFO: Record<Rarity, { de: string; en: string; chance: number; text: string; border: string }> = {
  common: { de: 'Gewöhnlich', en: 'Common', chance: 55, text: 'text-amber-600', border: 'border-amber-700/60' },
  rare: { de: 'Selten', en: 'Rare', chance: 26, text: 'text-sky-400', border: 'border-sky-500/60' },
  epic: { de: 'Episch', en: 'Epic', chance: 12, text: 'text-purple-400', border: 'border-purple-500/60' },
  ultra: { de: 'Ultra', en: 'Ultra', chance: 5, text: 'text-yellow-300', border: 'border-yellow-400/70' },
  legendary: { de: 'Legendär', en: 'Legendary', chance: 2, text: 'text-rose-400', border: 'border-rose-500/70' },
}

export interface BoosterState {
  /** boosters on hand besides the free daily one */
  extra: number
  freeAvailable: boolean
  /** ISO time the free one comes back, null while it is available */
  nextFreeAt: string | null
  /** opened a booster today (UTC, like the quests) */
  openedToday: boolean
  openedTotal: number
  /** the member said they paid for this many boosters and an admin has not looked at it yet */
  pendingRequest?: number | null
}
export interface PulledCard {
  card_id: string
  rarity: Rarity
}
export interface CollectedCard extends PulledCard {
  /** how often this member was pulled in this rarity */
  n: number
  last: string
}

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', ...init })
    const data = (await res.json().catch(() => null)) as T | null
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function fetchBoosterState(): Promise<BoosterState | null> {
  const r = await call<BoosterState>('/api/boosters/me')
  return r.ok ? r.data : null
}
// The state of the signed-in member, kept once for the whole page: the Booster button in the header glows by it, the collection page and the daily quest read it.
let cache: { at: number; state: BoosterState | null } | null = null
const listeners = new Set<() => void>()
const publish = (state: BoosterState | null) => {
  cache = { at: Date.now(), state }
  listeners.forEach((l) => l())
}
/** Asks the server and shares the answer. */
export async function refreshBoosterState(): Promise<BoosterState | null> {
  const state = await fetchBoosterState()
  publish(state)
  return state
}
/** The answer of the last 60 seconds, or a fresh one. */
export async function currentBoosterState(): Promise<BoosterState | null> {
  return cache && Date.now() - cache.at < 60_000 ? cache.state : refreshBoosterState()
}
/** After opening a booster: the state that came with the answer. */
export function setBoosterState(state: BoosterState) {
  publish(state)
}

/** The shared state (null until it is known or when it cannot be read). Looks again every 5 minutes and when the free booster is due. */
export function useBoosterState(): BoosterState | null {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => cache?.state ?? null,
  )
  useEffect(() => {
    if (!cache || Date.now() - cache.at > 60_000) void refreshBoosterState()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void refreshBoosterState(), 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const due = state?.nextFreeAt ? Date.parse(state.nextFreeAt) : null
  useEffect(() => {
    if (due == null) return
    const timer = window.setTimeout(() => void refreshBoosterState(), Math.max(1000, due - Date.now() + 1500))
    return () => window.clearTimeout(timer)
  }, [due])
  return state
}
/** How many boosters can be opened right now (the free one of the day counts). */
export const boostersReady = (s: BoosterState | null) => (s ? (s.freeAvailable ? 1 : 0) + s.extra : 0)

export async function fetchCollection(id?: string): Promise<{ id: string; openedTotal: number; cards: CollectedCard[] } | null> {
  const r = await call<{ id: string; openedTotal: number; cards: CollectedCard[] }>(`/api/boosters/collection${id ? `?id=${encodeURIComponent(id)}` : ''}`)
  return r.ok ? r.data : null
}
export async function openBooster(): Promise<{ ok: true; cards: PulledCard[]; source: 'free' | 'extra'; state: BoosterState } | { ok: false; error: string }> {
  const r = await call<{ cards: PulledCard[]; source: 'free' | 'extra'; state: BoosterState; error?: string }>('/api/boosters/open', { method: 'POST' })
  if (r.ok && r.data) return { ok: true, cards: r.data.cards, source: r.data.source, state: r.data.state }
  return { ok: false, error: r.data?.error ?? 'failed' }
}
export async function grantBoosters(openfrontId: string, count: number): Promise<string | null> {
  const r = await call<{ error?: string }>('/api/boosters/grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openfront_id: openfrontId, count }) })
  return r.ok ? null : (r.data?.error ?? 'failed')
}
/** The member says they paid for boosters (PayPal): an admin checks the payment and credits them. Null when it worked, otherwise what is wrong. */
export async function requestBoosters(count: number): Promise<string | null> {
  const r = await call<{ error?: string }>('/api/boosters/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count }) })
  return r.ok ? null : (r.data?.error ?? 'failed')
}
export interface BoosterRequest {
  id: number
  openfront_id: string
  name: string | null
  count: number
  created_at: string
}
/** Admins: the open "I paid" requests. */
export async function fetchBoosterRequests(): Promise<BoosterRequest[]> {
  const r = await call<{ requests: BoosterRequest[] }>('/api/boosters/requests')
  return r.ok && r.data ? r.data.requests : []
}
/** Admins: credit the boosters of a request (grant) or turn it down (reject). Null when it worked, otherwise what is wrong. */
export async function handleBoosterRequest(id: number, action: 'grant' | 'reject'): Promise<string | null> {
  const r = await call<{ error?: string }>('/api/boosters/requests/handle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
  return r.ok ? null : (r.data?.error ?? 'failed')
}
/** Comments and reactions written per member (the COM value of the cards). */
export async function fetchCardSocial(): Promise<Record<string, number>> {
  const r = await call<{ counts: Record<string, number> }>('/api/card-social')
  return r.ok && r.data ? r.data.counts : {}
}
