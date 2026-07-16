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
