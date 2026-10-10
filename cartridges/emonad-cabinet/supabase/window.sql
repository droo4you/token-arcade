-- Buy Bounce window mode. Run AFTER schema.sql. Safe to re-run.
--
-- A window is a bounded event (the season one spec calls it a window): wallet-gated
-- entry, N attempts per wallet, tickets bank per wallet across those attempts.
-- Daily and free play are untouched by anything in this file.
--
-- To open a window, insert a row. Nothing else is needed, and no deploy:
--
--   insert into buybounce.window (name, opens, closes)
--   values ('Window 1', now(), now() + interval '3 days');
--
-- To close early: update buybounce.window set closes = now() where name = 'Window 1';
--
-- Every window gets its own secret, generated here and never sent to a client while
-- the window is open. A wallet's seed for attempt i is the first four bytes of
-- sha256(secret | wallet | i), so layouts are per wallet and unknowable before the
-- attempt is spent. After close, /api/window/state returns the secret and anyone can
-- recompute every seed in the window. This is spec section 4.2 without the drand
-- round, which is only needed for the draw.

-- 256 bits from two uuids: core Postgres, no extension schema to get wrong.
create table if not exists buybounce.window (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  opens     timestamptz not null,
  closes    timestamptz not null,
  attempts  int not null default 3,
  secret    text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created   timestamptz not null default now(),
  check (closes > opens)
);

create table if not exists buybounce.window_attempt (
  id         uuid primary key default gen_random_uuid(),
  window_id  uuid not null references buybounce.window(id) on delete cascade,
  player     text not null,
  idx        int  not null,
  seed       bigint not null,
  created    timestamptz not null default now(),
  unique (window_id, player, idx)
);
create index if not exists window_attempt_player on buybounce.window_attempt (window_id, player);

-- Runs gain a ticket count and a link to the window attempt that issued their seed.
-- window_attempt_id is unique for the same reason attempt_id is: one issued seed,
-- one submission.
alter table buybounce.run add column if not exists tickets integer not null default 0;
alter table buybounce.run add column if not exists window_attempt_id uuid unique
  references buybounce.window_attempt(id) on delete cascade;
alter table buybounce.run drop constraint if exists run_mode_check;
alter table buybounce.run add constraint run_mode_check check (mode in ('daily','free','window'));

-- One row per wallet per window: tickets summed across attempts, which is the draw
-- weight, plus the best score for the display.
create or replace view buybounce.window_board as
select a.window_id, r.player,
       sum(r.tickets)::int as tickets,
       max(r.ath) as ath,
       count(*)::int as runs
from buybounce.run r
join buybounce.window_attempt a on a.id = r.window_attempt_id
where r.mode = 'window'
group by a.window_id, r.player;

-- Spend one attempt in a window. Same advisory-lock shape as claim_attempt.
-- state is 'ok', 'closed' or 'exhausted'; only 'ok' carries a seed.
create or replace function buybounce.claim_window_attempt(p_window uuid, p_player text)
returns table (state text, attempt_id uuid, seed bigint, attempts_left int)
language plpgsql
set search_path = buybounce, pg_temp
as $$
declare
  w      buybounce.window%rowtype;
  v_used int;
  v_seed bigint;
  v_id   uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_player || p_window::text));

  select * into w from buybounce.window where id = p_window;
  if not found or now() < w.opens or now() >= w.closes then
    return query select 'closed'::text, null::uuid, null::bigint, 0;
    return;
  end if;

  select count(*) into v_used from buybounce.window_attempt a
   where a.window_id = p_window and a.player = p_player;
  if v_used >= w.attempts then
    return query select 'exhausted'::text, null::uuid, null::bigint, 0;
    return;
  end if;

  -- first four bytes of sha256(secret | wallet | idx), big-endian, as an unsigned int
  v_seed := ('x' || substr(encode(sha256(convert_to(w.secret || '|' || p_player || '|' || v_used::text, 'UTF8')), 'hex'), 1, 8))::bit(32)::bigint;

  insert into buybounce.window_attempt (window_id, player, idx, seed)
  values (p_window, p_player, v_used, v_seed)
  returning id into v_id;

  return query select 'ok'::text, v_id, v_seed, (w.attempts - v_used - 1);
end;
$$;

grant all on all tables in schema buybounce to service_role;
grant execute on all functions in schema buybounce to service_role;
grant select on buybounce.window_board to service_role;

alter table buybounce.window         enable row level security;
alter table buybounce.window_attempt enable row level security;
