# Database changes (#231)

- `schema.sql` – the starting tables for a brand new project.
- `migrations/` – every change since, one file per change, named `YYYYMMDD_what.sql`, run in date order.
  Each file is safe to run more than once (`if not exists`, `create or replace`, `drop policy if exists`).
- `tests/` – security and behaviour checks run on every push (see `tests/run.sh`).

## The rule from now on

`20261025_v4_features.sql` is the last big file. It hasn't been run on the live database yet, so it
can still change until it is. **After it has been run on live, never edit it again** – put the next change
in a new dated file (e.g. `20261102_dish_photos.sql`) so you always know exactly what live has had.

Keep a note of the last file run on each database (live and staging) in the Supabase SQL Editor's
saved snippets, or at the top of `DEVLOG.md`.

## Running the checks locally

Needs Postgres 16 (`psql` on the path):

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres bash supabase/tests/run.sh
```

It builds a throwaway database, loads the schema and every migration twice (to prove re-running is
safe), then runs each `*_test.sql` and compares the number of expected refusals with `tests/expected.txt`.
