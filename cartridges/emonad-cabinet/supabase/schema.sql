-- Buy Bounce backend schema.
--
-- Lives in its own `buybounce` schema so it can share an existing Supabase project
-- without touching that project's tables. Supabase free tier allows two active
-- projects, and both are spoken for, so Buy Bounce is a guest here.
--
-- To remove it completely: drop schema buybounce cascade;
--
-- AFTER RUNNING THIS, one dashboard step is required:
--   Settings -> API -> Data API -> Exposed schemas: add `buybounce`
-- PostgREST will not route to a schema that is not exposed, and the API returns
-- PGRST106 until you do.
--
-- Safe to re-run.

create extension if not exists pgcrypto;
create schema if not exists buybounce;

-- One seed per (day, attempt index), shared by every player. Created lazily on first
-- claim so no cron job is needed.
--
-- Keyed by idx, not by day alone. With a single seed per day, spending attempt 1
-- reveals the seed that attempts 2 and 3 will also use, so a player can rehearse it
-- locally as many times as they like and submit only their best. Per-index seeds keep
-- the day comparable (everyone's first run is the same chart, everyone's second run
-- is the same chart) while making the seeds you have not spent yet unknowable.
create table if not exists buybounce.daily_seed (
  day   date not null,
  idx   int  not null,
  seed  bigint not null,
  made  timestamptz not null default now(),
  primary key (day, idx)
);

-- One row per attempt spent. Created at the moment the seed is handed out, which is
-- what makes an attempt cost something even if the player closes the tab.
create table if not exists buybounce.attempt (
  id        uuid primary key default gen_random_uuid(),
  day       date not null,
  player    text not null,
  idx       int  not null,
  seed      bigint not null,
  created   timestamptz not null default now(),
  unique (player, day, idx)
);
create index if not exists attempt_player_day on buybounce.attempt (player, day);

-- A verified run. attempt_id is unique, so one issued seed can be submitted once.
-- Daily runs carry an attempt_id; free play runs do not.
create table if not exists buybounce.run (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid unique references buybounce.attempt(id) on delete cascade,
  player      text,
  day         date,
  mode        text not null check (mode in ('daily','free')),
  seed        bigint not null,
  ath         double precision not null,
  climb       double precision not null,
  buys        integer not null,
  best        integer not null,
  secs        double precision not null,
  steps       integer not null,
  track       text not null,
  created     timestamptz not null default now()
);
create index if not exists run_day_ath on buybounce.run (day, ath desc) where mode = 'daily';
create index if not exists run_all_ath on buybounce.run (ath desc);

-- Boards are one row per player, not one row per run.
--
-- The daily rule is three attempts and the best one counts, so ranking raw runs lets a
-- single player occupy three slots and push three other people off the board. These
-- views collapse each player to their best run, which is what "best one counts"
-- actually means on a leaderboard.
create or replace view buybounce.daily_board as
select distinct on (day, player) day, player, ath, buys, secs, created
from buybounce.run
where mode = 'daily'
order by day, player, ath desc;

create or replace view buybounce.alltime_board as
select distinct on (player) player, ath, buys, secs, created
from buybounce.run
order by player, ath desc;

-- Claim one attempt atomically.
--
-- The advisory lock is the point of this function. Counting attempts with a SELECT
-- followed by an INSERT lets two concurrent requests both read 2 and both insert, so
-- a player gets 4 runs by double-clicking. Locking on (player, day) serialises the
-- read-modify-write for that player only.
--
-- Every table reference is schema-qualified and search_path is pinned, because the
-- role PostgREST switches to does not necessarily have buybounce on its path.
create or replace function buybounce.claim_attempt(p_player text, p_day date, p_max int)
returns table (attempt_id uuid, seed bigint, attempts_left int)
language plpgsql
set search_path = buybounce, pg_temp
as $$
declare
  v_seed bigint;
  v_used int;
  v_id   uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_player || p_day::text));

  select count(*) into v_used from buybounce.attempt a
   where a.player = p_player and a.day = p_day;

  -- Out of attempts returns no seed at all. Handing one back leaks the chart to
  -- somebody who can no longer play it, which is free rehearsal material for anyone
  -- willing to burn a throwaway identity.
  if v_used >= p_max then
    return query select null::uuid, null::bigint, 0;
    return;
  end if;

  insert into buybounce.daily_seed (day, idx, seed)
  values (p_day, v_used, (random() * 4294967295)::bigint)
  on conflict (day, idx) do nothing;

  select ds.seed into v_seed from buybounce.daily_seed ds
   where ds.day = p_day and ds.idx = v_used;

  insert into buybounce.attempt (day, player, idx, seed)
  values (p_day, p_player, v_used, v_seed)
  returning id into v_id;

  return query select v_id, v_seed, (p_max - v_used - 1);
end;
$$;

-- Only the service role reaches this schema. anon and authenticated get nothing, so
-- the API is the only door and a leaked anon key buys access to nothing here.
grant usage on schema buybounce to service_role;
grant all on all tables in schema buybounce to service_role;
grant all on all sequences in schema buybounce to service_role;
grant execute on all functions in schema buybounce to service_role;
grant select on buybounce.daily_board, buybounce.alltime_board to service_role;
alter default privileges in schema buybounce grant all on tables to service_role;
alter default privileges in schema buybounce grant execute on functions to service_role;

revoke all on schema buybounce from anon, authenticated;

-- Defence in depth. The service role bypasses RLS, so this changes nothing today,
-- and it means a future grant to anon does not silently expose the tables.
alter table buybounce.daily_seed enable row level security;
alter table buybounce.attempt    enable row level security;
alter table buybounce.run        enable row level security;
