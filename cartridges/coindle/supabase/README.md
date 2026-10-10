# Supabase

## What Coindle actually uses

A hosted Postgres with an HTTP API. That is the whole of it — no Auth, no
Storage, no Realtime, no Edge Functions. Most of what the Supabase dashboard
offers is irrelevant here, which is the main reason the thing feels harder to
manage than it is.

Three things to maintain:

| Thing | Where it lives |
| --- | --- |
| The project | Supabase dashboard, ref `udpurxhhnufriznjmkhv` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | `.env.local` (local) and Vercel env (prod) |
| Table definitions | `schema.sql` in this directory |

`SUPABASE_SERVICE_KEY` is the service_role key. It bypasses RLS completely, so
it is server-side only: never in client code, never behind a `NEXT_PUBLIC_`
prefix. Every table read and write goes through an API route.

## The free-tier idle rule

This is the failure that keeps recurring, and it is not a bug in Coindle:

```
no queries for ~7 days   ->  PAUSED     hostname stops resolving, app 500s
paused for a long time   ->  reclaimed  actual deletion
```

A paused project's hostname **stops resolving in DNS**. "Non-existent domain"
therefore does not mean the project was deleted — check the status before
concluding anything (see below). A restore passes through `COMING_UP`, serving
Cloudflare 521, then briefly 503/404 while PostgREST warms its schema cache,
then 200. It takes about two minutes.

`keepDatabaseWarm()` in `src/app/api/cron/daily/route.ts` exists to prevent
this: it runs one query a day so the idle timer never expires. If the project
pauses again, that cron is failing — check its output, which reports `dbWarm`
on every run.

## Everyday tasks

**Check status before assuming anything is broken.** This one command answers
most questions:

```bash
supabase projects list
```

Look at the `status` column. `ACTIVE_HEALTHY` is fine, `INACTIVE` is paused,
`COMING_UP` means wait a couple of minutes.

**Change the schema.** `schema.sql` is the source of truth, not the dashboard.
Edit the file first, then apply it. It is written to be safely re-runnable
against a database that already has data: tables and indexes use
`if not exists`, and each policy is preceded by a `drop policy if exists`
because Postgres has no `create policy if not exists`.

For an incremental change to a live database, add a migration and push it:

```bash
supabase migration new describe_the_change   # creates a file to edit
supabase db push
```

For a brand new project, paste `schema.sql` into the dashboard SQL editor and
run it once.

Keep `schema.sql` updated to reflect the full picture either way, so a rebuild
from scratch stays a single step.

**Link the CLI to the project** (once per machine, needed before `db push`):

```bash
supabase link --project-ref udpurxhhnufriznjmkhv
```

**Set the production env vars.** Local `.env.local` does not reach Vercel.
Each `add` prompts for the value:

```bash
vercel env ls                                  # what is already set
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_KEY production
vercel env add PYTH_API_KEY production         # required, not Supabase but
                                               # the game 502s without it
```

Env var changes only take effect on the next deployment.

## Files here

| File | Purpose |
| --- | --- |
| `schema.sql` | Full schema. Source of truth. Safe to re-run. |
| `migrations/` | Incremental changes applied via `supabase db push`. |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `TypeError: fetch failed` in logs | Project paused | `supabase projects list`, wait for restore |
| DNS "non-existent domain" | Project paused, not deleted | Same as above |
| HTTP 521 from the REST API | Restore in progress | Wait ~2 minutes |
| HTTP 404 on a table that exists | PostgREST schema cache still warming | Wait, or reload the schema cache |
| Routes return 503 with an empty payload | `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` unset | Set them locally and in Vercel |
| `create policy` errors on re-run | Policy already exists | Already handled; keep the `drop policy if exists` lines |

The app degrades rather than crashing when the database is unreachable:
leaderboard, stats and reports return 503 with empty payloads, analytics writes
report `recorded: false`, and the game itself keeps working because prices come
from Pyth, not Postgres.
