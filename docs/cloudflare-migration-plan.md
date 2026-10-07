# Plan: move Cynosure's data from Supabase to Cloudflare (D1 + R2 + Worker API)

Status: plan only, nothing is switched. Written 2026-10-07 after Supabase restricted the free project for egress.

## Why
- Supabase Free: 5 GB egress / month, hard lock for the rest of the billing cycle when exceeded (happened 2026-10-07, 17 GB used).
- Cloudflare free limits reset daily (00:00 UTC). Traffic is tiny: ~1.8k Worker invocations / 24 h vs a 100k limit.
- D1 free: 5 GB storage, 5 M rows read / day, 100 k rows written / day. Our data is ~15 MB (cyn_member_games_cache 12.6 MB).
- R2 free: 10 GB, no egress fees (event screenshots; today ~22 MB in Supabase Storage).

## Scope (measured)
- 30 tables, 120 RLS policies, 20 source files talk to Supabase directly.
- Direct table access from the browser: cyn_kudos (reactions), cyn_supporters, cyn_speedruns, cyn_members, cyn_member_snapshots,
  cyn_event_admins, cyn_chat_moderators, cyn_xp, cyn_survey_responses, cyn_site_visits, cyn_member_games_cache, cyn_game_nights,
  cyn_event_submissions, cyn_bumps, cyn_quest_claims, cyn_metrics_daily, cyn_game_tile_stats, cyn_game_night_rsvps,
  cyn_game_detail_cache, cyn_roster_cache, cyn_member_discord_status, cyn_inner_circle, cyn_event_teams, cyn_clan_score_ledger,
  cyn_chat_message_counts.
- Supabase features in use: Auth (Discord OAuth, 80 monthly users), Storage (event screenshots), Realtime (reactions / game nights cross-tab; mostly BroadcastChannel already), RLS everywhere, security-definer helpers.
- GitHub Actions scripts (scripts/*.mjs) write with the anon/secret key.

## Target architecture
- D1 database `cynosure` with the same table names (SQLite types: jsonb -> TEXT JSON, timestamptz -> ISO TEXT).
- One Worker API (`/api/db/...`) replacing `supabase.from(...)`: each endpoint enforces what RLS enforced (own rows only, inner circle, admin, public read).
- Auth: Discord OAuth done in the Worker (worker/discord-auth.js already handles the callback), session = signed HttpOnly cookie (JWT, HS256, secret in Worker secret). Identity = Discord user id (stable), so user_id maps 1:1 from Supabase `provider_id`.
- Scripts (GitHub Actions) talk to the Worker with a shared secret, or to D1 through the Cloudflare API with a scoped token.
- Screenshots: R2 bucket, upload through Worker (size/type checks as today).
- Realtime: drop; keep BroadcastChannel + polling (30 s) for reactions / game nights.

## Steps (each independently shippable)
1. Export: dump all tables from Supabase to JSON/CSV (needs working Supabase; do it while Pro is active). Export storage objects.
2. Create D1 + schema translation + import script. Verify row counts and spot-check the 12 MB games table.
3. Read-only API first: roster, member-games, game-detail, clan-ledger, clan-members read from D1 (already behind the Worker). Switch the GitHub scripts' writes (refresh-details, collect-metrics, ledger, role sync, sync-clan-members) to D1. Frontend stays on Supabase for logins/writes meanwhile.
4. Auth: Discord login in the Worker + session cookie; map existing members by discord_user_id (cyn_members.discord_user_id, already stored). Users must log in once more.
5. Move the frontend writes one feature at a time (registration, reactions, game nights, quests, speedrun, events, survey, bumps, supporters) behind Worker endpoints; delete the Supabase client from each file when done.
6. Storage -> R2. Remove Realtime usage.
7. Cut over, keep Supabase read-only for a week, then delete the project / cancel Pro.

## Risks
- Authorization rules were implemented as RLS; every endpoint must reproduce them (the 2026-10 security audit notes are the checklist).
- One-time re-login for all members.
- Worker free CPU is 10 ms: never JSON.parse the big games rows in the Worker, pass them through as text.
- D1 has no jsonb functions of Postgres (the digest view would be done in the script instead).

## Effort
Roughly 3-5 working days in focused sessions; steps 1-3 (read path + scripts) remove all Supabase egress by themselves and can ship first.
