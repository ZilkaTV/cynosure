// Ranked activity of all OpenFront (not only the clan): games per day and per hour, from /api/ranked-activity (written hourly by
// scripts/collect-ranked-activity.mjs from OpenFront's public game list; counts only).

export interface ActivityDay {
  /** ranked 1v1 games */
  a: number
  /** ranked 2v2 games */
  b: number
  /** games started in each UTC hour */
  h: number[]
  /** games over in less than a minute (nobody showed up) */
  s: number
  /** median seconds the lobby needed to fill (null when unknown) */
  f: number | null
}
export interface ActivityDoc {
  updated_at: string
  days: Record<string, ActivityDay>
}

export interface ActivitySummary {
  /** the last 30 complete days (UTC), oldest first */
  series: { day: string; a: number; b: number }[]
  /** today so far (UTC), not part of the averages */
  today: { day: string; a: number; b: number } | null
  perDay7: number
  perDay30: number
  /** change of the last 30 days against the 30 before, in percent (null without enough data) */
  trendPct: number | null
  /** the same for each ladder */
  trend1v1: number | null
  trend2v2: number | null
  /** share of 2v2 in the last 30 days, 0..1 */
  share2v2: number
  /** average games started per UTC hour of the day (24 values) over the last 30 days */
  perHour: number[]
  /** median of the daily median lobby fill time (seconds) */
  medianFill: number | null
  /** share of games over in less than a minute, 0..1 */
  shortShare: number
  days: number
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const sum = (list: number[]) => list.reduce((t, v) => t + v, 0)
const pct = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null)

export function isActivityDoc(v: unknown): v is ActivityDoc {
  const d = v as ActivityDoc | null
  return !!d && typeof d === 'object' && !!d.days && typeof d.days === 'object'
}

/** The numbers for the page; null when there are fewer than 3 complete days. */
export function summarizeActivity(doc: ActivityDoc, now = Date.now()): ActivitySummary | null {
  const todayKey = dayKey(now)
  const valid = (d: ActivityDay | undefined): d is ActivityDay => !!d && Number.isFinite(d.a) && Number.isFinite(d.b) && Array.isArray(d.h) && d.h.length === 24
  const complete = Object.keys(doc.days)
    .filter((k) => k < todayKey && valid(doc.days[k]))
    .sort()
  if (complete.length < 3) return null
  const last30 = complete.slice(-30)
  const prev30 = complete.slice(-60, -30)
  const get = (k: string) => doc.days[k]
  const total = (keys: string[]) => sum(keys.map((k) => get(k).a + get(k).b))
  const tA = (keys: string[]) => sum(keys.map((k) => get(k).a))
  const tB = (keys: string[]) => sum(keys.map((k) => get(k).b))
  const enoughPrev = prev30.length >= 20
  const perHour = Array.from({ length: 24 }, (_, h) => sum(last30.map((k) => get(k).h[h] ?? 0)) / last30.length)
  const fills = last30.map((k) => get(k).f).filter((v): v is number => typeof v === 'number' && v > 0).sort((x, y) => x - y)
  const all30 = total(last30)
  const todayDoc = doc.days[todayKey]
  return {
    series: last30.map((k) => ({ day: k, a: get(k).a, b: get(k).b })),
    today: valid(todayDoc) ? { day: todayKey, a: todayDoc.a, b: todayDoc.b } : null,
    perDay7: total(complete.slice(-7)) / Math.min(7, complete.length),
    perDay30: all30 / last30.length,
    // compare the same number of days on both sides
    trendPct: enoughPrev ? pct(total(last30.slice(-prev30.length)) / prev30.length, total(prev30) / prev30.length) : null,
    trend1v1: enoughPrev ? pct(tA(last30.slice(-prev30.length)) / prev30.length, tA(prev30) / prev30.length) : null,
    trend2v2: enoughPrev ? pct(tB(last30.slice(-prev30.length)) / prev30.length, tB(prev30) / prev30.length) : null,
    share2v2: all30 > 0 ? tB(last30) / all30 : 0,
    perHour,
    medianFill: fills.length ? fills[fills.length >> 1] : null,
    shortShare: all30 > 0 ? sum(last30.map((k) => get(k).s ?? 0)) / all30 : 0,
    days: last30.length,
  }
}

/** The 24 UTC-hour values rotated to the hours of a time zone (offset in minutes east of UTC, rounded to whole hours). */
export function toLocalHours(perHour: number[], offsetMinutes: number): number[] {
  const shift = Math.round(offsetMinutes / 60)
  return Array.from({ length: 24 }, (_, local) => perHour[(((local - shift) % 24) + 24) % 24] ?? 0)
}

/** The hour (0..23) with the most games. */
export function peakHour(perHour: number[]): number {
  let best = 0
  perHour.forEach((v, h) => {
    if (v > perHour[best]) best = h
  })
  return best
}
