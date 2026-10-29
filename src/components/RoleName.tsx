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
}

const NO_MEMBERS: MemberStats[] = []
let indexedFor: MemberStats[] | null = null
let index: WinsIndex = { byId: new Map(), byName: new Map() }

/** All-time wins per member, by id and by (lower-case) name, from the roster that is shared on the page; empty until it is there. */
export function useWinsIndex(): WinsIndex {
  const members = useSharedRoster()?.members ?? NO_MEMBERS
  if (indexedFor !== members) {
    indexedFor = members
    index = { byId: new Map(members.map((m) => [m.publicId, m.allWins])), byName: new Map() }
    for (const m of members) {
      index.byName.set(cleanDisplayName(m.name).toLowerCase(), m.allWins)
      for (const g of m.cynGames) index.byName.set(cleanDisplayName(g.username).toLowerCase(), m.allWins)
    }
  }
  return index
}

/** "Zilka, Sweeper, deshack +4": a list of player names, the registered members among them in their role colours. */
export function RosterNames({ names, byName, max = 6 }: { names: string[]; byName: Map<string, number>; max?: number }) {
  const clean = names.map(cleanDisplayName)
  const shown = clean.length <= max ? clean : clean.slice(0, max - 1)
  return (
    <>
      {shown.map((n, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <RoleName wins={byName.get(n.toLowerCase())}>{n}</RoleName>
        </span>
      ))}
      {clean.length > max && ` +${clean.length - (max - 1)}`}
    </>
  )
}
