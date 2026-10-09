#!/usr/bin/env node
// Copies the user-data tables from Supabase into the D1 database "cynosure" through the Worker's internal API.
// Safe to run again (INSERT OR REPLACE). Needs: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HOT_API_SECRET.
// Prints row counts per table at the end and fails if any table differs, so a clean run is also the verification.
const URL_ = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.HOT_API_SECRET
const BASE = process.env.HOT_API_BASE || 'https://cynosure.xa9087dwbu5631opu09x357q2.workers.dev'
if (!URL_ || !KEY || !SECRET) {
  console.error('missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / HOT_API_SECRET')
  process.exit(1)
}

// Order does not matter (no foreign keys in D1). Tables already in the hot D1 database are not copied.
const TABLES = [
  'cyn_members', 'cyn_speedruns', 'cyn_bumps', 'cyn_event_admins', 'cyn_event_teams', 'cyn_event_submissions', 'cyn_xp',
  'cyn_quest_claims', 'cyn_game_tile_stats', 'cyn_help_conversations', 'cyn_help_messages', 'cyn_help_rate_limit',
  'cyn_member_snapshots', 'cyn_chat_moderators', 'cyn_clan_chat_messages', 'cyn_chat_message_counts', 'cyn_supporters',
  'cyn_inner_circle', 'cyn_metrics_daily', 'cyn_metrics_channel_state', 'cyn_site_visits', 'cyn_survey_responses', 'cyn_kudos',
  'cyn_game_nights', 'cyn_game_night_rsvps', 'cyn_member_discord_status',
]
const PAGE = 1000
const CHUNK = 100

const sb = (path, extra = {}) => fetch(`${URL_}${path}`, { ...extra, headers: { apikey: KEY, ...(extra.headers ?? {}) } })
const worker = (path, init = {}) => fetch(`${BASE}/api/internal/users/${path}`, { ...init, headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' } })

async function pushRows(table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await worker(`import?table=${table}`, { method: 'POST', body: JSON.stringify(rows.slice(i, i + CHUNK)) })
    if (!res.ok) throw new Error(`import ${table} failed: ${res.status} ${await res.text()}`)
  }
}

// Auth users, reduced to the Discord id - emails and tokens are not copied. Loaded first: the old Supabase user
// ids (uuid) in the user_id columns are rewritten to Discord ids, which is the identity of the new sessions.
const expected = {}
const uuidToDiscord = new Map()
{
  const users = []
  let body0 = null
  for (let page = 1; ; page++) {
    const res = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`)
    if (!res.ok) throw new Error(`read auth users failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const body = await res.json()
    const list = body.users ?? []
    if (!body0) body0 = list[0]
    for (const u of list) {
      const discord = (u.identities ?? []).find((i) => i.provider === 'discord')
      const meta = u.user_metadata ?? {}
      const row = {
        id: u.id,
        discord_user_id: String(discord?.identity_data?.provider_id ?? discord?.identity_data?.sub ?? discord?.provider_id ?? meta.provider_id ?? meta.sub ?? '') || null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }
      users.push(row)
      if (row.discord_user_id) uuidToDiscord.set(row.id, row.discord_user_id)
    }
    if (list.length < 200) break
  }
  await pushRows('auth_users', users)
  expected.auth_users = users.length
  console.log(`auth_users: ${users.length} rows (${users.filter((u) => u.discord_user_id).length} with a Discord id)`)
}

// Columns that held a Supabase auth user id.
const USER_ID_COLUMNS = {
  cyn_members: ['user_id'],
  cyn_event_admins: ['user_id'],
  cyn_chat_moderators: ['user_id'],
  cyn_clan_chat_messages: ['author_user_id'],
  cyn_survey_responses: ['user_id'],
}
let unmapped = 0
function convertRow(table, row) {
  for (const col of USER_ID_COLUMNS[table] ?? []) {
    if (row[col] == null) continue
    const mapped = uuidToDiscord.get(row[col])
    if (!mapped) unmapped++
    row[col] = mapped ?? null
  }
  if (table === 'cyn_members' && row.user_id) row.discord_user_id = row.user_id
  return row
}

for (const table of TABLES) {
  let from = 0
  let total = 0
  for (;;) {
    const res = await sb(`/rest/v1/${table}?select=*`, { headers: { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } })
    if (!res.ok) throw new Error(`read ${table} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const rows = await res.json()
    if (rows.length) await pushRows(table, rows.map((r) => convertRow(table, r)))
    total += rows.length
    if (rows.length < PAGE) break
    from += PAGE
  }
  expected[table] = total
  console.log(`${table}: ${total} rows`)
}

if (unmapped) console.log(`note: ${unmapped} user_id value(s) had no Discord id and were cleared`)

const counts = await (await worker('counts')).json()
let bad = 0
for (const [t, n] of Object.entries(expected)) {
  if (counts[t] !== n) {
    bad++
    console.error(`MISMATCH ${t}: supabase ${n}, d1 ${counts[t]}`)
  }
}
console.log(bad ? `${bad} table(s) differ` : 'all row counts match')
process.exit(bad ? 1 : 0)
