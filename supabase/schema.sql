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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
create table if not exists public.cyn_speedruns (
  openfront_id text primary key,
  game_id text not null,
  seconds integer not null,
  submitted_at timestamptz not null default now()
);

alter table public.cyn_speedruns enable row level security;

create policy "public can read cyn_speedruns"
  on public.cyn_speedruns for select to public using (true);

create policy "anyone can upsert cyn_speedruns"
  on public.cyn_speedruns for insert to public with check (true);

create policy "anyone can update cyn_speedruns"
  on public.cyn_speedruns for update to public using (true) with check (true);
