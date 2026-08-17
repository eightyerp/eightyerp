#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${1:-}"
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1)"
fi
test -n "$DB_CONTAINER"

readonly INSPECTOR_USER='10000000-0000-4000-8000-000000000001'
readonly OTHER_USER='10000000-0000-4000-8000-000000000002'
readonly ADMIN_USER='10000000-0000-4000-8000-000000000003'
readonly COMPANY_ID='20000000-0000-4000-8000-000000000001'
readonly INSPECTOR_EMPLOYEE='30000000-0000-4000-8000-000000000001'
readonly OTHER_EMPLOYEE='30000000-0000-4000-8000-000000000002'
readonly ADMIN_EMPLOYEE='30000000-0000-4000-8000-000000000003'
readonly INSPECTION_ID='70000000-0000-4000-8000-000000000001'

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

diagnostic_as() {
  local label="$1"
  local user_id="$2"
  local output
  output="$(query_as "$user_id" "select concat_ws('|', coalesce(auth.uid()::text,'NULL'), coalesce(public.current_company_id()::text,'NULL'), coalesce(public.current_employee_id()::text,'NULL'), coalesce(public.current_company_role(),'NULL'), erp_private.can_access_window_inspection('$INSPECTION_ID')::text, erp_private.can_write_window_inspection('$INSPECTION_ID')::text, (select count(*) from public.window_inspections where id='$INSPECTION_ID')::text);")"
  echo "$label=$output" >&2
  printf '%s' "$output"
}

inspector_diag="$(diagnostic_as inspector "$INSPECTOR_USER")"
other_diag="$(diagnostic_as other "$OTHER_USER")"
admin_diag="$(diagnostic_as admin "$ADMIN_USER")"

expected_inspector="$INSPECTOR_USER|$COMPANY_ID|$INSPECTOR_EMPLOYEE|employee|true|true|1"
expected_other="$OTHER_USER|$COMPANY_ID|$OTHER_EMPLOYEE|employee|false|false|0"
expected_admin="$ADMIN_USER|$COMPANY_ID|$ADMIN_EMPLOYEE|admin|true|false|1"

echo "Expected inspector=$expected_inspector"
echo "Expected other=$expected_other"
echo "Expected admin=$expected_admin"
test "$inspector_diag" = "$expected_inspector"
test "$other_diag" = "$expected_other"
test "$admin_diag" = "$expected_admin"

snapshot_insert_sql() {
  local user_id="$1"
  local employee_id="$2"
  cat <<SQL
insert into public.window_inspection_snapshots (
  inspection_id, company_id, snapshot_version, schema_version, payload_json,
  payload_sha256, approval_input_sha256, approved_by_user_id,
  approved_by_employee_id, approved_at
) values (
  '$INSPECTION_ID', '$COMPANY_ID', 1,
  'window-check-approved-v1', '{"serverPayloadSchemaVersion":"window-check-approved-v1"}'::jsonb,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '$user_id', '$employee_id', now()
);
SQL
}

# Actual inspector can create the immutable snapshot.
query_as "$INSPECTOR_USER" "$(snapshot_insert_sql "$INSPECTOR_USER" "$INSPECTOR_EMPLOYEE")"
echo 'inspector snapshot INSERT: PASS'

expect_insert_denied() {
  local label="$1"
  local user_id="$2"
  local employee_id="$3"
  local stdout_file="/tmp/${label}-insert.out"
  local stderr_file="/tmp/${label}-insert.err"
  if query_as "$user_id" "$(snapshot_insert_sql "$user_id" "$employee_id")" >"$stdout_file" 2>"$stderr_file"; then
    echo "$label unexpectedly inserted inspector snapshot"
    cat "$stdout_file" || true
    exit 1
  fi
  echo "$label snapshot INSERT was denied as expected:"
  cat "$stderr_file" || true
  if grep -Eqi 'syntax error|does not exist|connection|could not connect' "$stderr_file"; then
    echo "$label failed for a test-harness/schema reason instead of authorization"
    exit 1
  fi
  echo "$label snapshot INSERT denial: PASS"
}

expect_insert_denied other "$OTHER_USER" "$OTHER_EMPLOYEE"
expect_insert_denied admin "$ADMIN_USER" "$ADMIN_EMPLOYEE"

echo 'Window Check operational RLS behavior: PASS'
