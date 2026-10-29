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
  byName: Map<string, number>
  /** in-game name (lower case) -> the member's registered name, for games played under another name */
  registeredByName: Map<string, string>
}

const NO_MEMBERS: MemberStats[] = []
let indexedFor: MemberStats[] | null = null
let index: WinsIndex = { byId: new Map(), byName: new Map(), registeredByName: new Map() }

/** All-time wins per member, by id and by (lower-case) name, from the roster that is shared on the page; empty until it is there. */
export function useWinsIndex(): WinsIndex {
  const members = useSharedRoster()?.members ?? NO_MEMBERS
  if (indexedFor !== members) {
    indexedFor = members
    index = { byId: new Map(members.map((m) => [m.publicId, m.allWins])), byName: new Map(), registeredByName: new Map() }
    for (const m of members) {
      const registered = cleanDisplayName(m.name)
      index.byName.set(registered.toLowerCase(), m.allWins)
      for (const g of m.cynGames) {
        const played = cleanDisplayName(g.username).toLowerCase()
        index.byName.set(played, m.allWins)
        if (played !== registered.toLowerCase()) index.registeredByName.set(played, registered)
      }
    }
  }
  return index
}

/** "Zilka, Sweeper, deshack +4": a list of player names, the registered members among them in their role colours. */
export function RosterNames({ names, byName, registered, max = 6 }: { names: string[]; byName: Map<string, number>; registered?: Map<string, string>; max?: number }) {
  const clean = names.map(cleanDisplayName)
  const shown = clean.length <= max ? clean : clean.slice(0, max - 1)
  return (
    <>
      {shown.map((n, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <RoleName wins={byName.get(n.toLowerCase())}>{n}</RoleName>
          {registered?.get(n.toLowerCase()) && <span className="ml-1 text-gold-light">({registered.get(n.toLowerCase())})</span>}
        </span>
      ))}
      {clean.length > max && ` +${clean.length - (max - 1)}`}
    </>
  )
}
