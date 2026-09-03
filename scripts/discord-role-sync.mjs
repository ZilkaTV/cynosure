#!/usr/bin/env node
// Assigns each registered CYN member the single Discord role matching the
// highest wins-tier they've reached (see WINS_TIERS in src/lib/badges.ts,
// which this duplicates - this script can't import src/, same reasoning as
// every other duplicated constant in refresh-details.mjs, e.g. CLAN_TAG).
// A member holds exactly one of the 9 wins-tier roles at a time, mirroring
// how the website's own badges only ever display the single best tier
// reached, not every one ever crossed - reaching a new tier removes the
// previous role rather than stacking it.
//
// Also assigns a separate, independent "100 games played" role (GAMES_100_*
// below) purely on total CYN-tagged games (any result) crossing that
// threshold - held alongside whichever wins-tier role applies, not instead
// of it.
//
// Runs on a schedule via .github/workflows/discord-role-sync.yml. Stateless
// on every run: it always recomputes the intended role from scratch and
// reconciles toward it, so unlike refresh-details.mjs's cron there's no
// accumulating clamp two overlapping runs could race - no concurrency guard
// needed here.

import { createClient } from '@supabase/supabase-js'

const DISCORD_GUILD_ID = '1367283444823883776' // same value as DISCORD_GUILD_ID in src/config.ts
const CLAN_TAG = 'CYN'

// Independent of the wins-tier roles below - held ALONGSIDE whichever wins
// tier a member has, not instead of it. "100 games" means total CYN-tagged
// games played (any result), matching MemberStats.clanGamesTotal in
// src/lib/stats.ts.
const GAMES_100_THRESHOLD = 100
const GAMES_100_ROLE_ID = '1545145526649884802'

// Highest threshold first - same 9 tiers/thresholds as WINS_TIERS in
// src/lib/badges.ts. Keep these two lists in sync by hand if the tiers ever
// change.
const WINS_TIERS = [
  { threshold: 10000, tier: 'winsGodTier' },
  { threshold: 5000, tier: 'winsImmortal' },
  { threshold: 2000, tier: 'winsChallenger' },
  { threshold: 1000, tier: 'winsChampion' },
  { threshold: 750, tier: 'winsMaster' },
  { threshold: 500, tier: 'winsDiamond' },
  { threshold: 250, tier: 'winsGold' },
  { threshold: 100, tier: 'winsSilver' },
  { threshold: 50, tier: 'winsBronze' },
]

function tierFromWins(allWins) {
  for (const { threshold, tier } of WINS_TIERS) {
    if (allWins >= threshold) return tier
  }
  return null
}

const RATE_LIMIT_RETRIES = 4
const RATE_LIMIT_BASE_DELAY_MS = 500

/** A Discord REST call, retried with backoff on 429 - same shape as fetchJson in refresh-details.mjs. */
async function discordFetch(botToken, path, init = {}) {
  const url = `https://discord.com/api/v10${path}`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    if (res.status === 429) {
      if (attempt >= RATE_LIMIT_RETRIES) throw new Error(`discord rate-limited: ${path}`)
      const retryAfter = Number((await res.json().catch(() => ({}))).retry_after ?? RATE_LIMIT_BASE_DELAY_MS / 1000)
      await new Promise((r) => setTimeout(r, Math.max(retryAfter * 1000, RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt)))
      continue
    }
    return res
  }
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const botToken = process.env.DISCORD_BOT_TOKEN
  const roleIdsJson = process.env.DISCORD_WINS_ROLE_IDS
  if (!supabaseUrl || !supabaseKey || !botToken || !roleIdsJson) {
    console.error(JSON.stringify({ error: 'missing_config' }))
    process.exitCode = 1
    return
  }
  const roleIdByTier = JSON.parse(roleIdsJson)
  const allConfiguredRoleIds = new Set(Object.values(roleIdByTier))

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: members, error: membersError } = await supabase
    .from('cyn_members')
    .select('openfront_id, discord_user_id')
  if (membersError) throw membersError

  // Wins were made monotonic (never decrease day to day - see
  // refresh-details.mjs's own priorMaxWinsByMember clamp), so the max
  // all_wins ever recorded for a member IS their current wins - no need to
  // re-scan OpenFront directly here.
  const { data: snapshotRows, error: snapshotError } = await supabase
    .from('cyn_member_snapshots')
    .select('openfront_id, all_wins')
  if (snapshotError) throw snapshotError
  const maxWinsByMember = new Map()
  for (const row of snapshotRows ?? []) {
    const prev = maxWinsByMember.get(row.openfront_id) ?? 0
    if (row.all_wins > prev) maxWinsByMember.set(row.openfront_id, row.all_wins)
  }

  // Total CYN-tagged games played (any result) per member, for the
  // independent "100 games" role - mirrors clanGamesTotal in
  // src/lib/stats.ts's buildRoster (games.length after filtering to CYN,
  // non-Singleplayer). This table's own games arrays only ever grow (see
  // refresh-details.mjs's union-before-upsert), so a plain count here is
  // always at least as fresh as what the site itself shows.
  const { data: gamesRows, error: gamesError } = await supabase.from('cyn_member_games_cache').select('openfront_id, games')
  if (gamesError) throw gamesError
  const totalGamesByMember = new Map(
    (gamesRows ?? []).map((r) => [
      r.openfront_id,
      (r.games ?? []).filter((g) => g.clanTag === CLAN_TAG && g.type !== 'Singleplayer').length,
    ]),
  )

  let checked = 0
  let skippedNoDiscordId = 0
  let updated = 0
  let unchanged = 0
  let failed = 0

  for (const m of members ?? []) {
    if (!m.discord_user_id) {
      skippedNoDiscordId++
      continue
    }
    checked++
    try {
      const allWins = maxWinsByMember.get(m.openfront_id) ?? 0
      const targetTier = tierFromWins(allWins)
      const targetRoleId = targetTier ? roleIdByTier[targetTier] : null
      const wants100GamesRole = (totalGamesByMember.get(m.openfront_id) ?? 0) >= GAMES_100_THRESHOLD

      const memberRes = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}/members/${m.discord_user_id}`)
      if (memberRes.status === 404) {
        // Left the server, or a stale/incorrect ID - nothing to sync.
        continue
      }
      if (!memberRes.ok) throw new Error(`GET member ${m.discord_user_id}: ${memberRes.status}`)
      const memberData = await memberRes.json()
      const currentRoles = new Set(memberData.roles ?? [])

      // Wins-tier roles are mutually exclusive (only the target tier is
      // kept); the 100-games role is independent - added/removed purely on
      // its own threshold, alongside whichever wins tier applies.
      const toRemove = [...allConfiguredRoleIds].filter((id) => id !== targetRoleId && currentRoles.has(id))
      const toAdd = []
      if (targetRoleId != null && !currentRoles.has(targetRoleId)) toAdd.push(targetRoleId)
      if (wants100GamesRole && !currentRoles.has(GAMES_100_ROLE_ID)) toAdd.push(GAMES_100_ROLE_ID)
      else if (!wants100GamesRole && currentRoles.has(GAMES_100_ROLE_ID)) toRemove.push(GAMES_100_ROLE_ID)

      if (toRemove.length === 0 && toAdd.length === 0) {
        unchanged++
        continue
      }

      for (const roleId of toRemove) {
        const res = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}/members/${m.discord_user_id}/roles/${roleId}`, {
          method: 'DELETE',
        })
        if (!res.ok && res.status !== 404) throw new Error(`DELETE role ${roleId} for ${m.discord_user_id}: ${res.status}`)
      }
      for (const roleId of toAdd) {
        const res = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}/members/${m.discord_user_id}/roles/${roleId}`, {
          method: 'PUT',
        })
        if (!res.ok) throw new Error(`PUT role ${roleId} for ${m.discord_user_id}: ${res.status}`)
      }
      updated++
    } catch (err) {
      console.error(`Failed to sync roles for ${m.openfront_id} (${m.discord_user_id}):`, err)
      failed++
    }
  }

  console.log(JSON.stringify({ checked, skippedNoDiscordId, updated, unchanged, failed }, null, 2))
}

main().catch((err) => {
  console.error('discord-role-sync failed:', err)
  process.exitCode = 1
})
