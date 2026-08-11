import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/system/EmployeeContactsWorkspace.tsx", "utf8");
const actions = fs.readFileSync("app/actions/employee-contacts.ts", "utf8");
const data = fs.readFileSync("lib/crm/employee-contacts.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260805000001_employee_merge.sql", "utf8");
const masterMigration = fs.readFileSync("supabase/migrations/20260804000001_employee_master.sql", "utf8");
const assignmentGuardMigration = fs.readFileSync(
  "supabase/migrations/20260811060000_employee_assignment_guard.sql",
  "utf8",
);
const staffApprovals = fs.readFileSync("lib/crm/staff-approvals.ts", "utf8");
const page = fs.readFileSync("app/system/employees/page.tsx", "utf8");
const duplicateLookup = assignmentGuardMigration.slice(
  assignmentGuardMigration.indexOf("select e.id into v_duplicate"),
  assignmentGuardMigration.indexOf("if v_duplicate is not null"),
);

assert.match(workspace, /canMergeEmployees\s*\?\s*<button[\s\S]*직원 병합/);
for (const role of ["owner", "director", "admin"]) {
  assert.match(data, new RegExp(`role === ["']${role}["']`), `UI data missing ${role}`);
  assert.match(actions, new RegExp(`role === ["']${role}["']`), `server action missing ${role}`);
  assert.match(migration, new RegExp(`current_company_role\\(\\) in \\([^)]*['"]${role}['"]`), `RPC missing ${role}`);
}
assert.doesNotMatch(page, /StaffApprovalsWorkspace/, "Employee Master must not render approvals workspace");
assert.match(workspace, /직원 검색/);
for (const rpc of ["list_employee_master", "create_employee_master", "update_employee_master", "transfer_employee_assignments", "unlink_employee_login", "update_employee_login_role", "approve_staff_signup"]) {
  assert.match(masterMigration, new RegExp(`function public\\.${rpc}\\(`), `master migration missing ${rpc}`);
  assert.match(data, new RegExp(`["']${rpc}["']`), `migration check missing ${rpc}`);
}
for (const rpc of ["list_employee_merge_states", "get_employee_merge_impact", "merge_employees"]) {
  assert.match(migration, new RegExp(`function public\\.${rpc}\\(`), `merge migration missing ${rpc}`);
  assert.match(data, new RegExp(`["']${rpc}["']`), `migration check missing ${rpc}`);
}
assert.match(data, /access\.isAdmin/, "UI data missing admin/super_admin profile role");
assert.match(actions, /access\.isAdmin/, "server action missing admin/super_admin profile role");
assert.match(actions, /owner, director, admin 또는 super_admin/, "role error message must list every merge role");
assert.match(migration, /public\.is_admin\(\)/, "RPC missing admin/super_admin helper");
for (const reason of ["권한 부족", "본인 계정", "owner 대표 계정", "이미 병합된 직원", "양쪽 직원", "다른 회사"]) {
  assert.match(actions, new RegExp(reason), `missing user-facing merge reason: ${reason}`);
}

assert.match(
  assignmentGuardMigration,
  /create or replace function public\.approve_staff_signup\(\s*p_user_id uuid,\s*p_role text,\s*p_employee_id uuid default null,\s*p_employee_name text default null,\s*p_employee_title text default null,\s*p_team_id uuid default null\s*\)/i,
  "assignment guard must replace the current approve_staff_signup signature",
);
assert.match(
  assignmentGuardMigration,
  /pg_catalog\.pg_advisory_xact_lock\([\s\S]*?v_company_id::text/i,
  "approval RPC must serialize assignment decisions per company",
);
assert.match(
  assignmentGuardMigration,
  /if v_employee_id is not null then[\s\S]*?where e\.id = v_employee_id[\s\S]*?e\.company_id = v_company_id[\s\S]*?e\.is_active = true[\s\S]*?e\.merged_into_employee_id is null[\s\S]*?for update;/i,
  "linked employee must be same-company, active, unmerged, and row-locked",
);
assert.match(
  duplicateLookup,
  /select e\.id into v_duplicate[\s\S]*?where e\.company_id = v_company_id[\s\S]*?limit 1;/i,
  "new-employee duplicate lookup must preserve the company-wide employee Master policy",
);
assert.doesNotMatch(
  duplicateLookup,
  /e\.is_active|e\.merged_into_employee_id/i,
  "new-employee duplicate lookup must include inactive and merged permanent identities",
);
assert.match(
  assignmentGuardMigration,
  /기존 직원 Master가 발견되었습니다\. 직원 Master의 병합\/보관 상태를 확인하세요\./,
  "duplicate error must cover archived or merged permanent identities",
);
assert.match(
  assignmentGuardMigration,
  /select \* into v_profile[\s\S]*?where id = p_user_id[\s\S]*?for update;[\s\S]*?v_profile\.approval_status is distinct from 'pending'[\s\S]*?v_profile\.employee_id is not null/i,
  "stale or already-linked signup profiles must be rejected under a row lock",
);
assert.doesNotMatch(
  assignmentGuardMigration,
  /\b(?:delete\s+from|truncate|drop\s+(?:table|function)|grant|revoke)\b/i,
  "assignment guard migration must only replace the function and preserve its ACL/data",
);
assert.match(
  staffApprovals,
  /\.eq\("is_active", true\)[\s\S]*?\.is\("merged_into_employee_id", null\)/,
  "approval UI path must preflight active, unmerged employees",
);

console.log("Employee merge role and error-message tests passed");
