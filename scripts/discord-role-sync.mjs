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

// Drives the "Metrics" admin dashboard's visibility gate (see
// src/lib/metrics.ts's useIsInnerCircle()) - mirrored into cyn_inner_circle
// below purely as a byproduct of the per-member roles fetch this script
// already does for the wins/games roles, no extra Discord call needed.
const INNER_CIRCLE_ROLE_ID = '1367284321270108280'

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

// "Flash of Cyn" - single role for the clan's all-time fastest verified
// speedrun (see src/lib/speedruns.ts / cyn_speedruns). Held by exactly one
// member, swapped the moment someone's PB beats the current holder's time.
// Checked every run of this script (30-minute cadence, same as everything
// else here) - a speedrun submission happens straight from the member's own
// browser to Supabase (submitSpeedrun in src/lib/speedruns.ts), so there's
// no server-side hook to react to instantly; catching up within half an
// hour is as close to "automatic" as this architecture gets without adding
// a whole new webhook/trigger path.
const SPEEDRUN_ROLE_ID = '1549681103642820648'

// "Hero of Cyn" (most Team-game points last calendar month) and "Master of
// Cyn" (most FFA-game points last calendar month) - reassigned once, only on
// the 1st of the month (see isFirstOfMonthUtc below), covering the month
// that just ended. Unlike every other role here, no announcement is posted
// for these two - the admin writes that manually (with images).
const HERO_ROLE_ID = '1549681207514763264'
const MASTER_ROLE_ID = '1549681153106120764'

// Posted to when a NEW Flash of Cyn is crowned (see below).
const INNER_CIRCLE_CHANNEL_ID = '1367289070564151510'
// Pinged at the bottom of that announcement so the whole clan sees the
// challenge, not just whoever happens to already be in the channel.
const CLAN_PING_ROLE_ID = '1367283915936763944'

// Duplicated from fmtTime in src/lib/speedruns.ts - same reasoning as every
// other small duplicated helper in this script (can't import from src/).
function fmtSpeedrunTime(seconds) {
  const m = Math.floor(seconds / 60)
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

// ── monthly points (Hero of Cyn / Master of Cyn) ────────────────────────────
// Duplicated from ffaBucket/teamBucket/isTeam/isFfa/isVictory/isDefeat/
// monthKeyOf in src/lib/stats.ts - same reasoning as everywhere else in this
// script (can't import from src/). Only the points total is needed here
// (not wins/losses/winstreak/etc), so this is the trimmed-down version.
const isTeam = (g) => g.mode === 'Team' && g.rankedType !== '2v2'
const isFfa = (g) => g.mode === 'Free For All' && g.rankedType !== '1v1'
const isVictory = (g) => g.result === 'victory'
const isDefeat = (g) => g.result === 'defeat'
const monthKeyOf = (iso) => iso.slice(0, 7)

function prevMonthKeyUtc() {
  const d = new Date()
  d.setUTCDate(1) // avoid month-length overflow (e.g. Aug 31 -> "Sep 31")
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function ffaPoints(games, monthKey) {
  const decided = games
    .filter((g) => isFfa(g) && monthKeyOf(g.start) === monthKey && (isVictory(g) || isDefeat(g)))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let points = 0
  let run = 0
  const flush = () => {
    if (run > 0) points += run >= 2 ? run * 2 : 1
    run = 0
  }
  for (const g of decided) {
    if (isVictory(g)) run++
    else flush()
  }
  flush()
  return points
}

function teamPoints(games, monthKey, coopByGame) {
  let points = 0
  for (const g of games) {
    if (isTeam(g) && monthKeyOf(g.start) === monthKey && isVictory(g)) {
      points += coopByGame[g.gameId] ? 2 : 1
    }
  }
  return points
}

const SUPABASE_PAGE_SIZE = 1000

/**
 * A plain `.select(...)` with no `.range()`/`.limit()` silently caps out at
 * Supabase's own default page size (1000 rows) - confirmed live as the
 * actual cause of "wins-tier roles never update": cyn_member_snapshots grew
 * past 1000 rows, and whichever rows fell outside that first page (often a
 * member's own most recent, highest snapshot) were invisibly dropped, so
 * this script kept computing several members' current wins as lower than
 * they really are. Pages through every row instead of assuming the table
 * still fits in one request - this table only ever grows (a new row per
 * member per day, forever), so a fixed row cap was always going to break
 * again eventually even at a higher limit.
 */
async function fetchAllRows(supabase, table, columns) {
  const rows = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < SUPABASE_PAGE_SIZE) break
  }
  return rows
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

async function postMessage(botToken, channelId, content) {
  const res = await discordFetch(botToken, `/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`POST message to ${channelId}: ${res.status}`)
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
  const membersByOpenfrontId = new Map((members ?? []).map((m) => [m.openfront_id, m]))
  // Filled in during the per-member loop below (currentRoles is already
  // fetched there for the wins-tier sync) - reused after the loop by the
  // Flash/Hero/Master of Cyn sections so they don't need their own
  // redundant per-member Discord fetch.
  const rolesByMember = new Map()

  // Wins were made monotonic (never decrease day to day - see
  // refresh-details.mjs's own priorMaxWinsByMember clamp), so the max
  // all_wins ever recorded for a member IS their current wins - no need to
  // re-scan OpenFront directly here.
  const snapshotRows = await fetchAllRows(supabase, 'cyn_member_snapshots', 'openfront_id, all_wins')
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
      rolesByMember.set(m.openfront_id, currentRoles)

      // Isolated in its own try/catch - a cyn_inner_circle write failure
      // (e.g. a missing RLS policy, confirmed to happen live once already)
      // must never abort the wins-tier/games-role sync below for this
      // member just because the unrelated Metrics-dashboard gating flag
      // couldn't be updated this run.
      const wantsInnerCircle = currentRoles.has(INNER_CIRCLE_ROLE_ID)
      try {
        if (wantsInnerCircle) {
          const { error: innerCircleError } = await supabase
            .from('cyn_inner_circle')
            .upsert({ openfront_id: m.openfront_id }, { onConflict: 'openfront_id' })
          if (innerCircleError) throw new Error(`cyn_inner_circle upsert for ${m.openfront_id}: ${innerCircleError.message}`)
        } else {
          const { error: innerCircleError } = await supabase.from('cyn_inner_circle').delete().eq('openfront_id', m.openfront_id)
          if (innerCircleError) throw new Error(`cyn_inner_circle delete for ${m.openfront_id}: ${innerCircleError.message}`)
        }
      } catch (innerCircleErr) {
        console.error(`cyn_inner_circle sync failed for ${m.openfront_id} (non-fatal):`, innerCircleErr)
      }

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

  // Removes roleId from anyone in rolesByMember who currently holds it but
  // isn't in winnerIds, then adds it to anyone in winnerIds who doesn't have
  // it yet. Shared by the Hero/Master-of-Cyn monthly reassignment below -
  // pulled out since both need the identical add/remove dance.
  async function reassignRole(roleId, winnerIds) {
    for (const [openfrontId, roles] of rolesByMember) {
      const discordId = membersByOpenfrontId.get(openfrontId)?.discord_user_id
      if (!discordId) continue
      const has = roles.has(roleId)
      const should = winnerIds.has(openfrontId)
      if (has && !should) {
        const res = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`, { method: 'DELETE' })
        if (res.ok || res.status === 404) roles.delete(roleId)
      } else if (!has && should) {
        const res = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`, { method: 'PUT' })
        if (res.ok) roles.add(roleId)
      }
    }
  }

  // ── Flash of Cyn (fastest verified speedrun) ──────────────────────────────
  // Isolated in its own try/catch - a failure here (e.g. cyn_speedruns
  // temporarily unreachable) must never abort the wins-tier sync above,
  // which has already completed successfully by this point.
  try {
    const { data: speedrunRows } = await supabase.from('cyn_speedruns').select('openfront_id, seconds, submitted_at')
    let fastest = null
    for (const row of speedrunRows ?? []) {
      // Ties go to whoever set that time FIRST (earliest submitted_at) -
      // matching normal speedrunning convention that a tying run doesn't
      // "beat" the existing record.
      if (!fastest || row.seconds < fastest.seconds || (row.seconds === fastest.seconds && row.submitted_at < fastest.submitted_at)) {
        fastest = row
      }
    }
    const newHolderDiscordId = fastest ? (membersByOpenfrontId.get(fastest.openfront_id)?.discord_user_id ?? null) : null
    const alreadyHolds = fastest ? (rolesByMember.get(fastest.openfront_id)?.has(SPEEDRUN_ROLE_ID) ?? false) : true
    if (fastest && newHolderDiscordId && !alreadyHolds) {
      let previousHolderDiscordId = null
      for (const [openfrontId, roles] of rolesByMember) {
        if (openfrontId === fastest.openfront_id || !roles.has(SPEEDRUN_ROLE_ID)) continue
        previousHolderDiscordId = membersByOpenfrontId.get(openfrontId)?.discord_user_id ?? previousHolderDiscordId
      }
      await reassignRole(SPEEDRUN_ROLE_ID, new Set([fastest.openfront_id]))
      if (rolesByMember.get(fastest.openfront_id)?.has(SPEEDRUN_ROLE_ID)) {
        const timeStr = fmtSpeedrunTime(fastest.seconds)
        const content = previousHolderDiscordId
          ? `<@${previousHolderDiscordId}> has been overtaken in the speedrun!\nThe new title of **Flash of Cyn** goes to <@${newHolderDiscordId}> with a new speed time of **${timeStr}**!!\n\nCan you beat that? cynclan.com\n<@&${CLAN_PING_ROLE_ID}>`
          : `<@${newHolderDiscordId}> claims the first-ever title of **Flash of Cyn** with a speed time of **${timeStr}**!!\n\nCan you beat that? cynclan.com\n<@&${CLAN_PING_ROLE_ID}>`
        await postMessage(botToken, INNER_CIRCLE_CHANNEL_ID, content)
      }
    }
  } catch (err) {
    console.error('Flash of Cyn speedrun-role sync failed (non-fatal):', err)
  }

  // ── Hero of Cyn / Master of Cyn (last month's Team / FFA points leader) ──
  // Only on the 1st of the month (UTC) - see HERO_ROLE_ID/MASTER_ROLE_ID.
  if (new Date().getUTCDate() === 1) {
    try {
      const targetMonth = prevMonthKeyUtc()
      const allGamesRows = gamesRows ?? []

      // Team-win games in the target month, across every member - detail
      // (players list) needed to know if another CYN player shared the win
      // (worth 2 points instead of 1, same rule as teamBucket in
      // src/lib/stats.ts). These are the SAME games refresh-details.mjs
      // already queues for detail-fetch unconditionally the moment they're
      // seen as a team win, so by the 1st of the following month they
      // should already be cached in cyn_game_detail_cache.
      const teamWinGameIds = new Set()
      for (const row of allGamesRows) {
        for (const g of row.games ?? []) {
          if (g.clanTag === CLAN_TAG && g.type !== 'Singleplayer' && isTeam(g) && isVictory(g) && monthKeyOf(g.start) === targetMonth) {
            teamWinGameIds.add(g.gameId)
          }
        }
      }
      const coopByGame = {}
      if (teamWinGameIds.size > 0) {
        const { data: detailRows } = await supabase
          .from('cyn_game_detail_cache')
          .select('game_id, detail')
          .in('game_id', [...teamWinGameIds])
        for (const row of detailRows ?? []) {
          coopByGame[row.game_id] = (row.detail?.players ?? []).filter((p) => p.clanTag === CLAN_TAG).length >= 2
        }
      }

      const heroPointsByMember = new Map()
      const masterPointsByMember = new Map()
      for (const row of allGamesRows) {
        const cynGames = (row.games ?? []).filter((g) => g.clanTag === CLAN_TAG && g.type !== 'Singleplayer')
        heroPointsByMember.set(row.openfront_id, teamPoints(cynGames, targetMonth, coopByGame))
        masterPointsByMember.set(row.openfront_id, ffaPoints(cynGames, targetMonth))
      }

      // Nobody gets crowned off zero points (nothing played that mode last
      // month) - reassignRole just clears the role from whoever had it.
      const heroMax = Math.max(0, ...heroPointsByMember.values())
      const heroWinners = new Set(heroMax > 0 ? [...heroPointsByMember].filter(([, p]) => p === heroMax).map(([id]) => id) : [])
      await reassignRole(HERO_ROLE_ID, heroWinners)

      const masterMax = Math.max(0, ...masterPointsByMember.values())
      const masterWinners = new Set(masterMax > 0 ? [...masterPointsByMember].filter(([, p]) => p === masterMax).map(([id]) => id) : [])
      await reassignRole(MASTER_ROLE_ID, masterWinners)
    } catch (err) {
      console.error('Hero/Master of Cyn monthly reassignment failed (non-fatal):', err)
    }
  }

  console.log(JSON.stringify({ checked, skippedNoDiscordId, updated, unchanged, failed }, null, 2))
}

main().catch((err) => {
  console.error('discord-role-sync failed:', err)
  process.exitCode = 1
})
