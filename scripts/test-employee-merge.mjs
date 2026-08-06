import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260805000001_employee_merge.sql", "utf8");
const preflight = fs.readFileSync("supabase/verifications/20260805000001_employee_merge_preflight.sql", "utf8");
const verify = fs.readFileSync("supabase/verifications/20260805000001_employee_merge_verify.sql", "utf8");
const operationalVerify = fs.readFileSync("supabase/verifications/20260805000002_employee_merge_operational_verify.sql", "utf8");

assert.match(migration, /create or replace function public\.merge_employees/i);
assert.match(migration, /for update/i, "employee/profile rows must be locked");
assert.match(migration, /pg_constraint[\s\S]*confrelid = 'public\.employees'::regclass/i, "FKs must be catalog-discovered");
assert.match(migration, /v_source_after <> 0 or v_target_after <> v_before_source \+ v_before_target/i, "per-reference conservation check missing");
assert.match(migration, /merged_into_employee_id = p_target_employee_id/i);
assert.match(migration, /is_active = false/i);
assert.match(migration, /employee_merge_logs/i);
assert.match(migration, /두 직원 모두 로그인 계정이 있습니다/);
assert.match(migration, /role = 'owner'/i);
assert.match(migration, /복합 employees FK가 발견되어 안전을 위해 병합을 중단합니다/);
assert.match(migration, /id = auth\.uid\(\) and employee_id = p_source_employee_id/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.employees/i, "employee DELETE is forbidden");
assert.doesNotMatch(migration, /truncate\s+/i, "TRUNCATE is forbidden");

assert.match(operationalVerify, /employee_merge_go/);
assert.match(operationalVerify, /unsupported_composite_fks/);
assert.match(operationalVerify, /migration_applied/);
assert.match(operationalVerify, /missing_columns/);

const migrationColumns = [...migration.matchAll(/add\s+column\s+if\s+not\s+exists\s+([a-z_][a-z0-9_]*)/gi)]
  .map((match) => match[1])
  .filter((name) => ["merged_into_employee_id", "merged_at", "merged_by"].includes(name))
  .sort();
const verifyColumns = [...operationalVerify.matchAll(/\('(merged_into_employee_id|merged_at|merged_by)'::text\)/g)]
  .map((match) => match[1])
  .sort();
assert.deepEqual([...new Set(verifyColumns)], [...new Set(migrationColumns)], "migration/verify employee columns differ");

const migrationFunctions = [...migration.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi)]
  .map((match) => match[1])
  .filter((name) => ["get_employee_merge_impact", "merge_employees", "list_employee_merge_states"].includes(name))
  .sort();
for (const functionName of migrationFunctions) {
  assert.match(operationalVerify, new RegExp(`public\\.${functionName}\\(`), `verify missing function ${functionName}`);
}

const migrationTriggers = [...migration.matchAll(/create\s+trigger\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]);
for (const triggerName of migrationTriggers) {
  assert.match(operationalVerify, new RegExp(`\\b${triggerName}\\b`), `verify missing trigger ${triggerName}`);
}
for (const [name, sql] of [["preflight", preflight], ["verify", verify], ["operational verify", operationalVerify]]) {
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|create|drop|truncate)\b\s+(table|into|from|public\.)/i, `${name} must remain read-only`);
}

console.log("Employee merge safety tests passed");
