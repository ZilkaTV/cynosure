import { useEffect, useState } from 'react'

// The clan treasury (public) and the ranking of the clan's donors (OpenFront shows it to clan members only).
//
// Treasury: OpenFront's public clan card, through the Worker's /api/of proxy.
// Donors:   stored by the Worker (worker/clanDonors.js) after an admin imported them with the userscript public/cynosure-donors.user.js.

export type Currency = 'soft' | 'hard' // soft = caps, hard = plutonium
export type Period = 'all' | 'month' | 'week'

export interface Donor {
  rank: number
  playerId: string
  username: string | null
  /** A whole number as text (amounts can be large). */
  total: string
  donations: number
}
export type DonorBoards = Record<Currency, Record<Period, Donor[]>>
/** One single donation (the newest ones are stored for the quests). */
export interface RecentDonation {
  playerId: string
  currency: Currency
  amount: string
  /** ISO time */
  at: string
}
/** What the userscript hands over: the rankings and the newest single donations. */
export interface DonorExport {
  boards: DonorBoards
  recent: RecentDonation[]
}

export interface DonorDoc {
  boards: DonorBoards | null
  /** Newest single donations; missing in a ranking imported with an older userscript. */
  recent?: RecentDonation[]
  updated_at?: string
  /** OpenFront id of the admin who saved it. */
  by?: string | null
}

export interface ClanTreasury {
  caps: number
  plutonium: number
  members: number
}

const CURRENCIES: Currency[] = ['soft', 'hard']
const PERIODS: Period[] = ['all', 'month', 'week']

let treasury: { at: number; value: ClanTreasury } | null = null

/** Caps and plutonium in the clan's treasury right now; cached for five minutes. */
export async function fetchClanTreasury(): Promise<ClanTreasury | null> {
  if (treasury && Date.now() - treasury.at < 5 * 60_000) return treasury.value
  try {
    const res = await fetch('/api/of/clans/CYN')
    if (!res.ok) return null
    const j = (await res.json()) as { softBalance?: string; hardBalance?: string; memberCount?: number }
    const caps = Number(j.softBalance)
    const plutonium = Number(j.hardBalance)
    if (!Number.isFinite(caps) || !Number.isFinite(plutonium)) return null
    const value = { caps, plutonium, members: Number(j.memberCount) || 0 }
    treasury = { at: Date.now(), value }
    return value
  } catch {
    return null
  }
}

export interface DonorKeyStatus {
  hasKey: boolean
  created_at: string | null
  last_used: string | null
}

/** Whether this member has a sync key and when the userscript last used it (admins and the inner circle; null for everybody else). */
export async function fetchDonorKeyStatus(): Promise<DonorKeyStatus | null> {
  try {
    const res = await fetch('/api/clan-donors/key', { credentials: 'same-origin' })
    return res.ok ? ((await res.json()) as DonorKeyStatus) : null
  } catch {
    return null
  }
}

/** Makes a new sync key (the old one stops working); shown once, only its hash is kept on the server. */
export async function createDonorKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/clan-donors/key', { method: 'POST', credentials: 'same-origin' })
    return res.ok ? ((await res.json()) as { key: string }).key : null
  } catch {
    return null
  }
}

export async function revokeDonorKey(): Promise<boolean> {
  try {
    return (await fetch('/api/clan-donors/key', { method: 'DELETE', credentials: 'same-origin' })).ok
  } catch {
    return false
  }
}

/** The stored ranking; null when the request failed (not signed in, not a member, offline). */
export async function fetchClanDonors(): Promise<DonorDoc | null> {
  try {
    const res = await fetch('/api/clan-donors', { credentials: 'same-origin' })
    if (!res.ok) return null
    return (await res.json()) as DonorDoc
  } catch {
    return null
  }
}

export async function saveClanDonors(data: DonorExport): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/clan-donors', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boards: data.boards, recent: data.recent }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
    if (res.ok && body.ok) return { ok: true, message: 'Saved.' }
    if (res.status === 403) return { ok: false, message: 'Only admins can save the ranking.' }
    return { ok: false, message: body.message ?? body.error ?? 'Saving failed.' }
  } catch {
    return { ok: false, message: 'Saving failed (no connection).' }
  }
}

/**
 * What the userscript hands over (or an admin pastes): { boards: { soft: { all, month, week }, hard: { ... } } } with rows
 * { playerId, username, total, donations } and (optional) recent: [{ playerId, currency, amount, at }]. Returns both in the stored shape, or null when it does not look right.
 * The Worker checks everything again; this is for the preview and for a friendly message.
 */
export function parseDonorExport(input: unknown): DonorExport | null {
  let data = input
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  const boards = (data as { boards?: Record<string, Record<string, unknown>> } | null)?.boards
  const rawRecent = (data as { recent?: unknown } | null)?.recent
  if (!boards || typeof boards !== 'object') return null
  const out = { soft: {}, hard: {} } as unknown as DonorBoards
  for (const c of CURRENCIES) {
    for (const p of PERIODS) {
      const list = boards[c]?.[p]
      if (!Array.isArray(list)) return null
      const rows: Donor[] = []
      for (const r of list as Record<string, unknown>[]) {
        if (!r || typeof r.playerId !== 'string' || !/^\d{1,18}$/.test(String(r.total))) return null
        rows.push({ rank: rows.length + 1, playerId: r.playerId, username: typeof r.username === 'string' ? r.username : null, total: String(r.total), donations: Number(r.donations) || 0 })
      }
      out[c][p] = rows
    }
  }
  const recent: RecentDonation[] = []
  if (rawRecent != null) {
    if (!Array.isArray(rawRecent)) return null
    for (const r of rawRecent as Record<string, unknown>[]) {
      const at = typeof r?.at === 'string' ? Date.parse(r.at) : NaN
      const currency = r?.currency === 'soft' || r?.currency === 'hard' ? r.currency : null
      if (!r || typeof r.playerId !== 'string' || !currency || !/^\d{1,18}$/.test(String(r.amount)) || !Number.isFinite(at)) return null
      recent.push({ playerId: r.playerId, currency, amount: String(r.amount), at: new Date(at).toISOString() })
    }
  }
  return { boards: out, recent }
}

/** Caps donated all time per member, from the ranking (and the single donations when they add up to more). */
export function capsDonatedMap(doc: DonorDoc | null | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of doc?.boards?.soft.all ?? []) out.set(r.playerId, Number(r.total))
  const sums = new Map<string, number>()
  for (const r of doc?.recent ?? []) if (r.currency === 'soft') sums.set(r.playerId, (sums.get(r.playerId) ?? 0) + Number(r.amount))
  for (const [id, n] of sums) if (n > (out.get(id) ?? 0)) out.set(id, n)
  return out
}

/** What one member donated, for the quests and the badge. Today / this week / this month count from midnight UTC (Monday for the week). */
export interface DonationTotals {
  capsAll: number
  capsDay: number
  capsWeek: number
  plutoniumMonth: number
  /** False while the stored ranking has no list of single donations (the quests cannot be checked then). */
  hasRecent: boolean
}

const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
/** Monday 00:00 UTC of the week of `d`. */
export const startOfWeek = (d: Date) => startOfDay(d) - ((d.getUTCDay() + 6) % 7) * 86_400_000
const startOfMonth = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)

export function donationTotals(doc: DonorDoc | null | undefined, playerId: string, now = new Date()): DonationTotals {
  const caps = Number(doc?.boards?.soft.all.find((r) => r.playerId === playerId)?.total ?? 0)
  const mine = (doc?.recent ?? []).filter((r) => r.playerId === playerId)
  const sum = (currency: Currency, from: number) => mine.filter((r) => r.currency === currency && Date.parse(r.at) >= from).reduce((s, r) => s + Number(r.amount), 0)
  return {
    capsAll: Math.max(caps, sum('soft', 0)),
    capsDay: sum('soft', startOfDay(now)),
    capsWeek: sum('soft', startOfWeek(now)),
    plutoniumMonth: sum('hard', startOfMonth(now)),
    hasRecent: doc?.recent !== undefined,
  }
}

// ── shared by the sidebar window and the Clan page block ──
let donorCache: { at: number; doc: DonorDoc | null } | null = null
const donorListeners = new Set<() => void>()

/** Reads the stored ranking again (after an admin saved a new one) and tells every component that shows it. */
export async function reloadClanDonors(): Promise<void> {
  const doc = await fetchClanDonors()
  // a failed read (not signed in yet, offline) is tried again after 10 seconds, a good one is kept for 2 minutes
  donorCache = { at: doc ? Date.now() : Date.now() - 110_000, doc }
  donorListeners.forEach((l) => l())
}

/** The stored ranking, one read for the whole page: undefined while loading, null when the visitor may not see it. */
export function useClanDonors(): DonorDoc | null | undefined {
  const [, tick] = useState(0)
  useEffect(() => {
    const on = () => tick((n) => n + 1)
    donorListeners.add(on)
    if (!donorCache || Date.now() - donorCache.at > 2 * 60_000) void reloadClanDonors()
    return () => {
      donorListeners.delete(on)
    }
  }, [])
  return donorCache ? donorCache.doc : undefined
}
