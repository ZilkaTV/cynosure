import { monthKeyOf, type MemberStats } from './stats'
import type { ClanScoreRow } from './clanScore'
import type { PlayerGame } from './openfront'

type Mode = (g: PlayerGame) => boolean

const decided = (g: PlayerGame) => g.result === 'victory' || g.result === 'defeat'

/** How many [CYN] members played each scored game of the month (a game's Win Score is split between them). */
export function cynPlayersByGame(members: MemberStats[], month: string, isMode: Mode): Map<string, number> {
  const counts = new Map<string, number>()
  for (const m of members) {
    const seen = new Set<string>()
    for (const g of m.cynGames) {
      if (!isMode(g) || g.type === 'Private' || monthKeyOf(g.start) !== month || seen.has(g.gameId)) continue
      seen.add(g.gameId)
      counts.set(g.gameId, (counts.get(g.gameId) ?? 0) + 1)
    }
  }
  return counts
}

/** The decided, non-private games of one mode in a month (the games the clan ledger has a score for). */
export function scoredGameIdsOf(member: MemberStats, month: string, isMode: Mode): string[] {
  return member.cynGames.filter((g) => isMode(g) && g.type !== 'Private' && decided(g) && monthKeyOf(g.start) === month).map((g) => g.gameId)
}

/**
 * A member's Win Score of one month: every game's clan score divided by the number of [CYN] players in it; a win adds, a loss
 * subtracts, so it can go negative. null = no scored game played this month (so "did not play" never ranks above a real result).
 */
export function memberWinScore(member: MemberStats, month: string, isMode: Mode, ledger: Map<string, ClanScoreRow>, players: Map<string, number>): number | null {
  let total = 0
  let played = false
  for (const g of member.cynGames) {
    if (!isMode(g) || g.type === 'Private' || !decided(g) || monthKeyOf(g.start) !== month) continue
    played = true
    const row = ledger.get(g.gameId)
    if (row) total += (row.won ? row.score : -row.score) / (players.get(g.gameId) || 1)
  }
  return played ? Math.round(total * 100) / 100 : null
}
