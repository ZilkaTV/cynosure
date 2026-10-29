import type { CSSProperties, ReactNode } from 'react'
import { useSharedRoster } from '../lib/access'
import { winsRoleGradient } from '../lib/badges'
import { cleanDisplayName } from '../lib/displayName'
import type { MemberStats } from '../lib/stats'

/** A name in the colours of the Discord wins role (50 wins bronze, 100 silver, ...): two shades slide through the letters; no role = plain. */
export function RoleName({ wins, className = '', children }: { wins: number | undefined; className?: string; children: ReactNode }) {
  const colors = wins == null ? null : winsRoleGradient(wins)
  if (!colors) return <span className={className}>{children}</span>
  return (
    <span className={`role-name ${className}`} style={{ '--c1': colors[0], '--c2': colors[1] } as CSSProperties}>
      {children}
    </span>
  )
}

interface WinsIndex {
  byId: Map<string, number>
  /** registered name per member id */
  nameById: Map<string, string>
  /** name (lower case) -> all-time wins, only for names that belong to ONE member (a name several members played under is skipped) */
  byName: Map<string, number>
}

const NO_MEMBERS: MemberStats[] = []
let indexedFor: MemberStats[] | null = null
let index: WinsIndex = { byId: new Map(), nameById: new Map(), byName: new Map() }

/** All-time wins per member, by id and by (lower-case) name, from the roster that is shared on the page; empty until it is there. */
export function useWinsIndex(): WinsIndex {
  const members = useSharedRoster()?.members ?? NO_MEMBERS
  if (indexedFor !== members) {
    indexedFor = members
    const byName = new Map<string, number>()
    // Registered names first: they identify the member. Names members only played under in a game count when exactly one member did.
    for (const m of members) byName.set(cleanDisplayName(m.name).toLowerCase(), m.allWins)
    const owners = new Map<string, Set<string>>()
    for (const m of members) {
      for (const g of m.cynGames) {
        const played = cleanDisplayName(g.username).toLowerCase()
        const set = owners.get(played) ?? new Set<string>()
        set.add(m.publicId)
        owners.set(played, set)
      }
    }
    for (const m of members) {
      for (const g of m.cynGames) {
        const played = cleanDisplayName(g.username).toLowerCase()
        if (!byName.has(played) && owners.get(played)?.size === 1) byName.set(played, m.allWins)
      }
    }
    index = {
      byId: new Map(members.map((m) => [m.publicId, m.allWins])),
      nameById: new Map(members.map((m) => [m.publicId, cleanDisplayName(m.name)])),
      byName,
    }
  }
  return index
}

/**
 * "Zilka, Sweeper, deshack +4": the player names of one game. A name is matched to a member of THAT game (so a name two members
 * once played under cannot take the wrong member's colour or registered name): the member's wins colour the name, and a
 * registered name that differs from the in-game name follows in gold brackets.
 */
export function RosterNames({
  names,
  members,
  winsById,
  nameById,
  max = 10,
}: {
  names: string[]
  members: { publicId: string; username: string }[]
  winsById: Map<string, number>
  nameById: Map<string, string>
  max?: number
}) {
  const clean = names.map(cleanDisplayName)
  const shown = clean.length <= max ? clean : clean.slice(0, max - 1)
  return (
    <>
      {shown.map((n, i) => {
        const member = members.find((m) => cleanDisplayName(m.username).toLowerCase() === n.toLowerCase())
        const registered = member ? nameById.get(member.publicId) : undefined
        return (
          <span key={i}>
            {i > 0 && ', '}
            <RoleName wins={member ? winsById.get(member.publicId) : undefined}>{n}</RoleName>
            {registered && registered.toLowerCase() !== n.toLowerCase() && <span className="ml-1 text-gold-light">({registered})</span>}
          </span>
        )
      })}
      {clean.length > max && ` +${clean.length - (max - 1)}`}
    </>
  )
}
