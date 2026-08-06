import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/system/EmployeeContactsWorkspace.tsx", "utf8");
const actions = fs.readFileSync("app/actions/employee-contacts.ts", "utf8");
const data = fs.readFileSync("lib/crm/employee-contacts.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260805000001_employee_merge.sql", "utf8");

assert.match(workspace, /canMergeEmployees\s*\?\s*<button[\s\S]*직원 병합/);
for (const role of ["owner", "admin"]) {
  assert.match(data, new RegExp(`role === ["']${role}["']`), `UI data missing ${role}`);
  assert.match(actions, new RegExp(`role === ["']${role}["']`), `server action missing ${role}`);
  assert.match(migration, new RegExp(`current_company_role\\(\\) in \\([^)]*['"]${role}['"]`), `RPC missing ${role}`);
}
assert.match(data, /access\.isAdmin/, "UI data missing admin/super_admin profile role");
assert.match(actions, /access\.isAdmin/, "server action missing admin/super_admin profile role");
assert.match(migration, /public\.is_admin\(\)/, "RPC missing admin/super_admin helper");
for (const reason of ["권한 부족", "본인 계정", "owner 대표 계정", "이미 병합된 직원", "양쪽 직원", "다른 회사"]) {
  assert.match(actions, new RegExp(reason), `missing user-facing merge reason: ${reason}`);
}

console.log("Employee merge role and error-message tests passed");
