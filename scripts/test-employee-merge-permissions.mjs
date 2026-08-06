import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/system/EmployeeContactsWorkspace.tsx", "utf8");
const actions = fs.readFileSync("app/actions/employee-contacts.ts", "utf8");
const data = fs.readFileSync("lib/crm/employee-contacts.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260805000001_employee_merge.sql", "utf8");
const masterMigration = fs.readFileSync("supabase/migrations/20260804000001_employee_master.sql", "utf8");
const page = fs.readFileSync("app/system/employees/page.tsx", "utf8");

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

console.log("Employee merge role and error-message tests passed");
