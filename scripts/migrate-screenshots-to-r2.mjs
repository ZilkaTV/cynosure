#!/usr/bin/env node
// One-off: copies the event screenshots that live in Supabase Storage into R2 (through the Worker) and rewrites
// cyn_event_submissions.screenshot_url to the new /api/screenshots/... address. Safe to run again (already moved rows
// no longer point at Supabase). Needs HOT_API_SECRET.
import { usersDb, usersDbEnabled } from './lib/usersdb.mjs'

const BASE = process.env.HOT_API_BASE || 'https://cynosure.xa9087dwbu5631opu09x357q2.workers.dev'
if (!usersDbEnabled()) {
  console.error('HOT_API_SECRET missing')
  process.exit(1)
}

const { data: rows, error } = await usersDb.from('cyn_event_submissions').select('id, screenshot_url')
if (error) throw error
let moved = 0
let skipped = 0
let failed = 0
for (const row of rows ?? []) {
  const m = /\/storage\/v1\/object\/public\/event-screenshots\/(.+)$/.exec(row.screenshot_url ?? '')
  if (!m) {
    skipped++
    continue
  }
  try {
    const res = await fetch(row.screenshot_url)
    if (!res.ok) throw new Error(`download ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const key = decodeURIComponent(m[1]).replace(/\.jpeg$/i, '.jpg').replace(/[^A-Za-z0-9_./-]/g, '_').toLowerCase().replace(/\.(png|jpg|webp|gif)$/, (e) => e)
    const put = await fetch(`${BASE}/api/internal/users/screenshot?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${process.env.HOT_API_SECRET}` },
      body: bytes,
    })
    if (!put.ok) throw new Error(`upload ${put.status} ${await put.text()}`)
    const { url } = await put.json()
    const upd = await usersDb.from('cyn_event_submissions').update({ screenshot_url: url }).eq('id', row.id)
    if (upd.error) throw upd.error
    moved++
    console.log(`moved ${row.id} -> ${url}`)
  } catch (err) {
    failed++
    console.error(`failed ${row.id}:`, err.message ?? err)
  }
}
console.log(JSON.stringify({ moved, skipped, failed }))
process.exit(failed ? 1 : 0)
