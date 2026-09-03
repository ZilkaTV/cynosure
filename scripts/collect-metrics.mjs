#!/usr/bin/env node
// Feeds the "Metrics" admin dashboard (src/pages/Metrics.tsx, gated by
// useIsInnerCircle() in src/lib/metrics.ts). Every metric here is an
// APPROXIMATION built from periodic REST polling on the existing 10-minute
// Cloudflare Cron Trigger (see worker/index.js's scheduled() dispatching
// event_type: 'collect-metrics' alongside the existing 'refresh-details'
// one) - the user explicitly chose this over standing up a paid, always-on
// Discord Gateway bot (same choice already made for VC-hour tracking,
// applied here to message counts too).
//
// Runs on a schedule via .github/workflows/collect-metrics.yml. Only ever
// sends THIS poll's deltas (new VC member ids seen, minutes/messages since
// last run) - the actual merge into today's row happens server-side via
// the cyn_upsert_metrics_daily/cyn_upsert_metrics_channel_state RPC
// functions (see supabase/schema.sql), which run as security definer to
// bypass RLS. A plain client-side upsert can't do this merge itself:
// cyn_metrics_daily/cyn_metrics_channel_state are deliberately not
// publicly readable (the whole point of gating "Metrics" to inner-circle
// members), and Postgres's INSERT ... ON CONFLICT DO UPDATE requires a
// SELECT policy to even detect the conflict, which the anon-key cron
// doesn't have here - confirmed directly, a plain .upsert() failed with
// "violates row-level security policy" purely from that conflict check.

import { createClient } from '@supabase/supabase-js'

const DISCORD_GUILD_ID = '1367283444823883776' // same value as DISCORD_GUILD_ID in src/config.ts
const POLL_INTERVAL_MINUTES = 10 // matches this workflow's own cron cadence

const RATE_LIMIT_RETRIES = 4
const RATE_LIMIT_BASE_DELAY_MS = 500

/** A Discord REST call, retried with backoff on 429 - same shape as discordFetch in discord-role-sync.mjs. */
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

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10)
}

async function fetchGuildCounts(botToken) {
  const res = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}?with_counts=true`)
  if (!res.ok) throw new Error(`GET guild: ${res.status}`)
  const data = await res.json()
  return { memberCount: data.approximate_member_count ?? null, presenceCount: data.approximate_presence_count ?? null }
}

/** Public widget.json, no auth needed - same endpoint src/components/DiscordWidget.tsx already uses. */
async function fetchVoiceMemberIds() {
  const res = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`)
  if (!res.ok) return [] // widget can be disabled server-side - degrade to "nobody seen in VC this poll"
  const data = await res.json()
  return (data.members ?? []).filter((m) => m.channel_id).map((m) => m.id)
}

/**
 * New messages in one channel since last poll. A channel tracked for the
 * first time only seeds last_message_id (from the single newest message)
 * without counting its pre-existing history - counting a channel's entire
 * backlog the first time it's configured would wildly inflate "today"'s
 * count with messages from days/months before tracking started.
 */
async function countNewMessages(botToken, channelId, lastMessageId) {
  if (!lastMessageId) {
    const res = await discordFetch(botToken, `/channels/${channelId}/messages?limit=1`)
    if (!res.ok) throw new Error(`GET messages (seed) ${channelId}: ${res.status}`)
    const msgs = await res.json()
    return { count: 0, newestId: msgs[0]?.id ?? null }
  }

  let count = 0
  let cursor = lastMessageId
  let newestId = lastMessageId
  for (;;) {
    const res = await discordFetch(botToken, `/channels/${channelId}/messages?after=${cursor}&limit=100`)
    if (!res.ok) throw new Error(`GET messages ${channelId}: ${res.status}`)
    const msgs = await res.json()
    if (msgs.length === 0) break
    count += msgs.length
    // Response order is always newest-first regardless of the after param.
    for (const m of msgs) if (BigInt(m.id) > BigInt(newestId)) newestId = m.id
    cursor = msgs[0].id // the batch closest to "now" among what's left - keeps paginating forward
    if (msgs.length < 100) break
  }
  return { count, newestId }
}

/** Every current member's join date, paginated - needs the bot's "Server Members Intent" enabled. */
async function fetchJoinsToday(botToken, today) {
  let after = '0'
  let joinsToday = 0
  for (;;) {
    const res = await discordFetch(botToken, `/guilds/${DISCORD_GUILD_ID}/members?limit=1000&after=${after}`)
    if (!res.ok) throw new Error(`GET members: ${res.status}`)
    const page = await res.json()
    if (page.length === 0) break
    for (const m of page) {
      if (typeof m.joined_at === 'string' && m.joined_at.slice(0, 10) === today) joinsToday++
    }
    after = page[page.length - 1].user?.id ?? page[page.length - 1].id
    if (page.length < 1000) break
  }
  return joinsToday
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelsJson = process.env.DISCORD_METRICS_CHANNELS
  if (!supabaseUrl || !supabaseKey || !botToken || !channelsJson) {
    console.error(JSON.stringify({ error: 'missing_config' }))
    process.exitCode = 1
    return
  }
  const channels = JSON.parse(channelsJson)
  const supabase = createClient(supabaseUrl, supabaseKey)
  const today = todayUtcDateString()

  const { memberCount, presenceCount } = await fetchGuildCounts(botToken)

  // This poll's deltas only - cyn_upsert_metrics_daily merges them into
  // today's running totals server-side.
  const vcNow = await fetchVoiceMemberIds()
  const vcMinutesDelta = vcNow.length * POLL_INTERVAL_MINUTES

  let publicMessagesDelta = 0
  let privateMessagesDelta = 0
  for (const [kind, ids] of [['public', channels.public ?? []], ['private', channels.private ?? []]]) {
    for (const channelId of ids) {
      const { data: lastMessageId, error: stateError } = await supabase.rpc('cyn_get_metrics_channel_state', {
        p_channel_id: channelId,
      })
      if (stateError) throw stateError
      const { count, newestId } = await countNewMessages(botToken, channelId, lastMessageId ?? null)
      if (kind === 'public') publicMessagesDelta += count
      else privateMessagesDelta += count
      if (newestId) {
        const { error: stateWriteError } = await supabase.rpc('cyn_upsert_metrics_channel_state', {
          p_channel_id: channelId,
          p_last_message_id: newestId,
        })
        if (stateWriteError) throw stateWriteError
      }
    }
  }

  const discordJoinsToday = await fetchJoinsToday(botToken, today)

  const todayStart = `${today}T00:00:00.000Z`
  const { count: clanRegistrationsToday } = await supabase
    .from('cyn_members')
    .select('openfront_id', { count: 'exact', head: true })
    .gte('created_at', todayStart)

  const { error: dailyError } = await supabase.rpc('cyn_upsert_metrics_daily', {
    p_day: today,
    p_member_count: memberCount,
    p_presence_count: presenceCount,
    p_new_vc_member_ids: vcNow,
    p_vc_minutes_delta: vcMinutesDelta,
    p_public_messages_delta: publicMessagesDelta,
    p_private_messages_delta: privateMessagesDelta,
    p_discord_joins_today: discordJoinsToday,
    p_clan_registrations_today: clanRegistrationsToday ?? 0,
  })
  if (dailyError) throw dailyError

  console.log(
    JSON.stringify(
      {
        day: today,
        memberCount,
        presenceCount,
        vcActiveThisPoll: vcNow.length,
        vcMinutesDelta,
        publicMessagesDelta,
        privateMessagesDelta,
        discordJoinsToday,
        clanRegistrationsToday: clanRegistrationsToday ?? 0,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('collect-metrics failed:', err)
  process.exitCode = 1
})
