import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRegistered } from './profiles'
import { fetchSpeedruns } from './speedruns'
import { fetchBumps } from './bumps'
import { fetchXp } from './quests'
import { fetchAllChatMessageCounts, fetchAllSupporters } from './chat'
import { buildRoster, type RosterResult, type MemberStats } from './stats'
import { clearOpenFrontCache, getLastUpdated } from './openfront'
import { loadPersistedRoster, savePersistedRoster } from './rosterCache'
import { supabase } from './supabase'

// Numeric fields worth showing a "+N" delta for after a manual refresh.
const DELTA_FIELDS = ['ffaWins', 'teamWins', 'rankedWins', 'twoVTwoWins', 'allWins', 'elo', 'elo2v2', 'bumpCount'] as const
export type DeltaField = (typeof DELTA_FIELDS)[number]
export type Deltas = Record<string, Partial<Record<DeltaField, number>>>

// Dedupes concurrent calls into the roster-build pipeline: ClanChatWidget is
// now mounted globally (see Layout.tsx) alongside whatever page-specific
// component also calls useRoster, so every page view used to kick off the
// ENTIRE fetch+compute pipeline (OpenFront APIs, Supabase caches, etc.)
// twice in parallel - once per hook instance - for no benefit, since both
// calls want the exact same data at the exact same moment. Only the actual
// fetch is shared here; each hook instance still keeps its own React state
// (loading/data/deltas), so nothing about the public behavior changes.
let inFlightRosterLoad: Promise<RosterResult> | null = null

async function loadRosterDeduped(): Promise<RosterResult> {
  if (!inFlightRosterLoad) {
    inFlightRosterLoad = (async () => {
      const [registered, speedruns, bumps, xpMap, chatCounts, supporters] = await Promise.all([
        fetchRegistered().catch(() => []),
        fetchSpeedruns().catch(() => ({})),
        fetchBumps().catch(() => ({})),
        fetchXp().catch(() => ({})),
        fetchAllChatMessageCounts().catch(() => ({})),
        fetchAllSupporters().catch(() => []),
      ])
      return buildRoster(registered, speedruns, bumps, xpMap, chatCounts, supporters)
    })().finally(() => {
      inFlightRosterLoad = null
    })
  }
  return inFlightRosterLoad
}

// Win-count fields are cumulative history read back from a *bounded* window
// of each player's most recent OpenFront games (fetchPlayerGames caps how
// many pages it fetches) - so for a very active player, an old CYN-tagged
// win can roll out of that window between two fetches and make the count
// look like it dropped, even though no win was actually lost. That's a
// pagination-window artifact, not a real event, so these fields only ever
// surface a positive delta (a real new win) and silently drop a decrease.
// Elo isn't a monotonic counter - it genuinely goes up and down with real
// results - so it keeps showing deltas in both directions.
const MONOTONIC_FIELDS = new Set<DeltaField>(['ffaWins', 'teamWins', 'rankedWins', 'twoVTwoWins', 'allWins', 'bumpCount'])

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
      if (typeof a !== 'number' || typeof b !== 'number' || b === a) continue
      if (MONOTONIC_FIELDS.has(f) && b < a) continue
      changed[f] = b - a
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
      const result = await loadRosterDeduped()
      setDeltas(isRefreshRef.current ? computeDeltas(dataRef.current, result) : {})
      dataRef.current = result
      setData(result)
      setError(null)
      savePersistedRoster(result).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats')
    } finally {
      setLastUpdated(getLastUpdated())
      setLoading(false)
      setRefreshing(false)
      isRefreshRef.current = false
    }
  }, [])

  // Silent background reload after rendering from the persisted snapshot
  // (see below) - deliberately does NOT clear the short-TTL local caches
  // first (unlike the manual Refresh button's `refresh()`), so a repeat
  // visit within their TTL window resolves from those instantly instead of
  // repeating the full Supabase round-trip (per-member game history alone
  // can be a multi-MB payload for an active roster) on every single page
  // view - confirmed directly to be the cause of load times regressing to
  // minutes once this effect started auto-triggering a full forced refresh
  // on every visit.
  const backgroundReload = useCallback(() => {
    isRefreshRef.current = true
    setRefreshing(true)
    load()
  }, [load])

  const refresh = useCallback(() => {
    isRefreshRef.current = true
    setRefreshing(true)
    clearOpenFrontCache()
    load()
  }, [load])

  // Renders instantly from whatever was last successfully built (see
  // rosterCache.ts) instead of blocking behind a spinner on every visit -
  // then quietly reloads in the background. Only a genuinely first-ever
  // visit (nothing persisted yet) falls back to the blocking spinner, and
  // even that no longer touches OpenFront/trackerfront live (see
  // openfront.ts).
  useEffect(() => {
    if (!enabled) return
    let alive = true
    ;(async () => {
      const cached = await loadPersistedRoster()
      if (!alive) return
      if (cached) {
        dataRef.current = cached
        setData(cached)
        setLastUpdated(getLastUpdated())
        setLoading(false)
        backgroundReload()
      } else {
        setLoading(true)
        load()
      }
    })()
    return () => {
      alive = false
    }
  }, [enabled, load, backgroundReload])

  // Live updates without a manual reload: cyn_roster_cache is a single row
  // (id=1) rewritten in full on every scan/ledger cron tick - a real
  // Postgres UPDATE on it is a reliable, low-volume ("once per tick, not
  // once per changed field") signal that fresh data is worth fetching. Uses
  // the same gentle backgroundReload() the initial-mount silent reload
  // already uses (resolves from short-TTL local caches when still valid)
  // rather than refresh()'s more aggressive clear-everything path - an open
  // tab picking up new data on its own should be no heavier than a normal
  // background reload, not a forced full refetch every single tick.
  //
  // Requires cyn_roster_cache to be added to Supabase's `supabase_realtime`
  // publication (one-time SQL, not a schema change this file can make
  // itself) - silently does nothing if that hasn't been done yet or if
  // Realtime is otherwise unreachable, same as this hook's other
  // best-effort network paths.
  useEffect(() => {
    if (!enabled || !supabase) return
    const channel = supabase
      .channel('cyn_roster_cache-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cyn_roster_cache', filter: 'id=eq.1' }, () => {
        backgroundReload()
      })
      .subscribe()
    return () => {
      supabase?.removeChannel(channel)
    }
  }, [enabled, backgroundReload])

  return { data, loading, refreshing, error, lastUpdated, deltas, refresh }
}
