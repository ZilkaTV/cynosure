import { useEffect, useState } from 'react'
import type { MemberStats } from './stats'

// What the badges next to a member's name say: live on Twitch (purple) or YouTube (red) from /api/live (worker/liveStatus.js), and "inactive"
// (orange) when the member has not played a game with the clan tag for more than INACTIVE_DAYS days (from the shared roster).

export interface LiveEntry {
  channel: string
  title?: string
  /** when the stream started (ISO), null when unknown */
  since: string | null
  /** YouTube only: the running stream */
  videoId?: string
}
export interface LiveStreams {
  twitch: Record<string, LiveEntry>
  youtube: Record<string, LiveEntry>
}

export const INACTIVE_DAYS = 10
const DAY = 86_400_000
const REFRESH_MS = 90_000

/** Whole days since the last clan-tag game when that is longer than INACTIVE_DAYS ago, else null (also null when there is no known game at all). */
export function inactiveDays(lastGame: string | null | undefined, now = Date.now()): number | null {
  if (!lastGame) return null
  const at = Date.parse(lastGame)
  if (Number.isNaN(at)) return null
  const days = Math.floor((now - at) / DAY)
  return days > INACTIVE_DAYS ? days : null
}

/** "1 h 05 min" / "42 min" for a stream that started at `since`; empty when unknown. */
export function sinceText(since: string | null | undefined, now = Date.now()): string {
  if (!since) return ''
  const min = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000))
  if (Number.isNaN(min)) return ''
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

/** The last clan-tag game of every member of a roster (ms), by id. */
export function lastGames(members: MemberStats[]): Map<string, string | null> {
  return new Map(members.map((m) => [m.publicId, m.lastGame]))
}

// ── the live list: one shared read for the whole page, refreshed while somebody shows a badge and the tab is visible ──
let live: LiveStreams | null = null
let timer: ReturnType<typeof setInterval> | null = null
let inflight = false
const listeners = new Set<() => void>()

async function loadLive() {
  if (inflight || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
  inflight = true
  try {
    const res = await fetch('/api/live', { credentials: 'same-origin' })
    if (res.ok) {
      const data = (await res.json()) as Partial<LiveStreams>
      live = { twitch: data.twitch ?? {}, youtube: data.youtube ?? {} }
      listeners.forEach((l) => l())
    }
  } catch {
    /* no badges this round */
  } finally {
    inflight = false
  }
}

/** Who is live on Twitch / YouTube right now (null until the first answer). */
export function useLiveStreams(): LiveStreams | null {
  const [, tick] = useState(0)
  useEffect(() => {
    const on = () => tick((n) => n + 1)
    listeners.add(on)
    if (!live) void loadLive()
    if (!timer) timer = setInterval(() => void loadLive(), REFRESH_MS)
    return () => {
      listeners.delete(on)
      if (listeners.size === 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }, [])
  return live
}
