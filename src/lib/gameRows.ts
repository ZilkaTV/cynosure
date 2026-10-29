import { useEffect, useState } from 'react'
import { supabase as db } from './supabase'
import { is1v1, is2v2, isFfa, isRankedFfa, isTeam, type MemberStats } from './stats'
import type { PlayerGame } from './openfront'

// Shared bits of the game tables on Home (latest games) and History: the mode name, the Elo a ranked game gave, and the win rate
// shown where a game has no clan ratio.

/** "1v1 (ranked)", "2v2 (ranked)", "FFA (ranked)" for ranked ladder games; Team / FFA otherwise. */
export function gameModeLabel(g: PlayerGame): string {
  if (is1v1(g)) return '1v1 (ranked)'
  if (is2v2(g)) return '2v2 (ranked)'
  if (isRankedFfa(g)) return 'FFA (ranked)'
  if (isTeam(g)) return 'Team'
  if (isFfa(g)) return 'FFA'
  return g.mode
}

export const isRankedGame = (g: PlayerGame) => g.rankedType === '1v1' || g.rankedType === '2v2' || g.rankedType === 'ffa'

// The group of games a win rate is taken over: each ranked ladder for itself, private games, team games, public FFA.
const winRateGroup = (g: PlayerGame) => (isRankedGame(g) ? g.rankedType : g.type === 'Private' ? 'private' : isTeam(g) ? 'team' : 'ffa')

/** Win rate (whole %) of the member over the games like this one (the same ladder / mode); null without a finished game. */
export function groupWinRate(member: MemberStats | undefined, g: PlayerGame): number | null {
  if (!member) return null
  const group = winRateGroup(g)
  let wins = 0
  let losses = 0
  for (const x of member.cynGames) {
    if (winRateGroup(x) !== group) continue
    if (x.result === 'victory') wins++
    else if (x.result === 'defeat') losses++
  }
  return wins + losses > 0 ? Math.round((100 * wins) / (wins + losses)) : null
}

/** Elo one member got for a ranked game: `d` the change; `c` > 1 when it is the total of several games played in one board update. */
export interface EloChange {
  d: number
  c: number
}

type EloByGame = Map<string, Map<string, EloChange>>
const known: EloByGame = new Map()
const asked = new Set<string>()

/**
 * Elo changes of the ranked games in the list, read from the ranked feed (cyn_ranked_matches). OpenFront publishes no change per
 * game, the feed derives it for players in the top 100 (so for a member outside the top 100 there is none: the cell shows "-").
 */
export function useRankedElo(games: PlayerGame[]): EloByGame {
  const [, tick] = useState(0)
  const ids = games.filter(isRankedGame).map((g) => g.gameId)
  const key = ids.join(',')

  useEffect(() => {
    const todo = ids.filter((id) => !asked.has(id))
    if (todo.length === 0) return
    todo.forEach((id) => asked.add(id))
    let alive = true
    void (async () => {
      for (let i = 0; i < todo.length; i += 90) {
        const { data, error } = await db.from('cyn_ranked_matches').select('game_id, players').in('game_id', todo.slice(i, i + 90))
        if (error || !data) continue
        for (const row of data as { game_id: string; players: { id?: string; d?: number; c?: number }[] }[]) {
          const byPlayer = new Map<string, EloChange>()
          for (const p of row.players ?? []) if (p.id && typeof p.d === 'number') byPlayer.set(p.id, { d: p.d, c: p.c ?? 1 })
          known.set(row.game_id, byPlayer)
        }
      }
      if (alive) tick((n) => n + 1)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return known
}

/** The Elo change of the first of these members that has one for the game. */
export function eloChangeFor(known: EloByGame, gameId: string, memberIds: string[]): EloChange | null {
  const byPlayer = known.get(gameId)
  if (!byPlayer) return null
  for (const id of memberIds) {
    const c = byPlayer.get(id)
    if (c) return c
  }
  return null
}

export function fmtEloChange(c: EloChange): string {
  const sign = c.d > 0 ? '+' : c.d < 0 ? '−' : '±'
  return `${c.c > 1 ? 'Σ ' : ''}${sign}${Math.abs(c.d)} Elo`
}
