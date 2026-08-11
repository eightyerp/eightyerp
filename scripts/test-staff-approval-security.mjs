import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260811060000_employee_assignment_guard.sql";
const sql = readFileSync(migrationPath, "utf8");
const dataAccess = readFileSync("lib/crm/staff-approvals.ts", "utf8");
const actions = readFileSync("app/actions/staff-approvals.ts", "utf8");
const approvalsPage = readFileSync("app/system/approvals/page.tsx", "utf8");
const signupForm = readFileSync("components/auth/SignupForm.tsx", "utf8");
const demoProvisioner = readFileSync("scripts/ensure-demo-user.mjs", "utf8");

const mustContain = [
  /p\.active_company_id\s*=\s*v_company_id/i,
  /m\.company_id\s*=\s*v_company_id/i,
  /m\.status\s*=\s*'active'/i,
  /m\.role\s+in\s*\('owner',\s*'director'\)/i,
  /select m\.role\s+into v_actor_company_role/i,
  /p_role\s+not\s+in\s*\('admin',\s*'manager',\s*'staff'\)/i,
  /p_role\s*=\s*'admin'[\s\S]*v_actor_company_role\s+not\s+in\s*\('owner',\s*'director'\)/i,
  /other_membership\.company_id\s*<>\s*v_company_id/i,
  /other_membership\.status\s+in\s*\('pending',\s*'active',\s*'suspended'\)/i,
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
  /function public\.enforce_supported_auth_signup_type\(\)/i,
  /v_signup_type\s+not\s+in\s*\('company_owner',\s*'company_invite'\)/i,
  /new\.raw_app_meta_data\s*:=\s*pg_catalog\.jsonb_set[\s\S]*'onboarding_type'/i,
  /before insert on auth\.users[\s\S]*enforce_supported_auth_signup_type/i,
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

assert.match(
  sql,
  /if exists \([\s\S]*other_membership\.company_id <> v_company_id[\s\S]*other_membership\.status in \('pending', 'active', 'suspended'\)[\s\S]*raise exception '다른 회사와 비종결 관계[\s\S]*update public\.company_memberships[\s\S]*approval_status = 'rejected'/i,
  "Reject must fail before changing either row when another company is nonterminal",
);
assert.match(
  sql,
  /if v_profile\.role = 'super_admin'[\s\S]*별도 권한 이전 절차/i,
  "Deactivation must preserve super_admin accounts",
);
assert.match(
  sql,
  /다른 회사와 비종결 관계가 있는 계정은 전역 비활성화할 수 없습니다\./,
  "Deactivation must block every other nonterminal membership",
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
assert.match(
  approvalsPage,
  /승인 대기 멤버십/,
  "Approval page must describe the membership-bound recovery scope",
);
assert.match(
  signupForm,
  /signup_type:\s*isCompanyInvite\s*\?\s*"company_invite"\s*:\s*"company_owner"/,
  "Non-invite signup must create a company owner, never an orphan employee approval",
);
assert.match(
  signupForm,
  /직원은 회사 개설 후 발급되는 전용 초대 링크로 가입합니다\./,
  "Signup UI must direct employees to the company invitation path",
);
assert.match(
  demoProvisioner,
  /DEMO_INVITE_TOKEN_REQUIRED/,
  "Demo provisioning must not create a membership-less auth account",
);
assert.match(
  demoProvisioner,
  /signup_type:\s*"company_invite"[\s\S]*invite_token:\s*inviteToken/,
  "Demo provisioning must use a validated company invitation",
);

console.log("Staff approval company/role/ACL security contract: PASS");
