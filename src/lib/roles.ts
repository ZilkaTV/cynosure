import { useEffect, useState } from 'react'
import { fetchClanMembers } from './clanMembers'
import { fetchEventTeams } from './events'
import { cleanDisplayName } from './displayName'
import { EVENTS } from '../data/events'

export type SiteRole = 'inner' | 'captain' | 'leader' | 'officer' | 'member'

// The clan role comes from OpenFront's clan list, the captain role from the teams of the events that are not over yet.
let captains: Set<string> | null = null

async function loadCaptains(): Promise<Set<string>> {
  if (captains) return captains
  const names = new Set<string>()
  for (const ev of EVENTS.filter((e) => e.status !== 'ended')) {
    const teams = await fetchEventTeams(ev.id).catch(() => [])
    for (const t of teams) if (t.captain) names.add(cleanDisplayName(t.captain).toLowerCase())
  }
  captains = names
  return names
}

/** The roles of a member, most special first: inner circle, event captain, then the clan role (leader / officer / member). */
export function useMemberRoles(openfrontId: string | undefined, name: string | undefined, isInner: boolean): SiteRole[] {
  const [clanRole, setClanRole] = useState<SiteRole | null>(null)
  const [isCaptain, setIsCaptain] = useState(false)

  useEffect(() => {
    if (!openfrontId) return
    let alive = true
    fetchClanMembers()
      .then((list) => {
        if (alive) setClanRole(list.find((m) => m.id === openfrontId)?.role ?? null)
      })
      .catch(() => {})
    loadCaptains().then((set) => {
      if (alive && name) setIsCaptain(set.has(cleanDisplayName(name).toLowerCase()))
    })
    return () => {
      alive = false
    }
  }, [openfrontId, name])

  const roles: SiteRole[] = []
  if (isInner) roles.push('inner')
  if (isCaptain) roles.push('captain')
  roles.push(clanRole ?? 'member')
  return roles
}
