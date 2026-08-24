#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${1:-}"
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1)"
fi
test -n "$DB_CONTAINER"

readonly COMPANY_A='20000000-0000-4000-8000-000000000001'
readonly COMPANY_B='20000000-0000-4000-8000-000000000099'

psql_admin() {
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq
}

# A different company must be allowed to own the same normalized phone.
psql_admin <<SQL
insert into public.companies (id, name, status)
values ('$COMPANY_B', 'Second Fixture Company', 'active');

insert into public.customers (
  company_id, name, phone, consultation_type, status, interest_items, source_channel
) values
  ('$COMPANY_A', 'Company A Phone', '010-7777-8888', '창호', '신규', array['창호']::text[], 'fixture'),
  ('$COMPANY_B', 'Company B Same Phone', '01077778888', '창호', '신규', array['창호']::text[], 'fixture');
SQL

echo 'same normalized phone across two companies: PASS'

cross_company_count="$(psql_admin <<SQL
select count(*)
from public.customers
where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = '01077778888'
  and company_id in ('$COMPANY_A', '$COMPANY_B')
  and deleted_at is null;
SQL
)"
test "$cross_company_count" = '2'

# The same company must not create a second active customer by changing phone formatting.
set +e
same_company_error="$(
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq 2>&1 <<SQL
insert into public.customers (
  company_id, name, phone, consultation_type, status, interest_items, source_channel
) values (
  '$COMPANY_A', 'Company A Duplicate Format', '010 7777 8888',
  '창호', '신규', array['창호']::text[], 'fixture'
);
SQL
)"
same_company_status=$?
set -e

if [ "$same_company_status" -eq 0 ]; then
  echo 'same-company normalized duplicate unexpectedly succeeded' >&2
  exit 1
fi
echo "$same_company_error" | grep -q 'customers_company_phone_digits_active_unique'
echo 'same-company normalized duplicate: DENIED as expected'

# A soft-deleted historical customer must not block a new active customer.
psql_admin <<SQL
insert into public.customers (
  company_id, name, phone, consultation_type, status, interest_items, source_channel, deleted_at
) values (
  '$COMPANY_A', 'Deleted Historical Phone', '010-9999-0000',
  '창호', '신규', array['창호']::text[], 'fixture', now()
);

insert into public.customers (
  company_id, name, phone, consultation_type, status, interest_items, source_channel
) values (
  '$COMPANY_A', 'Active Replacement Phone', '01099990000',
  '창호', '신규', array['창호']::text[], 'fixture'
);
SQL

deleted_reuse_count="$(psql_admin <<SQL
select count(*)
from public.customers
where company_id = '$COMPANY_A'
  and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = '01099990000';
SQL
)"
test "$deleted_reuse_count" = '2'
echo 'soft-deleted phone does not block active customer: PASS'

echo 'Multi-company customer phone uniqueness behavior: PASS'
