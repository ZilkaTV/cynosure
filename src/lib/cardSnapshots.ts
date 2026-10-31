import type { CardSnapshot, CardStat } from './playerCard'

// The monthly update of a card (the Worker side is worker/boosters.js): the values of the card stay as they were until the member updates it,
// once a month; then the green + and red - numbers show what changed.

/** The month in Berlin (YYYY-MM), like the server counts it. */
export function berlinMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now).slice(0, 7)
}
/** The first day of the next month, for the text under the update button. */
export function nextUpdateDate(now = new Date()): Date {
  const [y, m] = berlinMonth(now).split('-').map(Number)
  return new Date(Date.UTC(y, m, 1, 12))
}

export async function fetchSnapshots(): Promise<Record<string, CardSnapshot>> {
  try {
    const res = await fetch('/api/cards/snapshots', { credentials: 'same-origin' })
    if (!res.ok) return {}
    const j = (await res.json()) as { snapshots: Record<string, { month: string; stats: Record<CardStat, number>; prev: Record<CardStat, number> | null; at: string }> }
    return j.snapshots ?? {}
  } catch {
    return {}
  }
}

/** Updates the own card with the values right now. Null when it worked, otherwise what is wrong. */
export async function updateCardSnapshot(stats: Record<CardStat, number>): Promise<string | null> {
  try {
    const res = await fetch('/api/cards/update', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stats }) })
    if (res.ok) return null
    return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'failed'
  } catch {
    return 'failed'
  }
}
