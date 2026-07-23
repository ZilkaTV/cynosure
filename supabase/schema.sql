-- Cynosure registration backend (OPTIONAL).
-- Run this once in the Supabase SQL Editor if you want registrations to be
-- shared across all visitors. Without it the site still works — stats come
-- straight from the OpenFront API and each visitor's own registration is
-- kept in their browser.

create table if not exists public.cyn_members (
  openfront_id text primary key,
  in_game_name text not null,
  timezone text not null,
  discord_username text,
  nationality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cyn_members add column if not exists nationality text;

alter table public.cyn_members enable row level security;

-- Anyone can read the roster (names/timezones shown in the tables).
create policy "public can read cyn_members"
  on public.cyn_members for select
  to public
  using (true);

-- To make writes safe, enable the Discord auth provider in Supabase and
-- tighten this to `to authenticated`. Left open here so the flow works before
-- Discord OAuth is wired up; harden before going public.
create policy "anyone can upsert cyn_members"
  on public.cyn_members for insert
  to public
  with check (true);

create policy "anyone can update cyn_members"
  on public.cyn_members for update
  to public
  using (true)
  with check (true);

-- Speedrun best times (Solo · Australia · No Nations). One row per member;
-- the site verifies each submission against OpenFront before upserting.
-- `attempts` counts every valid submission (not just the ones that beat the
-- current best), so the site can show "N runs submitted".
create table if not exists public.cyn_speedruns (
  openfront_id text primary key,
  game_id text not null,
  seconds integer not null,
  attempts integer not null default 1,
  submitted_at timestamptz not null default now(),
  -- Tile share at the 3:00 mark of this same best-time game (see
  -- src/lib/speedruns.ts) - not an independent category/attempt, it's a
  -- second stat read off whichever game is the current best time.
  tiles3min_percent numeric
);

-- Safe to re-run: adds the columns if this table already existed without them.
alter table public.cyn_speedruns add column if not exists attempts integer not null default 1;
alter table public.cyn_speedruns add column if not exists tiles3min_percent numeric;

alter table public.cyn_speedruns enable row level security;

create policy "public can read cyn_speedruns"
  on public.cyn_speedruns for select to public using (true);

create policy "anyone can upsert cyn_speedruns"
  on public.cyn_speedruns for insert to public with check (true);

create policy "anyone can update cyn_speedruns"
  on public.cyn_speedruns for update to public using (true) with check (true);

-- Self-reported Discord bumps. There's no bot access to the bump channel (it's
-- not our server), so members log their own bumps with a 2h cooldown enforced
-- client-side + by checking last_bump_at before accepting a new one.
create table if not exists public.cyn_bumps (
  openfront_id text primary key,
  bump_count integer not null default 0,
  last_bump_at timestamptz
);

alter table public.cyn_bumps enable row level security;

create policy "public can read cyn_bumps"
  on public.cyn_bumps for select to public using (true);

create policy "anyone can upsert cyn_bumps"
  on public.cyn_bumps for insert to public with check (true);

create policy "anyone can update cyn_bumps"
  on public.cyn_bumps for update to public using (true) with check (true);

-- ============================================================
-- Events: whitelisted admins, per-event teams, and website-based
-- submissions (game link + win-screen screenshot) that an admin
-- accepts or denies. Accepted submissions add to the team's total.
-- ============================================================

create table if not exists public.cyn_event_admins (
  discord_username text primary key,
  -- The real, stable Supabase auth user id (auth.uid()) behind this admin.
  -- RLS below is keyed on THIS, never on user_metadata: user_metadata is
  -- freely editable by the signed-in user themselves via supabase.auth.
  -- updateUser(), so checking it in a security policy would let anyone
  -- rewrite their own metadata to impersonate an admin's name and grant
  -- themselves access. auth.uid() (the "sub" claim) cannot be forged by
  -- the client, so it's the only thing that's actually safe to gate on.
  user_id uuid references auth.users(id)
);

alter table public.cyn_event_admins enable row level security;

create policy "public can read cyn_event_admins"
  on public.cyn_event_admins for select to public using (true);

-- Only an EXISTING admin (matched by their real auth user id) can
-- whitelist/remove another one.
create policy "admins can add cyn_event_admins"
  on public.cyn_event_admins for insert to authenticated with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

create policy "admins can remove cyn_event_admins"
  on public.cyn_event_admins for delete to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

-- New admin rows only carry a discord_username (typed by whoever is
-- promoting someone from the member profile page) - this trigger resolves
-- that name to the target's real auth user id automatically, the same way
-- discordDisplayName() resolves a session client-side, but by reading the
-- authoritative auth.users record server-side instead of a client-supplied
-- (and therefore spoofable) JWT claim.
create or replace function public.cyn_event_admins_fill_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select u.id into new.user_id
    from auth.users u
    where coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'preferred_username',
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'username',
      u.raw_user_meta_data -> 'custom_claims' ->> 'global_name'
    ) = new.discord_username
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cyn_event_admins_fill_user_id on public.cyn_event_admins;
create trigger trg_cyn_event_admins_fill_user_id
  before insert on public.cyn_event_admins
  for each row execute function public.cyn_event_admins_fill_user_id();

-- Seed the initial admins (edit/add rows here as needed). user_id is filled
-- in by the trigger above, provided the person has signed in at least once.
insert into public.cyn_event_admins (discord_username) values
  ('zjlka'),
  ('Kaizeron')
on conflict (discord_username) do nothing;

create table if not exists public.cyn_event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  name text not null,
  starting_points integer not null default 0,
  -- Roster display only (not linked to cyn_members - a name here doesn't
  -- have to be a registered member; the site links it if a match exists).
  captain text,
  players text[] not null default '{}',
  unique (event_id, name)
);

alter table public.cyn_event_teams enable row level security;

create policy "public can read cyn_event_teams"
  on public.cyn_event_teams for select to public using (true);

-- Only admins can create/edit teams (rosters, captains, starting points feed
-- directly into event standings) - keyed on auth.uid(), same as
-- cyn_event_admins above, never on client-editable user_metadata.
create policy "admins can insert cyn_event_teams"
  on public.cyn_event_teams for insert to authenticated with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

create policy "admins can update cyn_event_teams"
  on public.cyn_event_teams for update to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

-- Seed the CYN Trio Challenge teams with their points collected before this
-- website-based system existed (see the Discord leaderboard post).
insert into public.cyn_event_teams (event_id, name, starting_points, captain, players) values
  ('trio-challenge-2026', 'Team CYN', 59, 'kvxlyn', array['Franquito', 'soothxng']),
  ('trio-challenge-2026', 'Team GAS', 11, 'Sweeper', array['Grandma Garry', 'Grandpa Perry']),
  ('trio-challenge-2026', 'Team GER', 8, 'Chuma', array['Calos', 'Propighandi']),
  ('trio-challenge-2026', 'Team BUM', 2, 'Portatto', array['Imperium Romanum', 'Bembo'])
on conflict (event_id, name) do update set
  captain = excluded.captain,
  players = excluded.players;

create table if not exists public.cyn_event_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  team_id uuid not null references public.cyn_event_teams(id) on delete cascade,
  submitted_by text not null, -- openfront_id
  game_link text not null,
  screenshot_url text not null,
  category text not null check (category in ('public', 'scrim_3v3', 'scrim_4plus', 'tournament')),
  points integer not null check (
    (category = 'public' and points = 1) or
    (category = 'scrim_3v3' and points = 2) or
    (category = 'scrim_4plus' and points = 5) or
    (category = 'tournament' and points = 10)
  ),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'denied')),
  reviewed_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.cyn_event_submissions enable row level security;

create policy "public can read cyn_event_submissions"
  on public.cyn_event_submissions for select to public using (true);

create policy "anyone can insert cyn_event_submissions"
  on public.cyn_event_submissions for insert to public with check (true);

-- Only admins can review (accept/deny) a submission - this is the actual
-- enforcement point; the UI hides the review buttons from non-admins too,
-- but that's just presentation and was never a substitute for this.
create policy "admins can update cyn_event_submissions"
  on public.cyn_event_submissions for update to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

-- Storage bucket for win-screen screenshots.
insert into storage.buckets (id, name, public)
values ('event-screenshots', 'event-screenshots', true)
on conflict (id) do nothing;

create policy "public can view event screenshots"
  on storage.objects for select to public
  using (bucket_id = 'event-screenshots');

create policy "anyone can upload event screenshots"
  on storage.objects for insert to public
  with check (bucket_id = 'event-screenshots');

-- ============================================================
-- Quests: daily quests earn XP toward a 1-99 level (see src/lib/levels.ts
-- for the curve + named tiers). A quest can only be claimed once per member
-- per calendar day (UTC) - the (openfront_id, quest_id, date) primary key
-- enforces that even if the site is used from two tabs at once.
-- ============================================================

create table if not exists public.cyn_xp (
  openfront_id text primary key,
  xp integer not null default 0
);

alter table public.cyn_xp enable row level security;

create policy "public can read cyn_xp"
  on public.cyn_xp for select to public using (true);

create policy "anyone can upsert cyn_xp"
  on public.cyn_xp for insert to public with check (true);

create policy "anyone can update cyn_xp"
  on public.cyn_xp for update to public using (true) with check (true);

create table if not exists public.cyn_quest_claims (
  openfront_id text not null,
  quest_id text not null,
  claim_date date not null,
  claimed_at timestamptz not null default now(),
  primary key (openfront_id, quest_id, claim_date)
);

alter table public.cyn_quest_claims enable row level security;

create policy "public can read cyn_quest_claims"
  on public.cyn_quest_claims for select to public using (true);

create policy "anyone can insert cyn_quest_claims"
  on public.cyn_quest_claims for insert to public with check (true);

-- ============================================================
-- Shared Max Tiles cache: a finished game's tile-ownership replay result
-- (see src/lib/replaySim.ts) never changes once computed, so the FIRST
-- visitor to open a game's report pays for the replay and every visitor
-- after that - on any device, any browser, forever - gets it back instantly
-- from here instead of everyone silently redoing the same multi-second (or,
-- for a huge game, multi-minute) computation on their own machine. Keyed by
-- the engine commit + logic version that produced it (see
-- COMPUTE_LOGIC_VERSION in replaySimCore.ts) so re-vendoring the engine or
-- fixing a bug in the math invalidates old rows instead of serving stale,
-- known-wrong numbers forever.
-- ============================================================

create table if not exists public.cyn_game_tile_stats (
  game_id text not null,
  vendored_commit text not null,
  compute_logic_version integer not null,
  max_tiles jsonb not null,
  max_percent jsonb not null,
  final_tiles jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (game_id, vendored_commit, compute_logic_version)
);

alter table public.cyn_game_tile_stats enable row level security;

create policy "public can read cyn_game_tile_stats"
  on public.cyn_game_tile_stats for select to public using (true);

-- Update is allowed too (not insert-only): a corrupted result did reach
-- this table once in production (computeGameTileStats now fails closed on
-- it, but this table has to allow a later, correct recomputation to
-- replace a bad row that already got through, not lock it in forever).
create policy "anyone can insert cyn_game_tile_stats"
  on public.cyn_game_tile_stats for insert to public with check (true);

create policy "anyone can update cyn_game_tile_stats"
  on public.cyn_game_tile_stats for update to public using (true) with check (true);

-- ============================================================
-- Shared game-detail cache: a finished game's own record (players, their
-- clan tags, per-player stats) never changes once OpenFront finalizes it,
-- so - same reasoning as cyn_game_tile_stats above - the FIRST visitor (or
-- the daily Vercel Cron backfill, see api/cron/refresh-details.js) to fetch
-- a given game's detail saves everyone else from re-fetching it from
-- OpenFront's own rate-limited API. Before this, every visitor's own
-- browser had to redo the same ~hundreds of lookups a full roster build
-- needs from scratch, which is what made a first/cold page load slow.
-- ============================================================

create table if not exists public.cyn_game_detail_cache (
  game_id text primary key,
  detail jsonb not null,
  cached_at timestamptz not null default now()
);

alter table public.cyn_game_detail_cache enable row level security;

create policy "public can read cyn_game_detail_cache"
  on public.cyn_game_detail_cache for select to public using (true);

create policy "anyone can insert cyn_game_detail_cache"
  on public.cyn_game_detail_cache for insert to public with check (true);

create policy "anyone can update cyn_game_detail_cache"
  on public.cyn_game_detail_cache for update to public using (true) with check (true);

-- ============================================================
-- Shared per-member game-list cache. Confirmed directly (profiling a fully
-- cold roster build): fetching every registered member's own paginated game
-- list from OpenFront is the actual dominant cost of a first/cold page load
-- (~25-35s of it), not game-detail lookups - OpenFront rate-limits this
-- particular endpoint hard enough that roughly half of a full roster's page
-- requests come back 429 and have to be retried with backoff. The 5-minute
-- Cron (api/cron/refresh-details.js) already fetches every member's game
-- list anyway (to know which games need detail caching) - it now also
-- writes that list here, so a visitor's browser can read one row per member
-- instead of repeating that same rate-limited pagination itself. Unlike
-- cyn_game_detail_cache, a game LIST isn't immutable (it grows over time),
-- so the client checks updated_at and only trusts a row while it's still
-- reasonably fresh - see STALE_AFTER_MS in src/lib/openfront.ts.
-- ============================================================

create table if not exists public.cyn_member_games_cache (
  openfront_id text primary key,
  games jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cyn_member_games_cache enable row level security;

create policy "public can read cyn_member_games_cache"
  on public.cyn_member_games_cache for select to public using (true);

create policy "anyone can insert cyn_member_games_cache"
  on public.cyn_member_games_cache for insert to public with check (true);

create policy "anyone can update cyn_member_games_cache"
  on public.cyn_member_games_cache for update to public using (true) with check (true);

-- ============================================================
-- Help / feedback chat widget (bottom-right button on every page). A visitor
-- chats with a Claude-powered assistant (see api/help-chat.js) that can
-- explain known site behavior directly; anything that's an actual bug or
-- feature request is just logged here for a human admin to review and fix
-- in a real coding session - the assistant never touches site code itself.
-- ============================================================

-- Unlike almost every other table in this file, these two are NOT public-read.
-- A help conversation can contain whatever a visitor typed - including a
-- screenshot or a description of a personal problem - so a visitor reading
-- every other visitor's conversation straight off the anon key (which is
-- public, embedded in the site bundle) would be a real privacy leak, not a
-- theoretical one. All reads and writes now go exclusively through
-- api/help-chat.js using the service-role key (bypasses RLS, kept strictly
-- server-side, never sent to the browser) - that function is also the only
-- place ownership is enforced: a conversationId is only ever trusted after
-- confirming its visitor_key matches the caller's own. The only client that
-- reads these tables directly is the admin review page, gated the same way
-- cyn_event_submissions already gates its review actions - a real
-- auth.uid() check against cyn_event_admins, not just a hidden UI element.
create table if not exists public.cyn_help_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_key text not null,
  display_name text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cyn_help_conversations_visitor_idx on public.cyn_help_conversations (visitor_key);

alter table public.cyn_help_conversations enable row level security;

create policy "admins can read cyn_help_conversations"
  on public.cyn_help_conversations for select to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

create policy "admins can update cyn_help_conversations"
  on public.cyn_help_conversations for update to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

create table if not exists public.cyn_help_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.cyn_help_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists cyn_help_messages_conversation_idx on public.cyn_help_messages (conversation_id, created_at);

alter table public.cyn_help_messages enable row level security;

create policy "admins can read cyn_help_messages"
  on public.cyn_help_messages for select to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

-- If this migration is replacing an earlier version of this feature, drop
-- the old public policies (harmless no-op if they were never created).
drop policy if exists "public can read cyn_help_conversations" on public.cyn_help_conversations;
drop policy if exists "anyone can insert cyn_help_conversations" on public.cyn_help_conversations;
drop policy if exists "anyone can update cyn_help_conversations" on public.cyn_help_conversations;
drop policy if exists "public can read cyn_help_messages" on public.cyn_help_messages;
drop policy if exists "anyone can insert cyn_help_messages" on public.cyn_help_messages;

-- Storage bucket for images visitors attach to a help-chat message.
insert into storage.buckets (id, name, public)
values ('help-chat-images', 'help-chat-images', true)
on conflict (id) do nothing;

create policy "public can view help chat images"
  on storage.objects for select to public
  using (bucket_id = 'help-chat-images');

create policy "anyone can upload help chat images"
  on storage.objects for insert to public
  with check (bucket_id = 'help-chat-images');

-- ============================================================
-- Security hardening pass. Several tables above were left "anyone can
-- write, no login required" (`with check (true)`) because the app's own
-- client-side logic validates every submission before writing (e.g.
-- verifying a speedrun against OpenFront). That validation lives in the
-- BROWSER, not the database - anyone with the public anon key (embedded in
-- every page load, not a secret) can call the Supabase REST API directly
-- and skip the app entirely, inserting or overwriting rows with whatever
-- they want: fake speedrun world records, fake XP/levels, fake quest
-- claims, or vandalized/mass-spammed member registrations. Requiring a real
-- Discord-authenticated session (`to authenticated`) doesn't re-validate
-- the *content* of a submission - a signed-in member could still fake their
-- own speedrun time this way - but it closes the much larger hole of a
-- fully anonymous script hitting these tables with zero barrier, which is
-- what actually enables bulk spam/vandalism. This matches the bar already
-- set elsewhere in this file (cyn_event_teams, cyn_event_submissions'
-- update) - just applied consistently instead of selectively.
drop policy if exists "anyone can upsert cyn_members" on public.cyn_members;
drop policy if exists "anyone can update cyn_members" on public.cyn_members;
create policy "members can upsert cyn_members"
  on public.cyn_members for insert to authenticated with check (true);
create policy "members can update cyn_members"
  on public.cyn_members for update to authenticated using (true) with check (true);

drop policy if exists "anyone can upsert cyn_speedruns" on public.cyn_speedruns;
drop policy if exists "anyone can update cyn_speedruns" on public.cyn_speedruns;
create policy "members can upsert cyn_speedruns"
  on public.cyn_speedruns for insert to authenticated with check (true);
create policy "members can update cyn_speedruns"
  on public.cyn_speedruns for update to authenticated using (true) with check (true);

drop policy if exists "anyone can upsert cyn_bumps" on public.cyn_bumps;
drop policy if exists "anyone can update cyn_bumps" on public.cyn_bumps;
create policy "members can upsert cyn_bumps"
  on public.cyn_bumps for insert to authenticated with check (true);
create policy "members can update cyn_bumps"
  on public.cyn_bumps for update to authenticated using (true) with check (true);

drop policy if exists "anyone can upsert cyn_xp" on public.cyn_xp;
drop policy if exists "anyone can update cyn_xp" on public.cyn_xp;
create policy "members can upsert cyn_xp"
  on public.cyn_xp for insert to authenticated with check (true);
create policy "members can update cyn_xp"
  on public.cyn_xp for update to authenticated using (true) with check (true);

drop policy if exists "anyone can insert cyn_quest_claims" on public.cyn_quest_claims;
create policy "members can insert cyn_quest_claims"
  on public.cyn_quest_claims for insert to authenticated with check (true);

-- Deliberately NOT tightened: cyn_game_tile_stats, cyn_game_detail_cache,
-- and cyn_member_games_cache. These hold OpenFront-derived, non-authored
-- data (replay results, game details, game lists) that every visitor's
-- browser helps populate as a shared cache, by design - requiring login
-- would break the whole point of spreading that work across anonymous
-- visitors, and a bad write here just gets silently recomputed/overwritten
-- next time, unlike a fake speedrun time or a vandalized member row.

-- Per-IP rate limiting for the help-chat endpoint (api/help-chat.js) - the
-- one endpoint that costs real money per call (the Claude API). visitorKey
-- is client-supplied and free to regenerate, so it can't be the rate-limit
-- key on its own; this is keyed on request IP instead, which the server
-- fills in from the platform's forwarded-for header. No RLS policy is
-- granted here at all (service-role key only, same as the help-chat tables
-- themselves) - this table has no reason to ever be read or written by a
-- browser directly.
create table if not exists public.cyn_help_rate_limit (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 1
);

alter table public.cyn_help_rate_limit enable row level security;

-- Both upload buckets accepted any file type/size until now - the
-- `accept="image/*"` on each <input type="file"> is only a UI hint, never
-- enforced; nothing stopped uploading an arbitrarily large or non-image
-- file (a renamed script, a video, etc.) through either upload path.
-- Restrict at the bucket level, so this is enforced no matter what a
-- browser or a direct API call sends.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    file_size_limit = 8388608 -- 8 MB, matches the client-side cap in HelpWidget.tsx
where id in ('help-chat-images', 'event-screenshots');

-- ============================================================
-- Trend graphs (elo / all-time wins / XP over time, per member and
-- clan-wide - see src/lib/trends.ts). OpenFront itself has no history API,
-- so this site has to build its own by taking one snapshot a day. The
-- existing 5-minute cron (api/cron/refresh-details.js) already computes
-- everything needed per member as a side effect of its normal scan (it
-- already has each member's full game list in memory, plus one leaderboard
-- scan and one cyn_xp read per run, both done once, not per member) -
-- upserting today's row here is nearly free on top of that.
--
-- One row per (member, day): later upserts the same day just refine that
-- day's row as the cron keeps running, so by end of day it holds the last
-- values seen - all a daily-granularity graph needs. Public read (needed
-- for the profile + Trends page charts, no login required to view a
-- public stats site) and public write, same reasoning as the other
-- OpenFront-derived shared caches in this file (cyn_game_detail_cache
-- etc.) - this is non-authored, self-correcting background data, not
-- something a member could fake for personal gain the way a speedrun
-- leaderboard entry could, so it doesn't need the `to authenticated`
-- tightening those tables got.
-- ============================================================

create table if not exists public.cyn_member_snapshots (
  openfront_id text not null,
  snapshot_date date not null,
  elo integer,
  all_wins integer not null default 0,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (openfront_id, snapshot_date)
);

create index if not exists cyn_member_snapshots_member_idx on public.cyn_member_snapshots (openfront_id, snapshot_date);

alter table public.cyn_member_snapshots enable row level security;

create policy "public can read cyn_member_snapshots"
  on public.cyn_member_snapshots for select to public using (true);

create policy "anyone can upsert cyn_member_snapshots"
  on public.cyn_member_snapshots for insert to public with check (true);

create policy "anyone can update cyn_member_snapshots"
  on public.cyn_member_snapshots for update to public using (true) with check (true);

-- ============================================================
-- Clan chat: a public, registered-members-only chat (separate from the
-- private AI help-chat in cyn_help_conversations). Moderators - appointed by
-- admins via cyn_chat_moderators below - can delete messages.
--
-- Everything that actually matters is enforced server-side by the trigger
-- further down, not just in src/lib/chat.ts - a client-side check is only
-- ever UX (instant feedback before the round-trip) and can be bypassed by a
-- direct API call, same lesson as the RLS hardening pass earlier in this
-- file. The trigger enforces: real author identity via auth.uid() (never a
-- client-supplied one), 1-500 char messages, a 60s cooldown per author
-- (spam protection), and a wordlist-based block on common slurs/hate speech
-- in English, German and French (the site's three languages). That wordlist
-- is a baseline, not a complete solution - it can't catch every language or
-- every evasion attempt, which is why moderator delete exists as a backstop.
-- ============================================================

create table if not exists public.cyn_chat_moderators (
  discord_username text primary key,
  -- Same reasoning as cyn_event_admins.user_id - keyed on the real,
  -- unforgeable auth user id, never on client-editable user_metadata.
  user_id uuid references auth.users(id)
);

alter table public.cyn_chat_moderators enable row level security;

create policy "public can read cyn_chat_moderators"
  on public.cyn_chat_moderators for select to public using (true);

create policy "admins can add cyn_chat_moderators"
  on public.cyn_chat_moderators for insert to authenticated with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

create policy "admins can remove cyn_chat_moderators"
  on public.cyn_chat_moderators for delete to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

-- Same fill-user-id-from-discord_username trigger as cyn_event_admins.
create or replace function public.cyn_chat_moderators_fill_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select u.id into new.user_id
    from auth.users u
    where coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'preferred_username',
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'username',
      u.raw_user_meta_data -> 'custom_claims' ->> 'global_name'
    ) = new.discord_username
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cyn_chat_moderators_fill_user_id on public.cyn_chat_moderators;
create trigger trg_cyn_chat_moderators_fill_user_id
  before insert on public.cyn_chat_moderators
  for each row execute function public.cyn_chat_moderators_fill_user_id();

create table if not exists public.cyn_clan_chat_messages (
  id bigint generated always as identity primary key,
  author_user_id uuid not null references auth.users(id),
  -- Display fields - client-asserted, same trust level as other member-
  -- entered data already in this file (e.g. cyn_members.in_game_name).
  -- Only author_user_id (above) is what security/rate-limit checks use.
  author_openfront_id text not null,
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists cyn_clan_chat_messages_created_idx on public.cyn_clan_chat_messages (created_at);
create index if not exists cyn_clan_chat_messages_author_idx on public.cyn_clan_chat_messages (author_user_id, created_at);

alter table public.cyn_clan_chat_messages enable row level security;

create policy "members can read cyn_clan_chat_messages"
  on public.cyn_clan_chat_messages for select to authenticated using (true);

create policy "members can post cyn_clan_chat_messages"
  on public.cyn_clan_chat_messages for insert to authenticated with check (true);

create policy "moderators and admins can delete cyn_clan_chat_messages"
  on public.cyn_clan_chat_messages for delete to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
    or exists (select 1 from public.cyn_chat_moderators m where m.user_id = auth.uid())
  );

-- Normalizes text before the blocklist match: lowercases, maps common
-- leetspeak digit/symbol substitutions back to letters, then strips
-- everything that isn't a letter (catches spaced-out or punctuated evasion
-- like "a r s c h l o c h" or "n1gg3r").
create or replace function public.cyn_chat_normalize(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(input), '431057$@!', 'aeiostsai'),
    '[^a-z]', '', 'g'
  )
$$;

-- Baseline blocklist - common slurs and severe insults in English, German
-- and French, lowercased and unspaced (matching cyn_chat_normalize's
-- output). Not exhaustive - extend this list as needed. Kept in sync by
-- hand with CLIENT_BLOCKLIST in src/lib/chat.ts (that copy is UX-only; this
-- one is what's actually enforced).
create or replace function public.cyn_chat_contains_blocked_word(input text)
returns boolean
language sql
immutable
as $$
  select public.cyn_chat_normalize(input) ~ (
    'nigg(er|a)|faggot|retard|chink|spic|kike|coon|tranny|cunt' ||
    '|hurensohn|schlampe|missgeburt|untermensch|fotze|wichser|arschloch|behindert' ||
    '|salope|connard|encule|batard|negre|bougnoule|pute'
  )
$$;

create or replace function public.cyn_chat_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := trim(new.content);
  last_post timestamptz;
begin
  -- Never trust a client-supplied author_user_id - always the real caller.
  new.author_user_id := auth.uid();

  if char_length(trimmed) = 0 then
    raise exception 'invalid_length: message is empty';
  end if;
  if char_length(trimmed) > 500 then
    raise exception 'invalid_length: message is too long (max 500 characters)';
  end if;
  new.content := trimmed;

  select created_at into last_post
  from public.cyn_clan_chat_messages
  where author_user_id = new.author_user_id
  order by created_at desc
  limit 1;

  if last_post is not null and now() - last_post < interval '60 seconds' then
    raise exception 'rate_limited: wait a bit before posting again';
  end if;

  if public.cyn_chat_contains_blocked_word(new.content) then
    raise exception 'blocked_content: message contains blocked language';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cyn_chat_before_insert on public.cyn_clan_chat_messages;
create trigger trg_cyn_chat_before_insert
  before insert on public.cyn_clan_chat_messages
  for each row execute function public.cyn_chat_before_insert();

-- Running per-member message count, kept as its own small table (instead of
-- counting cyn_clan_chat_messages every time) so the Chatter badge is a
-- cheap lookup instead of an aggregate over a table that only grows.
create table if not exists public.cyn_chat_message_counts (
  openfront_id text primary key,
  count integer not null default 0
);

alter table public.cyn_chat_message_counts enable row level security;

create policy "public can read cyn_chat_message_counts"
  on public.cyn_chat_message_counts for select to public using (true);

-- No insert/update policy for anyone - only ever written by the trigger
-- below, which runs as security definer and bypasses RLS entirely.

create or replace function public.cyn_chat_increment_message_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cyn_chat_message_counts (openfront_id, count)
  values (new.author_openfront_id, 1)
  on conflict (openfront_id) do update set count = cyn_chat_message_counts.count + 1;
  return new;
end;
$$;

drop trigger if exists trg_cyn_chat_increment_message_count on public.cyn_clan_chat_messages;
create trigger trg_cyn_chat_increment_message_count
  after insert on public.cyn_clan_chat_messages
  for each row execute function public.cyn_chat_increment_message_count();

-- ============================================================
-- Supporters: members an admin has manually marked as having donated (see
-- the PayPal.me link in the site footer/floating button - PayPal.me has no
-- webhook/API integration here, so this is a manual admin toggle after
-- actually receiving a donation notification, not automatic verification).
-- Earns the permanent Supporter badge.
-- ============================================================

create table if not exists public.cyn_supporters (
  openfront_id text primary key,
  added_at timestamptz not null default now()
);

alter table public.cyn_supporters enable row level security;

create policy "public can read cyn_supporters"
  on public.cyn_supporters for select to public using (true);

create policy "admins can add cyn_supporters"
  on public.cyn_supporters for insert to authenticated with check (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

create policy "admins can remove cyn_supporters"
  on public.cyn_supporters for delete to authenticated using (
    exists (select 1 from public.cyn_event_admins a where a.user_id = auth.uid())
  );

-- ============================================================
-- Close the "signed in with Discord but never actually verified as a CYN
-- member" gap for the clan chat. Registering requires clicking "Continue
-- with Discord" BEFORE the OpenFront clan-tag check ever runs (see
-- Register.tsx) - that click alone creates a real Supabase auth session, so
-- `to authenticated` on its own (the bar used elsewhere in this file, e.g.
-- cyn_bumps/cyn_speedruns) only proves "signed in with some Discord
-- account", not "is a real, tag-verified [CYN] member". Fine for those
-- self-reported-stat tables; not fine for a chat real strangers could read
-- and post in. This ties chat access to an actual completed registration.
-- ============================================================

alter table public.cyn_members add column if not exists user_id uuid references auth.users(id);

-- Every cyn_members write happens while the member themselves is signed in
-- (see saveProfile in src/lib/profiles.ts), so this is simpler than the
-- cyn_event_admins-style trigger below: just stamp the real caller directly,
-- no name-matching needed.
create or replace function public.cyn_members_fill_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only stamp it when there's a real caller to stamp - auth.uid() is null
  -- for anything run outside a genuine authenticated API request (e.g. the
  -- SQL Editor, or a future admin backfill), and this trigger firing on
  -- UPDATE as well as INSERT means it would otherwise clobber a correct
  -- user_id right back to null the moment anyone runs a manual fix-up query.
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cyn_members_fill_user_id on public.cyn_members;
create trigger trg_cyn_members_fill_user_id
  before insert or update on public.cyn_members
  for each row execute function public.cyn_members_fill_user_id();

-- One-time backfill for members who registered before this column existed -
-- matches the same way cyn_event_admins/cyn_chat_moderators resolve a
-- discord_username to a real auth user id. Only fixes rows for someone who
-- has signed in with Discord at least once (true for every member today,
-- since registration has always required it) - safe to re-run.
update public.cyn_members m
set user_id = u.id
from auth.users u
where m.user_id is null
  and m.discord_username is not null
  and coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'preferred_username',
    u.raw_user_meta_data ->> 'user_name',
    u.raw_user_meta_data ->> 'username',
    u.raw_user_meta_data -> 'custom_claims' ->> 'global_name'
  ) = m.discord_username;

-- These were briefly rolled back to `to authenticated using/with check (true)`
-- because the first backfill attempt matched zero rows (see the trigger fix
-- above) - re-tightened now that the backfill is confirmed working (every
-- current member's user_id verified populated before this was reapplied).
drop policy if exists "members can read cyn_clan_chat_messages" on public.cyn_clan_chat_messages;
create policy "members can read cyn_clan_chat_messages"
  on public.cyn_clan_chat_messages for select to authenticated using (
    exists (select 1 from public.cyn_members m where m.user_id = auth.uid())
  );

drop policy if exists "members can post cyn_clan_chat_messages" on public.cyn_clan_chat_messages;
create policy "members can post cyn_clan_chat_messages"
  on public.cyn_clan_chat_messages for insert to authenticated with check (
    exists (select 1 from public.cyn_members m where m.user_id = auth.uid())
  );
