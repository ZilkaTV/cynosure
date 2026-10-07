# Capacity analysis (2026-10-07)

Where each free-tier budget stands after moving the big, script-written data from Supabase to Cloudflare D1.

## What lives where now
| Data | Store | Written by | Read by |
|---|---|---|---|
| Member game lists (12 MB, 115 rows) | D1 `member_games` (Supabase table = best-effort mirror) | refresh-details | Worker `/api/member-games`, ledger, role sync, backfill |
| Game details (4.9k rows, ~85 MB) | D1 `game_detail` (mirror in Supabase) | refresh-details | Worker `/api/game-detail`, ledger, role sync |
| Roster + ledger documents | D1 `blobs` | refresh-details, compute-clan-score-ledger | Worker `/api/roster`, `/api/clan-ledger` |
| Everything user-written (members, reactions, quests, events, speedruns, ...) | Supabase | the site | the site |

## Budgets
**Supabase Free (5.5 GB egress / month, 1 GB logs):** the 12.6 MB games table was read 4x per 10 minutes (~700 MB/day). Now only small tables are read by scripts/browsers. Expected: tens of MB per day. Verify in Dashboard -> Usage on 2026-10-09 and 2026-10-12 (target < 170 MB/day).

**Cloudflare Workers Free (100k requests/day):** 1.8k invocations in the last 24 h (2%). Internal API calls from GitHub Actions count as requests: ~150/tick x 144 = up to ~20k/day at the worst - the scan only calls the API when a member has new games (digests = 1 call per tick). Typically a few thousand/day.

**Cloudflare KV Free (100k reads, 1k writes/day):** no longer used by the hot paths in D1 mode (member games, game details, roster, ledger all come from D1). The old 100k reads/day came from /api/game-detail doing up to 200 KV reads per request on every edge-cache miss.

**D1 Free (5M rows read, 100k rows written, 5 GB):**
- reads/day: scan list of detail ids 4.9k x 144 = 0.7M, digests 115 x 144 = 17k, hourly jobs ~10k, Worker serving ~50k -> about 1M (20% of the limit).
- writes/day: only changed members/details + 2 blobs per run -> a few thousand.
- size: ~100 MB (2%), grows ~1 MB/day.

## Remaining risks
- Large D1 query results are cut near 1.5 MB (observed); every reader batches <= 1 MB (worker/hotStore.js).
- Workers Free CPU limit is 10 ms: values are passed through as text, never parsed (except the 100 KB ledger).
- Supabase is still the home of Auth + user-written tables; its free limits can still be reached by heavy browser use (reactions, snapshots/trends). See docs/cloudflare-migration-plan.md for the remaining move.
- Junk row: `cyn_members` still holds a duplicate registration whose id is a pasted profile URL (one_skif), which makes the scan log one failed member per run. SQL fix: `delete from public.cyn_members where openfront_id like 'http%';`
