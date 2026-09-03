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
// Runs on a schedule via .github/workflows/collect-metrics.yml. Reads
// today's existing cyn_metrics_daily row and merges into it every run
// (accumulating fields add on top; snapshot fields overwrite) so a run
// that's late or occasionally skipped just means slightly coarser numbers,
// never wrong ones.

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

  const { data: existing } = await supabase.from('cyn_metrics_daily').select('*').eq('day', today).maybeSingle()
  const vcActiveIds = new Set(existing?.vc_active_member_ids ?? [])
  let vcTotalMinutes = existing?.vc_total_minutes ?? 0
  let publicMessages = existing?.public_messages ?? 0
  let privateMessages = existing?.private_messages ?? 0

  const { memberCount, presenceCount } = await fetchGuildCounts(botToken)

  const vcNow = await fetchVoiceMemberIds()
  for (const id of vcNow) vcActiveIds.add(id)
  vcTotalMinutes += vcNow.length * POLL_INTERVAL_MINUTES

  for (const [kind, ids] of [['public', channels.public ?? []], ['private', channels.private ?? []]]) {
    for (const channelId of ids) {
      const { data: state } = await supabase
        .from('cyn_metrics_channel_state')
        .select('last_message_id')
        .eq('channel_id', channelId)
        .maybeSingle()
      const { count, newestId } = await countNewMessages(botToken, channelId, state?.last_message_id ?? null)
      if (kind === 'public') publicMessages += count
      else privateMessages += count
      if (newestId) {
        await supabase.from('cyn_metrics_channel_state').upsert({ channel_id: channelId, last_message_id: newestId }, { onConflict: 'channel_id' })
      }
    }
  }

  const discordJoinsToday = await fetchJoinsToday(botToken, today)

  const todayStart = `${today}T00:00:00.000Z`
  const { count: clanRegistrationsToday } = await supabase
    .from('cyn_members')
    .select('openfront_id', { count: 'exact', head: true })
    .gte('created_at', todayStart)

  const { error } = await supabase.from('cyn_metrics_daily').upsert(
    {
      day: today,
      member_count: memberCount,
      presence_count: presenceCount,
      vc_active_member_ids: [...vcActiveIds],
      vc_total_minutes: vcTotalMinutes,
      public_messages: publicMessages,
      private_messages: privateMessages,
      discord_joins_today: discordJoinsToday,
      clan_registrations_today: clanRegistrationsToday ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'day' },
  )
  if (error) throw error

  console.log(
    JSON.stringify(
      {
        day: today,
        memberCount,
        presenceCount,
        vcActiveToday: vcActiveIds.size,
        vcTotalMinutes,
        publicMessages,
        privateMessages,
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
