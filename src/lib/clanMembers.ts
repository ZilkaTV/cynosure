// Everyone who is in the clan on OpenFront (registered here or not), from our own
// /api/clan-members (see worker/clanMembers.js). Cached in the browser for 30 minutes.

export interface WinLoss {
  w: number
  l: number
}

export interface ClanMember {
  id: string
  name: string | null
  role: 'leader' | 'officer' | 'member'
  joinedAt: string
  total: WinLoss
  ffa: WinLoss
  team: WinLoss
  ranked: WinLoss
  r1v1: WinLoss
}

const CACHE_KEY = 'cyn:clanMembers:v1'
const CACHE_MS = 30 * 60 * 1000

export async function fetchClanMembers(): Promise<ClanMember[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const { at, members } = JSON.parse(raw) as { at: number; members: ClanMember[] }
      if (Date.now() - at < CACHE_MS) return members
    }
  } catch {
    /* ignore a broken cache entry */
  }
  const res = await fetch('/api/clan-members')
  if (!res.ok) throw new Error(`clan members ${res.status}`)
  const body = (await res.json()) as { members: ClanMember[] }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), members: body.members }))
  } catch {
    /* private mode / quota */
  }
  return body.members
}
