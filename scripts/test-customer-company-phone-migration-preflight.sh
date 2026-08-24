#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${1:-}"
MIGRATION_FILE="${2:-}"
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1)"
fi
test -n "$DB_CONTAINER"
test -n "$MIGRATION_FILE"
test -f "$MIGRATION_FILE"

readonly PREFLIGHT_COMPANY='20000000-0000-4000-8000-000000000098'

# This test intentionally runs before the normal RLS actor seed. Create its own
# isolated company so it does not depend on later workflow ordering.
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq <<SQL
insert into public.companies (id, name, status)
values ('$PREFLIGHT_COMPANY', 'Phone Migration Preflight Company', 'active');

-- The legacy exact-phone constraint allows these two differently formatted rows,
-- but the new company-scoped normalized policy must detect them as one phone.
insert into public.customers (
  company_id, name, phone, consultation_type, status, interest_items, source_channel
) values
  ('$PREFLIGHT_COMPANY', 'Preflight A', '010-5555-6666', '창호', '신규', array['창호']::text[], 'fixture_phone_preflight'),
  ('$PREFLIGHT_COMPANY', 'Preflight B', '01055556666', '창호', '신규', array['창호']::text[], 'fixture_phone_preflight');
SQL

set +e
migration_output="$(
  cat "$MIGRATION_FILE" |
    docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1
)"
migration_status=$?
set -e

if [ "$migration_status" -eq 0 ]; then
  echo 'phone uniqueness migration unexpectedly succeeded with same-company normalized duplicates' >&2
  exit 1
fi

echo "$migration_output" | grep -q 'same-company normalized duplicate groups=1'

# The failed transaction must leave the old global constraint intact and must
# not leave the new partial expression index behind.
post_failure_state="$(docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq <<'SQL'
select concat_ws('|',
  (select count(*) from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'customers'
      and constraint_row.conname = 'customers_phone_unique'),
  (select count(*) from pg_class index_class
    join pg_namespace namespace_row on namespace_row.oid = index_class.relnamespace
    where namespace_row.nspname = 'public'
      and index_class.relname = 'customers_company_phone_digits_active_unique')
);
SQL
)"

test "$post_failure_state" = '1|0'
echo 'phone migration duplicate preflight rollback: PASS'

# Remove only CI preflight rows/company, then the real migration can run normally.
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq <<SQL
delete from public.customers
where source_channel = 'fixture_phone_preflight';

delete from public.companies
where id = '$PREFLIGHT_COMPANY';
SQL
