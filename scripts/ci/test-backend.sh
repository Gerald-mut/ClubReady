#!/usr/bin/env bash
# Run only against the disposable CLI stack configured on local port 54322.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# Override inherited connection settings: never accept a hosted URL or service.
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
export PGHOST=127.0.0.1 PGPORT=54322 PGDATABASE=postgres PGUSER=postgres
export PGPASSWORD=postgres PGCONNECT_TIMEOUT=10

# db reset already seeded once; replay to verify curated seed idempotence.
psql -X --set=ON_ERROR_STOP=1 --file=supabase/seeds/opportunities.sql

# Existing root suites contain psql meta-commands and raise exceptions; they do
# not emit TAP. Do not silently feed them to pg_prove or skip them.
mapfile -d '' assertion_files < <(find supabase/tests -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)
test "${#assertion_files[@]}" -gt 0
for sql_file in "${assertion_files[@]}"; do
  echo "SQL assertions: $sql_file"
  # Current Storage blocks SQL DELETE before RLS unless its internal guard is
  # opted out. These rollback-only metadata fixtures need to exercise RLS itself.
  # This connection-only setting is confined to the fixed disposable local DB;
  # it does not bypass RLS and must never be used as a production cleanup method.
  PGOPTIONS='-c storage.allow_delete_query=true' \
    psql -X --set=ON_ERROR_STOP=1 --file="$sql_file"
done

# Explicit directory avoids relying on the CLI's default discovery location.
supabase test db supabase/tests/database

python3 scripts/ci/test-activity-upgrade.py

# Real overlapping database sessions; committed catalog-only fixtures mean this
# must run last and only on the disposable stack, which CI discards afterward.
python3 scripts/ci/test-activity-concurrency.py
