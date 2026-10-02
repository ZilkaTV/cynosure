import { useEffect, useState } from 'react'
import { fetchRegistered } from './profiles'

// openfront id -> display name for registered members, fetched once per page
// load and shared by every component that needs a "who" hover list (game
// reactions, game night RSVPs). Cheap: one small query on cyn_members.
let cache: Record<string, string> | null = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function load() {
  if (inflight || cache) return
  inflight = fetchRegistered()
    .then((members) => {
      cache = Object.fromEntries(members.map((m) => [m.openfront_id, m.in_game_name]))
      listeners.forEach((l) => l())
    })
    .catch(() => {})
    .finally(() => {
      inflight = null
    })
}

export function useMemberNames(enabled = true): Record<string, string> {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    load()
    return () => {
      listeners.delete(l)
    }
  }, [enabled])
  return cache ?? {}
}
