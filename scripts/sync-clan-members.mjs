#!/usr/bin/env node
// Keeps cyn_members in step with OpenFront's own clan list, so every member of
// the clan shows up on the site - registered here or not.
//
//   * clan member without a cyn_members row  -> inserted (user_id null, i.e. "not
//     registered"; claimed = false is set by the table's trigger)
//   * unregistered row whose name changed     -> name updated
//   * unregistered row whose player left the clan -> deleted (never touches a
//     registered member's row)
//
// Registering later just claims the row (supabase/schema.sql, block K). Runs with
// the service role key from .github/workflows/discord-role-sync.yml.
import { createClient } from '@supabase/supabase-js'

const CLAN_TAG = 'CYN'
const PAGE_SIZE = 50
const MIN_PLAUSIBLE_CLAN_SIZE = 20 // safety net against deleting rows after a partial/failed read

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'CynosureClanSite (cynclan.com)' }, signal: AbortSignal.timeout(20000) })
    if (res.status === 429) {
      await sleep(((Number(res.headers.get('retry-after')) || 30) + 2) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res.json()
  }
  throw new Error(`rate limited too long: ${url}`)
}

/** "Name.1234" -> "Name": OpenFront appends a numeric suffix to non-verified account names. */
const displayName = (username, id) => (username ?? '').replace(/\.\d{3,4}$/, '').trim() || id

async function fetchClanMembers() {
  const members = []
  let total = 0
  for (let page = 1; page <= 10; page++) {
    const body = await getJson(`https://api.openfront.io/public/clan/${CLAN_TAG}/members?limit=${PAGE_SIZE}&page=${page}`)
    total = Number(body.total) || total
    for (const m of body.results ?? []) if (m?.publicId) members.push({ id: m.publicId, name: displayName(m.username, m.publicId) })
    if ((body.results ?? []).length < PAGE_SIZE || members.length >= total) break
    await sleep(1500)
  }
  return { members, total }
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(JSON.stringify({ error: 'missing_config' }))
    process.exitCode = 1
    return
  }
  const admin = createClient(url, key)

  // Bail out cleanly if SQL block K has not been applied yet.
  const probe = await admin.from('cyn_members').select('claimed').limit(1)
  if (probe.error) {
    console.error(JSON.stringify({ skipped: 'column cyn_members.claimed missing - run SQL block K first', detail: probe.error.message }))
    return
  }

  const { members: clan, total } = await fetchClanMembers()
  const complete = clan.length > 0 && clan.length === total
  const { data: rows, error } = await admin.from('cyn_members').select('openfront_id, in_game_name, claimed')
  if (error) throw error
  const byId = new Map((rows ?? []).map((r) => [r.openfront_id, r]))
  const clanIds = new Set(clan.map((m) => m.id))

  const toInsert = clan.filter((m) => !byId.has(m.id)).map((m) => ({ openfront_id: m.id, in_game_name: m.name, timezone: '-' }))
  let inserted = 0
  if (toInsert.length > 0) {
    const { error: insErr } = await admin.from('cyn_members').insert(toInsert)
    if (insErr) throw insErr
    inserted = toInsert.length
  }

  let renamed = 0
  for (const m of clan) {
    const row = byId.get(m.id)
    if (row && row.claimed === false && row.in_game_name !== m.name) {
      const { error: upErr } = await admin.from('cyn_members').update({ in_game_name: m.name }).eq('openfront_id', m.id).eq('claimed', false)
      if (!upErr) renamed++
    }
  }

  let removed = 0
  if (complete && clan.length >= MIN_PLAUSIBLE_CLAN_SIZE) {
    const gone = (rows ?? []).filter((r) => r.claimed === false && !clanIds.has(r.openfront_id)).map((r) => r.openfront_id)
    if (gone.length > 0) {
      const { error: delErr } = await admin.from('cyn_members').delete().in('openfront_id', gone).eq('claimed', false)
      if (!delErr) removed = gone.length
    }
  }

  console.log(JSON.stringify({ clanMembers: clan.length, total, inserted, renamed, removed, registeredRows: (rows ?? []).filter((r) => r.claimed !== false).length }))
}

main().catch((err) => {
  console.error('sync-clan-members failed:', err)
  process.exitCode = 1
})
