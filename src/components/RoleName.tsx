import type { CSSProperties, ReactNode } from 'react'
import { useSharedRoster } from '../lib/access'
import { winsRoleGradient } from '../lib/badges'
import { cleanDisplayName } from '../lib/displayName'
import type { MemberStats } from '../lib/stats'

/** From this many wins real lightning crackles around the name (like a Super Saiyan 2), in the colour of the role. */
export const BOLT_WINS = 500
/** Silver (100 wins) and gold (250 wins) names get a bright glint that sweeps over the letters and a few small sparks (light bolts) now and then. */
export const GLINT_WINS = 100

// Jagged bolts drawn once (in a 120 x 40 box that is stretched over the name): arcs that run along the letters and spikes that leave the name
// upwards and downwards, a few with a small branch. They flash one after the other (CSS, see .bolts in index.css).
function bolt(seed: number, from: [number, number], to: [number, number], steps: number, jag: number): string {
  let s = seed
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  const pts: [number, number][] = [from]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = from[0] + (to[0] - from[0]) * t
    const y = from[1] + (to[1] - from[1]) * t
    pts.push([x + (rnd() - 0.5) * jag, y + (rnd() - 0.5) * jag * 1.4])
  }
  pts.push(to)
  return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')
}
const BOLT_PATHS: { d: string; branch?: string }[] = [
  { d: bolt(11, [8, 20], [112, 20], 12, 8), branch: bolt(3, [40, 20], [52, 34], 4, 4) }, // along the letters
  { d: bolt(23, [8, 4], [2, 37], 7, 7) }, // left side
  { d: bolt(37, [114, 36], [116, 3], 7, 7), branch: bolt(5, [115, 20], [104, 26], 3, 3) }, // right side
  { d: bolt(41, [24, 26], [42, 40], 5, 6) }, // below the name
  { d: bolt(53, [72, 27], [92, 40], 5, 6), branch: bolt(9, [82, 33], [70, 40], 2, 3) }, // below the name
  { d: bolt(67, [50, 13], [66, 0], 4, 6) }, // above
  { d: bolt(71, [2, 30], [26, 40], 4, 5) }, // lower left corner
  { d: bolt(79, [118, 12], [100, 0], 4, 5) }, // upper right corner
]

/** The lightning around a name (from 500 wins): drawn over the name, never in the way of the mouse. */
export function Bolts() {
  return (
    <svg className="bolts" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
      {BOLT_PATHS.map((b, i) => (
        <g key={i} className={`bolt bolt-${i + 1}`}>
          <path d={b.d} className="glow" />
          {b.branch && <path d={b.branch} className="glow" />}
          <path d={b.d} className="core" />
          {b.branch && <path d={b.branch} className="core" />}
        </g>
      ))}
    </svg>
  )
}

/** A name in the colours of the Discord wins role (50 wins bronze, 100 silver, ...): two shades slide through the letters; no role = plain. From 500 wins lightning crackles around it. */
export function RoleName({ wins, className = '', children }: { wins: number | undefined; className?: string; children: ReactNode }) {
  const colors = wins == null ? null : winsRoleGradient(wins)
  if (!colors) return <span className={className}>{children}</span>
  const bolts = wins != null && wins >= BOLT_WINS
  const glint = wins != null && wins >= GLINT_WINS && !bolts
  return (
    <span className={`role-name ${bolts ? 'role-bolts' : ''} ${glint ? 'role-glint role-sparks' : ''} ${className}`} style={{ '--c1': colors[0], '--c2': colors[1] } as CSSProperties}>
      {children}
      {bolts && <Bolts />}
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
