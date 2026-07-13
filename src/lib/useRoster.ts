import { useCallback, useEffect, useState } from 'react'
import { fetchRegistered } from './profiles'
import { fetchSpeedruns } from './speedruns'
import { fetchBumps } from './bumps'
import { buildRoster, type RosterResult } from './stats'
import { clearOpenFrontCache, getLastUpdated } from './openfront'

export interface RosterState {
  data: RosterResult | null
  loading: boolean
  refreshing: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => void
}

/** Loads the CYN roster (registered members only) with status + manual refresh. */
export function useRoster(enabled = true): RosterState {
  const [data, setData] = useState<RosterResult | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(getLastUpdated())

  const load = useCallback(async () => {
    try {
      const [registered, speedruns, bumps] = await Promise.all([
        fetchRegistered().catch(() => []),
        fetchSpeedruns().catch(() => ({})),
        fetchBumps().catch(() => ({})),
      ])
      const result = await buildRoster(registered, speedruns, bumps)
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats')
    } finally {
      setLastUpdated(getLastUpdated())
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    load()
  }, [enabled, load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    clearOpenFrontCache()
    load()
  }, [load])

  return { data, loading, refreshing, error, lastUpdated, refresh }
}
