import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRegistered } from './profiles'
import { fetchSpeedruns } from './speedruns'
import { fetchBumps } from './bumps'
import { fetchXp } from './quests'
import { buildRoster, type RosterResult, type MemberStats } from './stats'
import { clearOpenFrontCache, getLastUpdated } from './openfront'

// Numeric fields worth showing a "+N" delta for after a manual refresh.
const DELTA_FIELDS = ['ffaWins', 'teamWins', 'rankedWins', 'allWins', 'elo', 'bumpCount'] as const
export type DeltaField = (typeof DELTA_FIELDS)[number]
export type Deltas = Record<string, Partial<Record<DeltaField, number>>>

function computeDeltas(before: RosterResult | null, after: RosterResult): Deltas {
  if (!before) return {}
  const beforeById = new Map(before.members.map((m) => [m.publicId, m]))
  const deltas: Deltas = {}
  for (const m of after.members) {
    const prev = beforeById.get(m.publicId)
    if (!prev) continue
    const changed: Partial<Record<DeltaField, number>> = {}
    for (const f of DELTA_FIELDS) {
      const a = prev[f as keyof MemberStats] as number | null
      const b = m[f as keyof MemberStats] as number | null
      if (typeof a === 'number' && typeof b === 'number' && b !== a) changed[f] = b - a
    }
    if (Object.keys(changed).length) deltas[m.publicId] = changed
  }
  return deltas
}

export interface RosterState {
  data: RosterResult | null
  loading: boolean
  refreshing: boolean
  error: string | null
  lastUpdated: number | null
  /** Per-member stat changes since the last manual refresh (empty right after page load). */
  deltas: Deltas
  refresh: () => void
}

/** Loads the CYN roster (registered members only) with status + manual refresh. */
export function useRoster(enabled = true): RosterState {
  const [data, setData] = useState<RosterResult | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(getLastUpdated())
  const [deltas, setDeltas] = useState<Deltas>({})
  const dataRef = useRef<RosterResult | null>(null)
  const isRefreshRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const [registered, speedruns, bumps, xpMap] = await Promise.all([
        fetchRegistered().catch(() => []),
        fetchSpeedruns().catch(() => ({})),
        fetchBumps().catch(() => ({})),
        fetchXp().catch(() => ({})),
      ])
      const result = await buildRoster(registered, speedruns, bumps, xpMap)
      setDeltas(isRefreshRef.current ? computeDeltas(dataRef.current, result) : {})
      dataRef.current = result
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats')
    } finally {
      setLastUpdated(getLastUpdated())
      setLoading(false)
      setRefreshing(false)
      isRefreshRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    load()
  }, [enabled, load])

  const refresh = useCallback(() => {
    isRefreshRef.current = true
    setRefreshing(true)
    clearOpenFrontCache()
    load()
  }, [load])

  return { data, loading, refreshing, error, lastUpdated, deltas, refresh }
}
