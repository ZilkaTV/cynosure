import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSharedRoster } from '../lib/access'
import { fetchClanMembers } from '../lib/clanMembers'
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

// The icon and the banner get their own bolts, so the lightning never looks the same on name, icon and banner: the icon's spikes leave from its
// corners and sides (box 100 x 100), the banner's run along its edges (box 120 x 40, stretched over the banner).
const ICON_PATHS: { d: string; branch?: string }[] = [
  { d: bolt(101, [20, 20], [-6, -8], 5, 9), branch: bolt(7, [10, 8], [16, -4], 2, 4) },
  { d: bolt(103, [80, 18], [108, -6], 5, 9) },
  { d: bolt(107, [82, 82], [106, 108], 5, 9), branch: bolt(11, [94, 98], [88, 108], 2, 4) },
  { d: bolt(109, [18, 84], [-8, 106], 5, 9) },
  { d: bolt(113, [52, 12], [58, -10], 4, 6) },
  { d: bolt(127, [12, 48], [-10, 40], 4, 6) },
  { d: bolt(131, [90, 56], [110, 62], 4, 6) },
  { d: bolt(137, [44, 90], [38, 110], 4, 6) },
]
const BANNER_PATHS: { d: string; branch?: string }[] = [
  { d: bolt(201, [3, 1.5], [44, 0.5], 12, 2.2), branch: bolt(5, [20, 1], [26, 6], 2, 2) },
  { d: bolt(203, [68, 1], [117, 2.5], 12, 2.2) },
  { d: bolt(207, [1.5, 5], [0.5, 35], 8, 1.6) },
  { d: bolt(211, [118.5, 5], [119.5, 35], 8, 1.6), branch: bolt(13, [119, 20], [114, 24], 2, 2) },
  { d: bolt(213, [4, 38.5], [50, 39.5], 12, 2.2) },
  { d: bolt(217, [72, 39], [116, 38], 12, 2.2), branch: bolt(17, [92, 39], [98, 34], 2, 2) },
  { d: bolt(219, [32, 3], [24, -2], 3, 2.5) },
  { d: bolt(223, [96, 37], [104, 42], 3, 2.5) },
]
const BOLT_SETS = {
  name: { box: '0 0 120 40', paths: BOLT_PATHS, delay: '0s' },
  icon: { box: '0 0 100 100', paths: ICON_PATHS, delay: '1.3s' },
  banner: { box: '0 0 120 40', paths: BANNER_PATHS, delay: '2.2s' },
}
export type BoltVariant = keyof typeof BOLT_SETS

/** The lightning around a name, icon or banner (from 500 wins): drawn over it, never in the way of the mouse. Every variant has its own bolts and its own rhythm. */
export function Bolts({ variant = 'name' }: { variant?: BoltVariant }) {
  const set = BOLT_SETS[variant]
  return (
    <svg className="bolts" style={{ '--bd': set.delay } as CSSProperties} viewBox={set.box} preserveAspectRatio="none" aria-hidden="true">
      {set.paths.map((b, i) => (
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
  /** name (lower case) -> member id, same rules as byName but for every registered member (also those who left the clan): the profile a name links to */
  idByName: Map<string, string>
}

const NO_MEMBERS: MemberStats[] = []
let indexedFor: MemberStats[] | null = null
let indexedClan: ReadonlySet<string> | null = null
let index: WinsIndex = { byId: new Map(), nameById: new Map(), byName: new Map(), idByName: new Map() }

/**
 * The wins index of a roster. With the list of the people who are in the clan right now (`clan`), members who are not in it any more (they left
 * with a lot of wins) are left out: no coloured name and no frame, like the Discord role the role sync no longer gives them. `clan` null = not known
 * (yet): everybody counts.
 */
export function buildWinsIndex(all: MemberStats[], clan: ReadonlySet<string> | null): WinsIndex {
  const members = clan ? all.filter((m) => clan.has(m.publicId)) : all
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
  const idByName = new Map<string, string>()
  const idOwners = new Map<string, Set<string>>()
  for (const m of all) {
    idByName.set(cleanDisplayName(m.name).toLowerCase(), m.publicId)
    for (const g of m.cynGames) {
      const played = cleanDisplayName(g.username).toLowerCase()
      const set = idOwners.get(played) ?? new Set<string>()
      set.add(m.publicId)
      idOwners.set(played, set)
    }
  }
  for (const m of all) {
    for (const g of m.cynGames) {
      const played = cleanDisplayName(g.username).toLowerCase()
      if (!idByName.has(played) && idOwners.get(played)?.size === 1) idByName.set(played, m.publicId)
    }
  }
  return {
    byId: new Map(members.map((m) => [m.publicId, m.allWins])),
    // the registered names stay for everybody: a member who left is still named correctly, just without the colours
    nameById: new Map(all.map((m) => [m.publicId, cleanDisplayName(m.name)])),
    byName,
    idByName,
  }
}

let clanIds: ReadonlySet<string> | null = null
let clanAsked = false
const clanListeners = new Set<() => void>()
/** The ids of everybody who is in the clan on OpenFront right now (null until known, and when the list cannot be read or is too short to be believed). */
export function useClanIds(): ReadonlySet<string> | null {
  const [, tick] = useState(0)
  useEffect(() => {
    const on = () => tick((n) => n + 1)
    clanListeners.add(on)
    if (!clanAsked) {
      clanAsked = true
      void fetchClanMembers()
        .then((list) => {
          // a failed or cut-off read must never strip everybody of their colours
          if (list.length >= 20) clanIds = new Set(list.map((m) => m.id))
          clanListeners.forEach((l) => l())
        })
        .catch(() => {
          clanAsked = false
        })
    }
    return () => {
      clanListeners.delete(on)
    }
  }, [])
  return clanIds
}

/** All-time wins per member, by id and by (lower-case) name, from the roster that is shared on the page; empty until it is there. Members who left the clan are not in it. */
export function useWinsIndex(): WinsIndex {
  const members = useSharedRoster()?.members ?? NO_MEMBERS
  const clan = useClanIds()
  if (indexedFor !== members || indexedClan !== clan) {
    indexedFor = members
    indexedClan = clan
    index = buildWinsIndex(members, clan)
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
            {member ? (
              // the rows of the game lists open the report on a click: the name goes to the profile instead
              <Link to={`/member/${member.publicId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                <RoleName wins={winsById.get(member.publicId)}>{n}</RoleName>
              </Link>
            ) : (
              <RoleName wins={undefined}>{n}</RoleName>
            )}
            {registered && registered.toLowerCase() !== n.toLowerCase() && <span className="ml-1 text-gold-light">({registered})</span>}
          </span>
        )
      })}
      {clean.length > max && ` +${clean.length - (max - 1)}`}
    </>
  )
}
