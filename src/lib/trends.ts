// ── Trend graphs (elo / all-time wins / XP over time) ───────────────────────
// Backed by cyn_member_snapshots (see supabase/schema.sql), one row per
// member per day, populated by the existing 5-minute cron
// (api/cron/refresh-details.js) as a side effect of its normal scan. There
// is no history before this table started being written - a member/clan
// simply has fewer points the further back you ask, down to none at all
// for a brand-new deployment.

import { supabase } from './supabase'

export interface SnapshotPoint {
  date: string // YYYY-MM-DD
  elo: number | null
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
    .select('snapshot_date, elo, all_wins, xp')
    .eq('openfront_id', openfrontId)
    .gte('snapshot_date', sinceDate(days))
    .order('snapshot_date', { ascending: true })
  if (error) return []
  return (data ?? []).map((r) => ({ date: r.snapshot_date, elo: r.elo, allWins: r.all_wins, xp: r.xp }))
}

/** Every registered member's trend at once, keyed by openfront_id - one query instead of N. */
export async function fetchAllMemberTrends(days = 30): Promise<Record<string, SnapshotPoint[]>> {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('cyn_member_snapshots')
    .select('openfront_id, snapshot_date, elo, all_wins, xp')
    .gte('snapshot_date', sinceDate(days))
    .order('snapshot_date', { ascending: true })
  if (error) return {}
  const byMember: Record<string, SnapshotPoint[]> = {}
  for (const row of (data ?? []) as { openfront_id: string; snapshot_date: string; elo: number | null; all_wins: number; xp: number }[]) {
    const arr = byMember[row.openfront_id] ?? (byMember[row.openfront_id] = [])
    arr.push({ date: row.snapshot_date, elo: row.elo, allWins: row.all_wins, xp: row.xp })
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
  const { data, error } = await supabase
    .from('cyn_member_snapshots')
    .select('snapshot_date, openfront_id, all_wins')
    .gte('snapshot_date', sinceDate(days))
  if (error) return []
  const byDate = new Map<string, { members: Set<string>; totalWins: number }>()
  for (const row of (data ?? []) as { snapshot_date: string; openfront_id: string; all_wins: number }[]) {
    const entry = byDate.get(row.snapshot_date) ?? { members: new Set<string>(), totalWins: 0 }
    entry.members.add(row.openfront_id)
    entry.totalWins += row.all_wins
    byDate.set(row.snapshot_date, entry)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, members: v.members.size, totalWins: v.totalWins }))
}
