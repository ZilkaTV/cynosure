import { useEffect, useState } from 'react'
import { fetchRegistered } from './profiles'
import { buildRoster, type RosterResult } from './stats'
import { fetchClanLeaderboardEntry, type ClanLeaderboardEntry } from './openfront'

export interface RosterState {
  data: RosterResult | null
  clan: ClanLeaderboardEntry | null
  loading: boolean
  error: string | null
}

/** Loads the full CYN roster + clan aggregate once, with basic status. */
export function useRoster(enabled = true): RosterState {
  const [state, setState] = useState<RosterState>({
    data: null,
    clan: null,
    loading: enabled,
    error: null,
  })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    ;(async () => {
      try {
        const registered = await fetchRegistered().catch(() => [])
        const [data, clan] = await Promise.all([
          buildRoster(registered),
          fetchClanLeaderboardEntry().catch(() => null),
        ])
        if (alive) setState({ data, clan, loading: false, error: null })
      } catch (e) {
        if (alive)
          setState({
            data: null,
            clan: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load stats',
          })
      }
    })()
    return () => {
      alive = false
    }
  }, [enabled])

  return state
}
