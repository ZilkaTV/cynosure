#!/usr/bin/env node
// Makes the D1 game lists a superset of Supabase's cyn_member_games_cache: for every member the games
// of both are unioned by gameId (D1's version wins on conflicts) and written back to D1 when that
// adds anything. Safe to re-run; never removes a game. Used once at the Supabase -> D1 cutover.
import { createClient } from '@supabase/supabase-js'
import { hotEnabled, hotListMemberDigests, hotGetMemberGames, hotPutMemberGames, computeDigest } from './lib/hotstore.mjs'

async function main() {
  if (!hotEnabled()) throw new Error('HOT_API_SECRET (or Cloudflare REST env) missing')
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const d1 = new Map((await hotListMemberDigests()).map((r) => [r.openfront_id, r.game_count]))
  const { data: ids, error } = await supabase.from('cyn_member_games_cache').select('openfront_id').order('openfront_id')
  if (error) throw error
  let changed = 0
  for (let i = 0; i < ids.length; i += 10) {
    const part = ids.slice(i, i + 10).map((r) => r.openfront_id)
    const { data, error: err } = await supabase.from('cyn_member_games_cache').select('openfront_id, games').in('openfront_id', part)
    if (err) throw err
    for (const row of data) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(row.openfront_id)) continue
      const have = d1.has(row.openfront_id) ? (await hotGetMemberGames(row.openfront_id)) ?? [] : []
      const byId = new Map(row.games.map((g) => [g.gameId, g]))
      for (const g of have) byId.set(g.gameId, g)
      if (byId.size > have.length) {
        const merged = [...byId.values()]
        await hotPutMemberGames(row.openfront_id, merged, computeDigest(merged, 'CYN'))
        changed++
        console.log(`${row.openfront_id}: ${have.length} -> ${merged.length}`)
      }
    }
  }
  console.log(`members updated: ${changed}`)
}

main().catch((e) => {
  console.error('reconcile failed:', e)
  process.exitCode = 1
})
