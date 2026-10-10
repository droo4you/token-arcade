-- Adds the durable price cache and the two indexes the read paths need.
-- Purely additive: no existing table, column, policy or row is touched.
--
-- The full picture lives in supabase/schema.sql; this migration is the
-- incremental step that brings an already-populated database up to it.

create table if not exists public.cache (
  key         text        primary key,
  value       jsonb       not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);

create index if not exists cache_expires_at_idx on public.cache (expires_at);

alter table public.cache enable row level security;

drop policy if exists "Allow select from service role" on public.cache;
create policy "Allow select from service role" on public.cache
  for select to service_role using (true);
drop policy if exists "Allow insert from service role" on public.cache;
create policy "Allow insert from service role" on public.cache
  for insert to service_role with check (true);
drop policy if exists "Allow update from service role" on public.cache;
create policy "Allow update from service role" on public.cache
  for update to service_role using (true) with check (true);

create index if not exists game_events_created_at_idx
  on public.game_events (created_at desc);

create index if not exists leaderboard_daily_idx
  on public.leaderboard (puzzle_number, won, guesses, created_at);
