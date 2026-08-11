import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260811060000_employee_assignment_guard.sql";
const sql = readFileSync(migrationPath, "utf8");
const dataAccess = readFileSync("lib/crm/staff-approvals.ts", "utf8");
const actions = readFileSync("app/actions/staff-approvals.ts", "utf8");
const approvalsPage = readFileSync("app/system/approvals/page.tsx", "utf8");

const mustContain = [
  /p\.active_company_id\s*=\s*v_company_id/i,
  /m\.company_id\s*=\s*v_company_id/i,
  /m\.status\s*=\s*'active'/i,
  /m\.role\s+in\s*\('owner',\s*'director'\)/i,
  /select m\.role\s+into v_actor_company_role/i,
  /p_role\s+not\s+in\s*\('admin',\s*'manager',\s*'staff'\)/i,
  /p_role\s*=\s*'admin'[\s\S]*v_actor_company_role\s+not\s+in\s*\('owner',\s*'director'\)/i,
  /other_membership\.company_id\s*<>\s*v_company_id/i,
  /other_membership\.status\s+in\s*\('pending',\s*'active'\)/i,
  /team_row\.company_id\s*=\s*v_company_id/i,
  /e\.company_id\s*=\s*v_company_id/i,
  /e\.is_active\s*=\s*true/i,
  /e\.merged_into_employee_id\s+is\s+null/i,
  /update public\.company_memberships/i,
  /active_company_id\s*=\s*v_company_id/i,
  /function public\.list_pending_company_signups\(\)/i,
  /function public\.list_managed_company_profiles\(\)/i,
  /function public\.reject_staff_signup\(\s*p_user_id uuid/i,
  /function public\.deactivate_staff_user\(p_user_id uuid\)/i,
  /function public\.profiles_enforce_security\(\)/i,
  /old\.id\s+is\s+distinct\s+from\s+auth\.uid\(\)[\s\S]*public\.current_company_role\(\)\s+in\s*\('owner',\s*'director',\s*'admin'\)/i,
  /new\.active_company_id\s+is\s+distinct\s+from\s+old\.active_company_id/i,
  /profiles_select_own_or_admin[\s\S]*using \(id = auth\.uid\(\)\)/i,
  /revoke all[\s\S]*from public, anon, authenticated, service_role/i,
  /grant execute[\s\S]*to authenticated/i,
];

for (const pattern of mustContain) {
  assert.match(sql, pattern, `Missing approval security contract: ${pattern}`);
}

const employeeLock = sql.indexOf("from public.employees e");
const profileLock = sql.indexOf("from public.profiles\n  where id = p_user_id");
assert.ok(employeeLock >= 0, "Employee row lock query is missing");
assert.ok(profileLock >= 0, "Signup profile row lock query is missing");
assert.ok(
  employeeLock < profileLock,
  "Approval must lock the employee before the profile to match merge lock order",
);

assert.doesNotMatch(
  sql,
  /grant execute[\s\S]{0,160}to\s+(?:public|anon|service_role)/i,
  "Privileged approval RPC must not be executable by public, anon, or service_role",
);

assert.doesNotMatch(
  sql,
  /p_role\s+not\s+in\s*\([^)]*super_admin/i,
  "Employee approval must never allow granting super_admin",
);

assert.match(dataAccess, /rpc\(\s*"list_pending_company_signups"/);
assert.match(dataAccess, /rpc\(\s*"list_managed_company_profiles"/);
assert.doesNotMatch(
  dataAccess,
  /\.from\("profiles"\)/,
  "Approval account lists must use company-scoped RPCs",
);
assert.match(actions, /const ROLES: UserRole\[\] = \["admin", "manager", "staff"\]/);
assert.doesNotMatch(
  actions,
  /const ROLES:[^\n]*super_admin/,
  "Server Action must reject super_admin grants",
);
assert.match(
  approvalsPage,
  /companyRole !== "owner" && companyRole !== "director"/,
  "Approval page must be restricted to company owner/director",
);

console.log("Staff approval company/role/ACL security contract: PASS");
