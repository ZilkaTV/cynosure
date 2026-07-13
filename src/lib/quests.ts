// ── Daily quests ─────────────────────────────────────────────────────────────
// 5 daily quests, reset at midnight UTC. A member clicks "Claim" and the site
// checks the requirement against already-loaded OpenFront/roster data (no
// separate "server" - the browser has the same data a server would use), then
// awards XP. A quest can only be claimed once per member per day - enforced
// both by checking cyn_quest_claims first and by its DB primary key.

import { supabase } from './supabase'
import { isFfa, isTeam, is1v1, type MemberStats } from './stats'

const MIN_LOBBY_SIZE = 10

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
}

function isToday(iso: string | null): boolean {
  return !!iso && iso.slice(0, 10) === todayKey()
}

export interface QuestDef {
  id: string
  name: string
  description: string
  xp: number
  check: (m: MemberStats, coopByGame: Record<string, boolean>) => boolean
}

export const QUESTS: QuestDef[] = [
  {
    id: 'ffa_win',
    name: 'Battle Royale',
    description: 'Win 1 FFA game with at least 10 players in the lobby',
    xp: 15,
    check: (m) =>
      m.cynGames.some(
        (g) => isFfa(g) && g.result === 'victory' && (g.totalPlayers ?? 0) >= MIN_LOBBY_SIZE && g.start.slice(0, 10) === todayKey(),
      ),
  },
  {
    id: 'team_win_friend',
    name: 'Brothers in Arms',
    description: 'Win 1 Team game with another [CYN] member, 10+ players in the lobby',
    xp: 20,
    check: (m, coopByGame) =>
      m.cynGames.some(
        (g) =>
          isTeam(g) &&
          g.result === 'victory' &&
          (g.totalPlayers ?? 0) >= MIN_LOBBY_SIZE &&
          g.start.slice(0, 10) === todayKey() &&
          coopByGame[g.gameId],
      ),
  },
  {
    id: 'bump',
    name: 'Spread the Word',
    description: 'Bump the clan post once',
    xp: 10,
    check: (m) => isToday(m.lastBumpAt),
  },
  {
    id: 'ranked_win',
    name: 'Duelist',
    description: 'Win 1 ranked 1v1',
    xp: 20,
    check: (m) => m.cynGames.some((g) => is1v1(g) && g.result === 'victory' && g.start.slice(0, 10) === todayKey()),
  },
  {
    id: 'speedrun_post',
    name: 'Against the Clock',
    description: 'Submit a speedrun (any result)',
    xp: 15,
    check: (m) => isToday(m.lastSpeedrunAt),
  },
]

export async function fetchXp(): Promise<Record<string, number>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_xp').select('openfront_id, xp')
  if (error) return {}
  const map: Record<string, number> = {}
  for (const r of (data as { openfront_id: string; xp: number }[]) ?? []) map[r.openfront_id] = r.xp
  return map
}

export async function fetchClaimsToday(openfrontId: string): Promise<Set<string>> {
  if (!supabase) return new Set()
  const { data, error } = await supabase
    .from('cyn_quest_claims')
    .select('quest_id')
    .eq('openfront_id', openfrontId)
    .eq('claim_date', todayKey())
  if (error) return new Set()
  return new Set((data as { quest_id: string }[]).map((r) => r.quest_id))
}

export interface ClaimResult {
  ok: boolean
  message: string
}

export async function claimQuest(
  openfrontId: string,
  quest: QuestDef,
  member: MemberStats,
  coopByGame: Record<string, boolean>,
): Promise<ClaimResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }

  if (!quest.check(member, coopByGame)) {
    return { ok: false, message: "Not completed yet today - come back once you've done it." }
  }

  const { error: claimError } = await supabase.from('cyn_quest_claims').insert({
    openfront_id: openfrontId,
    quest_id: quest.id,
    claim_date: todayKey(),
  })
  if (claimError) {
    // Unique violation = already claimed today (e.g. a second tab beat us to it).
    if (claimError.code === '23505') return { ok: false, message: 'Already claimed today.' }
    return { ok: false, message: `Couldn't claim: ${claimError.message}` }
  }

  const { data: existing } = await supabase.from('cyn_xp').select('xp').eq('openfront_id', openfrontId).maybeSingle()
  const newXp = ((existing as { xp: number } | null)?.xp ?? 0) + quest.xp
  const { error: xpError } = await supabase.from('cyn_xp').upsert({ openfront_id: openfrontId, xp: newXp }, { onConflict: 'openfront_id' })
  if (xpError) return { ok: false, message: `Claimed, but XP save failed: ${xpError.message}` }

  return { ok: true, message: `+${quest.xp} XP!` }
}
