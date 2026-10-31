// ── Daily quests ─────────────────────────────────────────────────────────────
// Daily quests, reset at midnight UTC (the donation quests also come weekly - from Monday 00:00 UTC - and monthly). A member clicks "Claim" and the site
// checks the requirement against already-loaded OpenFront/roster data (no
// separate "server" - the browser has the same data a server would use), then
// awards XP. A quest can only be claimed once per member per day - enforced
// both by checking cyn_quest_claims first and by its DB primary key.

import { supabase } from './supabase'
import { isRankedFfa, isTeam, is1v1, is2v2, type MemberStats } from './stats'
import { startOfWeek, type DonationTotals } from './clanDonors'

const MIN_LOBBY_SIZE = 10

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
}

export type QuestPeriod = 'day' | 'week' | 'month'

/** The key a claim is stored under: the date (day), the Monday of the week ("W2026-10-26") or the month ("2026-11"). One claim per key. */
export function periodKey(period: QuestPeriod, now = new Date()): string {
  if (period === 'day') return now.toISOString().slice(0, 10)
  if (period === 'week') return 'W' + new Date(startOfWeek(now)).toISOString().slice(0, 10)
  return now.toISOString().slice(0, 7)
}

/** Timestamp (ms) of the next reset of a period (midnight UTC, Monday 00:00 UTC, the 1st 00:00 UTC). */
export function nextResetAt(period: QuestPeriod = 'day'): number {
  const d = new Date()
  if (period === 'week') return startOfWeek(d) + 7 * 86_400_000
  if (period === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)
}

function isToday(iso: string | null): boolean {
  return !!iso && iso.slice(0, 10) === todayKey()
}

/** Extra facts a quest can need beyond the roster data (loaded by the Quests page). */
export interface QuestContext {
  reactedToday: boolean
  /** opened a card booster today (UTC); missing = not known */
  openedBooster?: boolean
  /** What the member donated to the clan (from the stored donor list; see src/lib/clanDonors.ts). */
  donated: DonationTotals
}

export interface QuestDef {
  id: string
  name: string
  description: string
  /** German texts for quests that are not in the translation tables. */
  de?: { name: string; description: string }
  /** How often the quest comes back; the daily ones when missing. */
  period?: QuestPeriod
  xp: number
  check: (m: MemberStats, coopByGame: Record<string, boolean>, ctx: QuestContext) => boolean
}

export const QUESTS: QuestDef[] = [
  {
    id: 'ffa_win',
    name: 'Battle Royale',
    description: 'Win 1 ranked FFA game',
    xp: 25,
    check: (m) => m.cynGames.some((g) => isRankedFfa(g) && g.result === 'victory' && g.start.slice(0, 10) === todayKey()),
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
    id: 'ranked_win',
    name: 'Duelist',
    description: 'Win 1 ranked 1v1',
    xp: 20,
    check: (m) => m.cynGames.some((g) => is1v1(g) && g.result === 'victory' && g.start.slice(0, 10) === todayKey()),
  },
  {
    id: 'ranked_2v2_win',
    name: 'Tag Team',
    description: 'Win 1 ranked 2v2',
    xp: 20,
    check: (m) => m.cynGames.some((g) => is2v2(g) && g.result === 'victory' && g.start.slice(0, 10) === todayKey()),
  },
  {
    id: 'react_game',
    name: 'Hype Man',
    description: 'React to a clan game',
    xp: 10,
    check: (_m, _coop, ctx) => ctx.reactedToday,
  },
  {
    id: 'speedrun_post',
    name: 'Against the Clock',
    description: 'Submit a speedrun (any result)',
    xp: 15,
    check: (m) => isToday(m.lastSpeedrunAt),
  },
  {
    id: 'open_booster',
    name: 'Booster Time',
    description: 'Open a card booster',
    de: { name: 'Booster-Zeit', description: 'Öffne einen Karten-Booster' },
    xp: 10,
    check: (_m, _coop, ctx) => !!ctx.openedBooster,
  },
  // Donation quests: checked against the single donations of the stored donor list (imported by an admin, so they can lag a little).
  {
    id: 'donate_caps_day',
    name: 'Open Hand',
    description: 'Donate 100 caps to the clan today',
    de: { name: 'Offene Hand', description: 'Spende heute 100 Caps an den Clan' },
    xp: 15,
    check: (_m, _coop, ctx) => ctx.donated.capsDay >= 100,
  },
  {
    id: 'donate_caps_week',
    name: 'Treasure Keeper',
    description: 'Donate 10,000 caps to the clan this week',
    de: { name: 'Schatzmeister', description: 'Spende diese Woche 10.000 Caps an den Clan' },
    period: 'week',
    xp: 60,
    check: (_m, _coop, ctx) => ctx.donated.capsWeek >= 10_000,
  },
  {
    id: 'donate_plutonium_month',
    name: 'Atomic Patron',
    description: 'Donate 100 plutonium to the clan this month',
    de: { name: 'Atom-Mäzen', description: 'Spende diesen Monat 100 Plutonium an den Clan' },
    period: 'month',
    xp: 100,
    check: (_m, _coop, ctx) => ctx.donated.plutoniumMonth >= 100,
  },
]

export const questPeriod = (q: QuestDef): QuestPeriod => q.period ?? 'day'

export async function fetchXp(): Promise<Record<string, number>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('cyn_xp').select('openfront_id, xp')
  if (error) return {}
  const map: Record<string, number> = {}
  for (const r of (data as { openfront_id: string; xp: number }[]) ?? []) map[r.openfront_id] = r.xp
  return map
}

/** The quests this member has already claimed in their current period (today / this week / this month). */
export async function fetchClaimsToday(openfrontId: string): Promise<Set<string>> {
  if (!supabase) return new Set()
  const keys = (['day', 'week', 'month'] as const).map((p) => periodKey(p))
  const { data, error } = await supabase.from('cyn_quest_claims').select('quest_id, claim_date').eq('openfront_id', openfrontId).in('claim_date', keys)
  if (error) return new Set()
  const current = new Map(QUESTS.map((q) => [q.id, periodKey(questPeriod(q))]))
  return new Set((data as { quest_id: string; claim_date: string }[]).filter((r) => current.get(r.quest_id) === r.claim_date).map((r) => r.quest_id))
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
  ctx: QuestContext,
): Promise<ClaimResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }

  if (!quest.check(member, coopByGame, ctx)) {
    return { ok: false, message: "Not completed yet. Come back once you've done it." }
  }

  // Proactively nudges the client to refresh an expired-but-still-
  // refreshable session before attempting the write below - a stale access
  // token (e.g. a tab left open/backgrounded for hours, a known recurring
  // issue here - see useSession.ts's own tracking comment) otherwise
  // surfaces as a confusing raw "row-level security policy" Postgres error
  // instead of the actual "you got signed out" cause. getSession() already
  // triggers supabase-js's internal refresh when the stored session is
  // expired but its refresh token is still valid.
  await supabase.auth.getSession()

  const { error: claimError } = await supabase.from('cyn_quest_claims').insert({
    openfront_id: openfrontId,
    quest_id: quest.id,
    claim_date: periodKey(questPeriod(quest)),
  })
  if (claimError) {
    // Unique violation = already claimed today (e.g. a second tab beat us to it).
    if (claimError.code === '23505') return { ok: false, message: 'Already claimed.' }
    // RLS rejection (42501) means Supabase doesn't consider this session
    // authenticated - the getSession() call above already tried to quietly
    // fix that; if it still fails, the refresh token itself is gone too and
    // only a real re-login clears it. Reported plainly instead of the raw
    // Postgres message, which gives no hint that signing back in helps.
    if (claimError.code === '42501' || claimError.message.includes('row-level security')) {
      return { ok: false, message: 'Your session expired. Sign out and back in with Discord, then try again.' }
    }
    return { ok: false, message: `Couldn't claim: ${claimError.message}` }
  }

  const { data: existing } = await supabase.from('cyn_xp').select('xp').eq('openfront_id', openfrontId).maybeSingle()
  const newXp = ((existing as { xp: number } | null)?.xp ?? 0) + quest.xp
  const { error: xpError } = await supabase.from('cyn_xp').upsert({ openfront_id: openfrontId, xp: newXp }, { onConflict: 'openfront_id' })
  if (xpError) return { ok: false, message: `Claimed, but XP save failed: ${xpError.message}` }

  return { ok: true, message: `+${quest.xp} XP!` }
}
