-- Coindle schema — public schema
--
-- Originally dumped from project udpurxhhnufriznjmkhv on 2026-08-16 after
-- restoring it from an inactivity pause. That project was later reclaimed by
-- Supabase (its hostname no longer resolves), so this file stopped being a
-- record of a live database and became the source it gets rebuilt from.
--
-- To stand up a new project: create it, then run this file in the SQL editor.
--
-- All application access is server-side through SUPABASE_SERVICE_KEY. The
-- service_role bypasses RLS, so the policies below are belt-and-braces rather
-- than load-bearing. anon/authenticated hold broad table grants but have no
-- policies, so RLS blocks them outright.

-- ---------------------------------------------------------------
-- game_events — one row per completed game (analytics)
-- Written by  POST /api/analytics
-- Read by     GET  /api/analytics/stats
-- ---------------------------------------------------------------
create table if not exists public.game_events (
  id          bigserial   primary key,
  created_at  timestamptz default now(),
  mode        text        not null,   -- 'daily' | 'freeplay'
  difficulty  text        not null,   -- 'easy'  | 'hard'
  result      text        not null,   -- 'win'   | 'loss'
  guesses     integer     not null,
  answer      text        not null,
  platform    text        default 'web',
  user_id     text                    -- localStorage 'coindle-uid', not an auth.users FK
);

-- ---------------------------------------------------------------
-- leaderboard — one row per user per puzzle
-- Written by  POST /api/leaderboard
-- Read by     GET  /api/leaderboard[?puzzle=N]
-- ---------------------------------------------------------------
create table if not exists public.leaderboard (
  id             bigserial   primary key,
  user_id        text        not null,
  username       text        not null,
  puzzle_number  integer     not null,
  guesses        integer     not null,
  won            boolean     not null,
  created_at     timestamptz default now(),
  -- load-bearing: POST upserts with onConflict "user_id,puzzle_number".
  -- Without this the upsert errors instead of updating.
  constraint leaderboard_user_id_puzzle_number_key unique (user_id, puzzle_number)
);

-- ---------------------------------------------------------------
-- reports — player-submitted coin data corrections
-- Written by  POST /api/reports
-- Read by     GET  /api/reports and the stats route
-- ---------------------------------------------------------------
create table if not exists public.reports (
  id          bigserial   primary key,
  created_at  timestamptz default now(),
  ticker      text        not null,
  category    text        not null,
  message     text,
  user_id     text
);

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
alter table public.game_events enable row level security;
alter table public.leaderboard enable row level security;
alter table public.reports     enable row level security;

drop policy if exists "Allow select from service role" on public.game_events;
create policy "Allow select from service role" on public.game_events
  for select to service_role using (true);
drop policy if exists "Allow insert from service role" on public.game_events;
create policy "Allow insert from service role" on public.game_events
  for insert to service_role with check (true);

drop policy if exists "Allow select from service role" on public.leaderboard;
create policy "Allow select from service role" on public.leaderboard
  for select to service_role using (true);
drop policy if exists "Allow insert from service role" on public.leaderboard;
create policy "Allow insert from service role" on public.leaderboard
  for insert to service_role with check (true);

drop policy if exists "Allow select from service role" on public.reports;
create policy "Allow select from service role" on public.reports
  for select to service_role using (true);
drop policy if exists "Allow insert from service role" on public.reports;
create policy "Allow insert from service role" on public.reports
  for insert to service_role with check (true);

-- ---------------------------------------------------------------
-- cache — durable key/value store for daily price snapshots
--
-- Replaces an in-process Map that could not survive a serverless cold start:
-- the daily cron wrote the snapshot into one lambda instance and /api/prices
-- read from another, so nearly every request refetched all 144 feeds from
-- Hermes. That mattered little while Hermes was free and unauthenticated, and
-- matters a lot now that it is neither.
--
-- Keys are the same ones the old Map used:
--   prices:YYYY-MM-DD         → all coin tiers
--   history:TICKER:YYYY-MM-DD → 90-day sparkline points
-- ---------------------------------------------------------------
create table if not exists public.cache (
  key         text        primary key,
  value       jsonb       not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);

-- Sweeping expired rows is a range scan on expires_at alone.
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

-- ---------------------------------------------------------------
-- Indexes
--
-- These were commented out while this file was a faithful dump of a database
-- that did not have them. It is now the rebuild source, so a fresh project
-- should get them: /api/analytics/stats orders game_events by created_at, and
-- the daily leaderboard filters puzzle_number + won before ordering.
-- ---------------------------------------------------------------
create index if not exists game_events_created_at_idx
  on public.game_events (created_at desc);

-- Equality columns first, then the ordering columns (leftmost-prefix rule).
create index if not exists leaderboard_daily_idx
  on public.leaderboard (puzzle_number, won, guesses, created_at);
