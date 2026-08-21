#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${1:-}"
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1)"
fi
test -n "$DB_CONTAINER"

readonly INSPECTOR_USER='10000000-0000-4000-8000-000000000001'
readonly OTHER_USER='10000000-0000-4000-8000-000000000002'
readonly COMPANY_ID='20000000-0000-4000-8000-000000000001'
readonly INSPECTOR_EMPLOYEE='30000000-0000-4000-8000-000000000001'
readonly OTHER_EMPLOYEE='30000000-0000-4000-8000-000000000002'

query_as() {
  local user_id="$1"
  local sql="$2"
  local claims
  claims="{\"sub\":\"$user_id\",\"role\":\"authenticated\"}"
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq <<SQL
begin;
set local "request.jwt.claim.sub" = '$user_id';
set local "request.jwt.claims" = '$claims';
set local role authenticated;
$sql
rollback;
SQL
}

# New registration and a same-employee retry happen in one transaction so the
# second call must reuse exactly the customer/project created by the first call.
# Audit rows are asserted in the same transaction before rollback.
created_and_reused="$(query_as "$INSPECTOR_USER" "
with first_call as materialized (
  select public.create_window_check_customer_project(
    'Quick Customer', '010-1111-2222', '서울 테스트아파트 101동 1001호', null
  ) as result
),
second_call as materialized (
  select public.create_window_check_customer_project(
    'Quick Customer Retry', '01011112222', '변경 시도 주소', null
  ) as result
)
select concat_ws('|',
  first_call.result->>'status',
  second_call.result->>'status',
  (first_call.result->'customer'->>'id' = second_call.result->'customer'->>'id')::text,
  (first_call.result->'project'->>'id' = second_call.result->'project'->>'id')::text,
  first_call.result->'customer'->>'assigned_employee_id',
  first_call.result->'project'->>'status',
  first_call.result->'project'->>'address',
  (select count(*) from public.audit_logs a
    where a.company_id = '$COMPANY_ID'
      and a.actor_id = '$INSPECTOR_USER'
      and a.action = 'window_check_customer_create'),
  (select count(*) from public.audit_logs a
    where a.company_id = '$COMPANY_ID'
      and a.actor_id = '$INSPECTOR_USER'
      and a.action = 'window_check_project_create'),
  (select count(*) from public.audit_logs a
    where a.company_id = '$COMPANY_ID'
      and a.actor_id = '$INSPECTOR_USER'
      and a.action = 'window_check_customer_project_reuse')
)
from first_call cross join second_call;
")"
expected_created="created|reused|true|true|$INSPECTOR_EMPLOYEE|준비|서울 테스트아파트 101동 1001호|1|1|1"
test "$created_and_reused" = "$expected_created"
echo 'quick registration create + idempotent reuse + audit: PASS'

# Seed a customer owned by a different employee. The quick RPC must detect the
# company-wide phone duplicate while returning no customer/project payload.
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq <<SQL
insert into public.customers (
  id, company_id, assigned_employee_id, name, phone, address,
  consultation_type, status, interest_items, source_channel
) values (
  '50000000-0000-4000-8000-000000000099',
  '$COMPANY_ID',
  '$OTHER_EMPLOYEE',
  'Hidden Other Customer',
  '010-3333-4444',
  'Hidden Address',
  '창호',
  '신규',
  array['창호']::text[],
  'fixture'
);
SQL

blocked="$(query_as "$INSPECTOR_USER" "
with call as materialized (
  select public.create_window_check_customer_project(
    'Attempted Duplicate', '01033334444', 'Attempted Address', null
  ) as result
)
select concat_ws('|',
  result->>'status',
  (result->'customer' = 'null'::jsonb)::text,
  (result->'project' = 'null'::jsonb)::text,
  (result::text !~ 'Hidden Other Customer')::text,
  (result::text !~ 'Hidden Address')::text,
  (result::text !~ '50000000-0000-4000-8000-000000000099')::text,
  (select count(*) from public.audit_logs a
    where a.company_id = '$COMPANY_ID'
      and a.actor_id = '$INSPECTOR_USER'
      and a.action = 'window_check_duplicate_blocked'
      and a.entity_id is null),
  (select bool_and(
      coalesce(a.payload->>'source', '') = 'window_check'
      and coalesce(a.payload->>'reason', '') = 'phone_duplicate_outside_scope'
      and a.payload::text !~ 'Hidden Other Customer'
      and a.payload::text !~ 'Hidden Address'
    )
    from public.audit_logs a
    where a.company_id = '$COMPANY_ID'
      and a.actor_id = '$INSPECTOR_USER'
      and a.action = 'window_check_duplicate_blocked')::text
) from call;
")"
test "$blocked" = 'duplicate_blocked|true|true|true|true|true|1|true'
echo 'cross-assignee duplicate masking + non-PII audit: PASS'

# The owning employee can reuse the same customer and receive/create a project.
owner_reuse="$(query_as "$OTHER_USER" "
with call as materialized (
  select public.create_window_check_customer_project(
    'Ignored Rename', '01033334444', 'Hidden Address', null
  ) as result
)
select concat_ws('|',
  result->>'status',
  result->'customer'->>'assigned_employee_id',
  result->'project'->>'status',
  (result->'customer'->>'id' = '50000000-0000-4000-8000-000000000099')::text,
  (select count(*) from public.audit_logs a
    where a.company_id = '$COMPANY_ID'
      and a.actor_id = '$OTHER_USER'
      and a.action = 'window_check_project_create'
      and a.payload->>'customer_id' = '50000000-0000-4000-8000-000000000099')
) from call;
")"
test "$owner_reuse" = "reused|$OTHER_EMPLOYEE|준비|true|1"
echo 'own-assignee duplicate reuse + project create + audit: PASS'

echo 'Window Check quick customer registration behavior: PASS'
