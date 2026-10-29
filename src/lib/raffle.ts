import { isTeam, type MemberStats } from './stats'
import { fetchClanScoreLedger, type ClanScoreRow } from './clanScore'

// The numbers of the Factor Wheel (CYN Hero Skin event), taken from the site's own stats so nobody types them in:
//   weight = base weight + games factor + win score factor
//   base weight   = +3 for a Discord server booster, +3 for a donation of 5 EUR or more (supporter); nobody starts with a base weight
//   games factor  = +2.5 per full 50 games      (0-49 = 0, 50-99 = 2.5, 100-149 = 5 ...)
//   win score     = +1 per full 10 Win Score    (0-9 = 0, 10-19 = 1, 20-29 = 2 ...)
// Games and Win Score only count team games inside the event window in which at least one other registered CYN member played.

export interface RaffleEntry {
  id: string
  name: string
  games: number
  winScore: number
  base: number
  gamesFactor: number
  winScoreFactor: number
  weight: number
}

const decided = (r: string) => r === 'victory' || r === 'defeat'

export const BASE_WEIGHT = 0
export const BOOST_BONUS = 3
export const DONATION_BONUS = 3

export function gamesFactor(games: number): number {
  return Math.floor(games / 50) * 2.5
}
export function winScoreFactor(winScore: number): number {
  return Math.floor(Math.max(0, winScore) / 10)
}

/** Every member with at least one qualifying team game in the window, with games, Win Score and weight. */
export async function computeRaffleEntries(members: MemberStats[], boosters: Set<string>, fromMs: number, toMs: number): Promise<RaffleEntry[]> {
  // how many registered members played each team game of the window
  const players = new Map<string, number>()
  const byMember = new Map<string, Set<string>>()
  for (const m of members) {
    const ids = new Set<string>()
    for (const g of m.cynGames) {
      const t = Date.parse(g.start)
      if (!isTeam(g) || g.type === 'Private' || !decided(g.result) || !(t >= fromMs && t <= toMs) || ids.has(g.gameId)) continue
      ids.add(g.gameId)
      players.set(g.gameId, (players.get(g.gameId) ?? 0) + 1)
    }
    byMember.set(m.publicId, ids)
  }
  const qualifying = [...players.entries()].filter(([, n]) => n >= 2).map(([id]) => id)
  const ledger: Map<string, ClanScoreRow> = qualifying.length ? await fetchClanScoreLedger(qualifying) : new Map()

  const out: RaffleEntry[] = []
  for (const m of members) {
    const mine = [...(byMember.get(m.publicId) ?? [])].filter((id) => (players.get(id) ?? 0) >= 2)
    if (mine.length === 0) continue
    // a game's Win Score is shared between the registered members of the clan in it (same rule as the monthly Team table)
    let winScore = 0
    for (const id of mine) {
      const row = ledger.get(id)
      if (row) winScore += (row.won ? row.score : -row.score) / (players.get(id) ?? 1)
    }
    winScore = Math.round(winScore * 100) / 100
    const base = BASE_WEIGHT + (boosters.has(m.publicId) ? BOOST_BONUS : 0) + (m.isSupporter ? DONATION_BONUS : 0)
    const gf = gamesFactor(mine.length)
    const wf = winScoreFactor(winScore)
    out.push({ id: m.publicId, name: m.name, games: mine.length, winScore, base, gamesFactor: gf, winScoreFactor: wf, weight: base + gf + wf })
  }
  return out.sort((a, b) => b.weight - a.weight || b.games - a.games)
}
