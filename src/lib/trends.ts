// ── Trend graphs (elo / all-time wins / XP over time) ───────────────────────
// Backed by cyn_member_snapshots (see supabase/schema.sql), one row per
// member per day, populated by the existing 5-minute cron
// (api/cron/refresh-details.js) as a side effect of its normal scan. There
// is no history before this table started being written - a member/clan
// simply has fewer points the further back you ask, down to none at all
// for a brand-new deployment.

import { supabase } from './supabase'

// A plain `.select(...)` with no `.range()`/`.limit()` silently caps out at
// Supabase's own default page size (1000 rows) - confirmed live as the
// actual cause of a real bug elsewhere (scripts/discord-role-sync.mjs
// computing stale wins once cyn_member_snapshots grew past 1000 total
// rows). fetchAllMemberTrends/fetchClanTrend below aren't scoped to one
// member, so as the roster grows their own `days`-windowed query could hit
// the same cap - both page through their query explicitly instead of
// waiting for that to happen.
const SUPABASE_PAGE_SIZE = 1000

export interface SnapshotPoint {
  date: string // YYYY-MM-DD
  elo: number | null
  elo2v2: number | null
  allWins: number
  xp: number
}

function sinceDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function fetchMemberTrend(openfrontId: string, days = 30): Promise<SnapshotPoint[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_member_snapshots')
    .select('snapshot_date, elo, elo_2v2, all_wins, xp')
    .eq('openfront_id', openfrontId)
    .gte('snapshot_date', sinceDate(days))
    .order('snapshot_date', { ascending: true })
  if (error) return []
  return (data ?? []).map((r) => ({ date: r.snapshot_date, elo: r.elo, elo2v2: r.elo_2v2, allWins: r.all_wins, xp: r.xp }))
}

/** Every registered member's trend at once, keyed by openfront_id - one (paginated) query instead of N. */
export async function fetchAllMemberTrends(days = 30): Promise<Record<string, SnapshotPoint[]>> {
  if (!supabase) return {}
  type Row = { openfront_id: string; snapshot_date: string; elo: number | null; elo_2v2: number | null; all_wins: number; xp: number }
  const rows: Row[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cyn_member_snapshots')
      .select('openfront_id, snapshot_date, elo, elo_2v2, all_wins, xp')
      .gte('snapshot_date', sinceDate(days))
      .order('snapshot_date', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) return {}
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < SUPABASE_PAGE_SIZE) break
  }
  const byMember: Record<string, SnapshotPoint[]> = {}
  for (const row of rows) {
    const arr = byMember[row.openfront_id] ?? (byMember[row.openfront_id] = [])
    arr.push({ date: row.snapshot_date, elo: row.elo, elo2v2: row.elo_2v2, allWins: row.all_wins, xp: row.xp })
  }
  return byMember
}

export interface ClanTrendPoint {
  date: string
  members: number
  totalWins: number
}

/** Clan-wide totals per day, derived from every member's own snapshot that day. */
export async function fetchClanTrend(days = 30): Promise<ClanTrendPoint[]> {
  if (!supabase) return []
  type Row = { snapshot_date: string; openfront_id: string; all_wins: number }
  const rows: Row[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cyn_member_snapshots')
      .select('snapshot_date, openfront_id, all_wins')
      .gte('snapshot_date', sinceDate(days))
      .range(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) return []
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < SUPABASE_PAGE_SIZE) break
  }

  const byMember = new Map<string, { snapshot_date: string; all_wins: number }[]>()
  for (const row of rows) {
    const arr = byMember.get(row.openfront_id) ?? []
    arr.push(row)
    byMember.set(row.openfront_id, arr)
  }
  for (const arr of byMember.values()) arr.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))

  const allDates = [...new Set(rows.map((r) => r.snapshot_date))].sort()

  // Forward-filled: a member missing a row on a given day (a coverage gap
  // in the ~5-minute cron scan - see refresh-details.mjs's own
  // SCAN_TIME_BUDGET_MS, not a real event) still counts at their last known
  // value instead of dropping out of the sum entirely, which used to make
  // the clan-wide total visibly dip on any day fewer members happened to
  // get scanned - confirmed directly against real data. `cursor` is a
  // per-member pointer into their own sorted snapshot list, advanced
  // forward as `date` increases across this single ascending pass (not
  // reset per date), so this whole function stays O(rows), not O(dates ×
  // members).
  const cursor = new Map<string, number>()
  return allDates.map((date) => {
    let totalWins = 0
    let members = 0
    for (const [id, snaps] of byMember) {
      let idx = cursor.get(id) ?? 0
      while (idx + 1 < snaps.length && snaps[idx + 1].snapshot_date <= date) idx++
      if (snaps[idx].snapshot_date <= date) {
        cursor.set(id, idx)
        totalWins += snaps[idx].all_wins
        members++
      }
    }
    return { date, members, totalWins }
  })
}

// ── Per-month elo (Monthly 1v1/2v2 pages) ───────────────────────────────────
// "Current Elo"/"Elo Gain" on those pages used to always show LIVE, TODAY's
// elo and a running "since the real current month started" delta seeded in
// localStorage - regardless of which month tab was actually selected.
// Confirmed live as a real bug (reported as "every player shows the exact
// same Elo Gain when I look at an earlier month"): those two fields never
// varied with the `month` prop at all, so switching to an archived month
// kept showing that same current/live snapshot for every row. This
// computes the real thing instead, straight from cyn_member_snapshots' now
// multi-month daily history.

export interface MonthlyEloPoint {
  elo: number | null
  eloDelta: number | null
  elo2v2: number | null
  eloDelta2v2: number | null
}

function monthBounds(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0)) // day 0 of next month = last day of this one
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/**
 * Every registered member's elo (as of the last tracked day at-or-before
 * the month's end) and elo delta (vs. the last tracked day before the
 * month started, or their first tracked day within it if there's no
 * earlier history) for one specific month - works the same way whether
 * `monthKey` is the current month or an archived one, so callers don't
 * need two code paths.
 */
export async function fetchMonthlyEloForAllMembers(monthKey: string): Promise<Record<string, MonthlyEloPoint>> {
  if (!supabase) return {}
  const { start, end } = monthBounds(monthKey)
  // 40 days of buffer before the month starts is enough to find a "last
  // snapshot before this month" baseline even across a short tracking gap,
  // without fetching the site's entire history just to compute one month.
  const bufferStart = new Date(new Date(`${start}T00:00:00Z`).getTime() - 40 * 86_400_000).toISOString().slice(0, 10)

  type Row = { openfront_id: string; snapshot_date: string; elo: number | null; elo_2v2: number | null }
  const rows: Row[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cyn_member_snapshots')
      .select('openfront_id, snapshot_date, elo, elo_2v2')
      .gte('snapshot_date', bufferStart)
      .lte('snapshot_date', end)
      .order('snapshot_date', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) return {}
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < SUPABASE_PAGE_SIZE) break
  }

  const byMember = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byMember.get(r.openfront_id) ?? []
    arr.push(r)
    byMember.set(r.openfront_id, arr)
  }

  const result: Record<string, MonthlyEloPoint> = {}
  for (const [id, snaps] of byMember) {
    // Already ascending by snapshot_date (query order) within each member's list.
    const beforeMonth = snaps.filter((s) => s.snapshot_date < start)
    const throughMonthEnd = snaps.filter((s) => s.snapshot_date <= end)
    const startPoint = beforeMonth[beforeMonth.length - 1] ?? throughMonthEnd[0] ?? null
    const endPoint = throughMonthEnd[throughMonthEnd.length - 1] ?? null

    const elo = endPoint?.elo ?? null
    const elo2v2 = endPoint?.elo_2v2 ?? null
    result[id] = {
      elo,
      elo2v2,
      eloDelta: elo != null && startPoint?.elo != null ? elo - startPoint.elo : null,
      eloDelta2v2: elo2v2 != null && startPoint?.elo_2v2 != null ? elo2v2 - startPoint.elo_2v2 : null,
    }
  }
  return result
}
