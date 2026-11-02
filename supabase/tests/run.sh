#!/usr/bin/env bash
# #232 Database security + behaviour tests. Builds a fresh database from the migrations (twice, to
# prove they're safe to re-run), then runs every test file in order and checks how many errors each
# one raises against expected.txt (most errors are the point: someone being refused).
# Needs a local Postgres 16; set PGHOST/PGPORT/PGUSER (CI sets them). Usage: supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=${CRUMBS_TEST_DB:-crumbs_test}
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f stubs.sql >/dev/null 2>&1
psql -q -d "$DB" -c "alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant all on functions to anon, authenticated;"
# Every migration in date order, then all of them again (new dated files are picked up automatically).
MIGRATIONS=(../migrations/*.sql)
FILES=(../schema.sql ../fresh-project-additions.sql "${MIGRATIONS[@]}" "${MIGRATIONS[@]}")
for f in "${FILES[@]}"; do
  out=$(psql -q -d "$DB" -f "$f" 2>&1 | grep "ERROR" || true)
  if [ -n "$out" ]; then echo "Loading $f failed:"; echo "$out"; exit 1; fi
done
# The older tests make lots of groups per person: lift the owned-groups limit (batch32 sets it back).
psql -q -d "$DB" -c "update public.point_rules set day_caps = day_caps || '{\"groups\": [null, null, null, null, null]}'" >/dev/null
# …and let anyone start a group (invite-only is tested on its own in invites_test).
psql -q -d "$DB" -c "update public.feature_flags set state = 'everyone' where key = 'start_groups'" >/dev/null
fail=0
while read -r name expected; do
  [ -z "$name" ] && continue
  got=$(psql -d "$DB" -f "$name.sql" 2>&1 | grep -c ERROR || true)
  if [ "$got" != "$expected" ]; then
    echo "✗ $name: $got errors (expected $expected)"
    psql -d "$DB" -f "$name.sql" 2>&1 | grep ERROR | head -5
    fail=1
  else
    echo "✓ $name"
  fi
done < expected.txt
exit $fail
