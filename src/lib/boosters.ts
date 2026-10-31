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
/** Comments and reactions written per member (the COM value of the cards). */
export async function fetchCardSocial(): Promise<Record<string, number>> {
  const r = await call<{ counts: Record<string, number> }>('/api/card-social')
  return r.ok && r.data ? r.data.counts : {}
}
