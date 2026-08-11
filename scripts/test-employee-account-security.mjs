import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260811070000_employee_master_company_scope_guard.sql",
  "utf8",
);
const workspace = readFileSync(
  "components/system/EmployeeContactsWorkspace.tsx",
  "utf8",
);
const dataAccess = readFileSync("lib/crm/employee-contacts.ts", "utf8");
const actions = readFileSync("app/actions/employee-contacts.ts", "utf8");

for (const rpc of [
  "list_employee_master",
  "create_employee_master",
  "update_employee_master",
  "transfer_employee_assignments",
  "unlink_employee_login",
  "update_employee_login_role",
  "get_employee_merge_impact",
  "merge_employees",
  "list_employee_merge_states",
  "update_employee_contact_profile",
]) {
  assert.match(
    migration,
    new RegExp(`create or replace function public\\.${rpc}\\(`, "i"),
    `Missing company-scoped replacement for ${rpc}`,
  );
  assert.match(
    migration,
    new RegExp(
      `revoke all[\\s\\S]*?on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated, service_role`,
      "i",
    ),
    `Missing explicit deny-first ACL for ${rpc}`,
  );
}

assert.doesNotMatch(
  migration,
  /public\.is_admin\(\)\s+or/i,
  "A global profile role must not bypass the current-company role",
);
assert.match(
  migration,
  /create or replace function public\.update_employee_contact_profile\([\s\S]*?v_company_role in \('owner', 'director', 'admin'\)[\s\S]*?v_my_employee_id is distinct from p_employee_id/i,
  "Contact editing must allow only a current-company manager or the exact employee",
);
const contactFunction = migration.slice(
  migration.indexOf("create or replace function public.update_employee_contact_profile"),
  migration.indexOf("-- Direct Data API writes"),
);
assert.doesNotMatch(
  contactFunction,
  /public\.is_admin\(/i,
  "Contact editing must not use the global profile-role shortcut",
);
for (const policy of [
  "employees_insert_admin",
  "employees_update_admin",
  "employees_delete_admin",
  "teams_write_admin",
]) {
  assert.match(
    migration,
    new RegExp(
      `create policy ${policy}[\\s\\S]*?company_id = public\\.current_company_id\\(\\)[\\s\\S]*?public\\.current_company_role\\(\\) in \\('owner', 'director', 'admin'\\)`,
      "i",
    ),
    `${policy} must enforce the current-company role hierarchy`,
  );
}
for (const policy of ["employees_select_erp", "teams_select_erp"]) {
  assert.match(
    migration,
    new RegExp(
      `create policy ${policy}[\\s\\S]*?public\\.is_erp_user\\(\\)[\\s\\S]*?company_id = public\\.current_company_id\\(\\)`,
      "i",
    ),
    `${policy} must restrict reads to the current company`,
  );
}
assert.match(
  migration,
  /p_role not in \('admin', 'manager', 'staff'\)/i,
  "Role updates must allow only company-safe profile roles",
);
assert.doesNotMatch(
  migration,
  /p_role not in \([^)]*super_admin/i,
  "Employee Master must never grant super_admin",
);
assert.match(
  migration,
  /v_membership\.role in \('owner', 'director'\)[\s\S]*별도 권한 이전 절차/i,
  "Owner/director accounts must use a separate governance flow",
);
assert.match(
  migration,
  /other_membership\.company_id <> v_company_id[\s\S]*other_membership\.status in \('pending', 'active', 'suspended'\)/i,
  "Global profile mutations must reject accounts used by another company",
);
assert.match(
  migration,
  /update public\.company_memberships[\s\S]*status = 'pending'[\s\S]*update public\.profiles[\s\S]*approval_status = 'pending'/i,
  "Unlink must reset membership and profile together",
);
assert.match(
  migration,
  /team_row\.company_id = v_company_id[\s\S]*for key share/i,
  "Employee writes must lock and validate teams in the current company",
);
for (const table of [
  "customers",
  "quotes",
  "customer_schedules",
  "project_process_schedules",
]) {
  assert.match(
    migration,
    new RegExp(
      `update public\\.${table}[\\s\\S]*?company_id = v_company_id`,
      "i",
    ),
    `${table} transfer must be restricted to the current company`,
  );
}
assert.match(
  migration,
  /v_target_membership\.role in \('owner', 'director'\)[\s\S]*v_keep_profile_id is distinct from v_target_profile\.id/i,
  "Merge must preserve a target owner/director login",
);
assert.match(
  migration,
  /status = case[\s\S]*'suspended'[\s\S]*'pending'[\s\S]*update public\.profiles/i,
  "Merge must update discarded membership and profile state atomically",
);

assert.doesNotMatch(
  workspace,
  /<option value="super_admin">/,
  "Employee Master UI must not offer super_admin",
);
assert.match(workspace, /canManageLoginAccounts/);
assert.match(workspace, /canAssignAdminRole/);
assert.doesNotMatch(dataAccess, /access\.isAdmin/);
assert.doesNotMatch(actions, /access\.isAdmin/);
assert.match(actions, /\["admin", "manager", "staff"\]\.includes/);

console.log("Employee account and company-scope security contract: PASS");
