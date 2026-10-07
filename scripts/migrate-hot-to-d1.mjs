#!/usr/bin/env node
// One-off / re-runnable copy of the two big Supabase tables into Cloudflare D1
// (see scripts/lib/hotstore.mjs). Safe to run again: rows are upserted, nothing is deleted.
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... \
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... D1_DATABASE_ID=... \
//   node scripts/migrate-hot-to-d1.mjs
import { createClient } from '@supabase/supabase-js'
import { hotEnabled, hotPutMemberGames, hotPutDetail, hotListDetailIds, computeDigest } from './lib/hotstore.mjs'

const CLAN_TAG = 'CYN'

async function main() {
  if (!hotEnabled()) throw new Error('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID missing')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const supabase = createClient(url, key)

  const { data: ids, error: idErr } = await supabase.from('cyn_member_games_cache').select('openfront_id').order('openfront_id')
  if (idErr) throw idErr
  let members = 0
  for (let i = 0; i < ids.length; i += 10) {
    const part = ids.slice(i, i + 10).map((r) => r.openfront_id)
    const { data, error } = await supabase.from('cyn_member_games_cache').select('openfront_id, games').in('openfront_id', part)
    if (error) throw error
    for (const row of data) {
      await hotPutMemberGames(row.openfront_id, row.games, computeDigest(row.games, CLAN_TAG))
      members++
    }
  }
  console.log(`member game lists copied: ${members}`)

  const have = new Set(await hotListDetailIds())
  let copied = 0
  const PAGE = 100
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('cyn_game_detail_cache').select('game_id, detail').order('game_id').range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data) {
      if (have.has(row.game_id)) continue
      await hotPutDetail(row.game_id, row.detail)
      copied++
    }
    if (data.length < PAGE) break
  }
  console.log(`game details copied: ${copied} (already present: ${have.size})`)
}

main().catch((e) => {
  console.error('migrate-hot-to-d1 failed:', e)
  process.exitCode = 1
})
