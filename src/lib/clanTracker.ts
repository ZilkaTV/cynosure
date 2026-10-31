import { useEffect, useState } from 'react'

// The member list and the games of the clan, as the CYN bot (worker/donorBot.js) stored them. Members of the site only.

export interface TrackedMember {
  publicId: string
  username: string | null
  role: 'leader' | 'officer' | 'member'
  joinedAt: string | null
}
export interface MemberEvent {
  /** ISO time */
  at: string
  type: 'joined' | 'left' | 'role'
  playerId: string
  username: string | null
  role: 'leader' | 'officer' | 'member'
  /** the role before, for type "role" */
  from?: 'leader' | 'officer' | 'member'
}
export interface MembersDoc {
  members: TrackedMember[]
  total: number
  pendingRequests: number | null
  events: MemberEvent[]
  updated_at: string
}

export interface TrackedGame {
  gameId: string
  /** ISO time */
  start: string | null
  map: string | null
  result: 'victory' | 'defeat'
  durationSeconds: number | null
  /** null = not a ranked game */
  rankedType: string | null
  totalPlayers: number | null
  clanPlayers: { publicId: string; username: string | null; won: boolean }[]
}
export interface GamesDoc {
  games: TrackedGame[]
  updated_at: string
}

async function load<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: 'same-origin' })
    if (!res.ok) return null
    const j = (await res.json()) as T & { empty?: boolean }
    return j.empty ? null : j
  } catch {
    return null
  }
}

/** Both documents; null while loading and also when the bot has not stored them yet (then there is nothing to show). */
export function useClanTracker(): { members: MembersDoc | null; games: GamesDoc | null; loaded: boolean } {
  const [state, setState] = useState<{ members: MembersDoc | null; games: GamesDoc | null; loaded: boolean }>({ members: null, games: null, loaded: false })
  useEffect(() => {
    let alive = true
    void Promise.all([load<MembersDoc>('/api/clan-donors/members'), load<GamesDoc>('/api/clan-donors/games')]).then(([members, games]) => {
      if (alive) setState({ members, games, loaded: true })
    })
    return () => {
      alive = false
    }
  }, [])
  return state
}
