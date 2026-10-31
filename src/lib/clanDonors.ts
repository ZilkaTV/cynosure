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
export interface DonorDoc {
  boards: DonorBoards | null
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

export async function saveClanDonors(boards: DonorBoards): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/clan-donors', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boards }),
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
 * { playerId, username, total, donations }. Returns the boards in the stored shape, or null when it does not look right.
 * The Worker checks everything again; this is for the preview and for a friendly message.
 */
export function parseDonorExport(input: unknown): DonorBoards | null {
  let data = input
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  const boards = (data as { boards?: Record<string, Record<string, unknown>> } | null)?.boards
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
  return out
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
