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

function extractSqlFunction(source, functionName) {
  const start = source.indexOf(
    `create or replace function public.${functionName}(`,
  );
  assert.ok(start >= 0, `${functionName} replacement is missing`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(end >= 0, `${functionName} replacement end is missing`);
  return source.slice(start, end + 4);
}

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

const employeeAuthorizationBodies = [
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
  "can_write_employee_business_card",
].map((name) => extractSqlFunction(migration, name)).join("\n");
assert.doesNotMatch(
  employeeAuthorizationBodies,
  /public\.is_admin\(\)/i,
  "Employee authorization RPCs must not use the global profile-role helper",
);
assert.match(
  migration,
  /create or replace function public\.update_employee_contact_profile\([\s\S]*?v_company_role in \('owner', 'director', 'admin'\)[\s\S]*?v_my_employee_id is distinct from p_employee_id/i,
  "Contact editing must allow only a current-company manager or the exact employee",
);
const contactFunction = extractSqlFunction(
  migration,
  "update_employee_contact_profile",
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
]) {
  assert.match(
    migration,
    new RegExp(`drop policy if exists ${policy}`, "i"),
    `${policy} must be removed in RPC-only mode`,
  );
  assert.doesNotMatch(
    migration,
    new RegExp(`create policy ${policy}`, "i"),
    `${policy} must not be recreated`,
  );
}
assert.match(
  migration,
  /revoke insert, update, delete[\s\S]*on table public\.employees[\s\S]*from public, anon, authenticated/i,
  "Direct employee writes must be revoked",
);
assert.match(
  migration,
  /create policy teams_write_admin[\s\S]*?company_id = public\.current_company_id\(\)[\s\S]*?public\.current_company_role\(\) in \('owner', 'director', 'admin'\)/i,
  "Team writes must enforce the current-company role hierarchy",
);
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
  "projects",
  "contracts",
  "employee_tasks",
  "customer_quotes",
  "schedule_alert_events",
]) {
  assert.match(
    migration,
    new RegExp(`['"]${table}['"]`, "i"),
    `${table} must be in the assignment allowlist`,
  );
}
assert.match(
  migration,
  /has_company_id[\s\S]*assigned_employee_id = \$1[\s\S]*assigned_employee_id = \$2/i,
  "Assignment transfer must handle both company_id and legacy tenantless tables",
);
assert.match(
  migration,
  /schedule_alert_events[\s\S]*status = ''pending''/i,
  "Only pending schedule alerts should transfer",
);
const assignmentGuard = extractSqlFunction(
  migration,
  "assert_active_assignment_employee",
);
assert.match(
  assignmentGuard,
  /employee_row\.is_active = true[\s\S]*employee_row\.merged_into_employee_id is null[\s\S]*for key share/i,
  "Child assignment writes must lock and require an active, unmerged employee",
);
for (const tenantSource of ["company_id", "customer_id", "project_id", "quote_id"]) {
  assert.match(
    assignmentGuard,
    new RegExp(tenantSource, "i"),
    `Assignment guard must validate ${tenantSource}`,
  );
}
assert.match(
  assignmentGuard,
  /deleted_at[\s\S]*schedule_alert_events[\s\S]*pending/i,
  "Soft-deleted rows and processed alert history must be handled explicitly",
);
assert.match(
  migration,
  /revoke all on function public\.assert_active_assignment_employee\(jsonb, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  "Assignment validation helper must not be directly executable",
);
assert.match(
  migration,
  /create trigger assignment_employee_guard before insert or update of[\s\S]*execute function public\.enforce_active_assignment_employee\(\)/i,
  "Every available assignment table must receive the row guard trigger",
);
assert.match(
  migration,
  /create trigger assignment_employee_guard[\s\S]*bool_and\(public\.assert_active_assignment_employee/i,
  "Trigger installation must be followed by a locked live-row preflight",
);
const tokenScopeGuard = extractSqlFunction(
  migration,
  "assert_customer_access_token_scope",
);
assert.match(
  tokenScopeGuard,
  /public\.projects[\s\S]*project_row\.customer_id = \$2[\s\S]*public\.project_material_sets[\s\S]*set_row\.project_id = \$2[\s\S]*set_row\.customer_id = \$3[\s\S]*for share/i,
  "Portal tokens must bind and lock customer, project, and optional set",
);
assert.match(
  migration,
  /revoke all on function public\.assert_customer_access_token_scope\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i,
  "Portal token validation must not be directly executable",
);
for (const constraint of [
  "projects_customer_company_scope_fkey",
  "project_material_sets_project_customer_scope_fkey",
  "project_materials_project_customer_scope_fkey",
  "project_materials_customer_company_scope_fkey",
  "project_materials_set_scope_fkey",
  "customer_access_tokens_project_customer_scope_fkey",
  "customer_access_tokens_set_scope_fkey",
  "material_approvals_material_scope_fkey",
  "material_approvals_project_customer_scope_fkey",
  "material_comments_material_scope_fkey",
  "material_comments_project_customer_scope_fkey",
  "material_change_requests_project_customer_scope_fkey",
  "material_approval_versions_set_scope_fkey",
  "material_approval_versions_project_customer_scope_fkey",
]) {
  assert.match(
    migration,
    new RegExp(constraint, "i"),
    `${constraint} must durably bind the material tenant graph`,
  );
}
for (const constraint of [
  "quotes_customer_company_scope_fkey",
  "contracts_customer_company_scope_fkey",
  "contracts_project_customer_scope_fkey",
  "contracts_quote_customer_company_scope_fkey",
  "contracts_root_tenant_scope_fkey",
  "contracts_parent_tenant_scope_fkey",
  "execution_budgets_contract_scope_fkey",
  "execution_budget_items_budget_company_scope_fkey",
]) {
  assert.match(
    migration,
    new RegExp(constraint, "i"),
    `${constraint} must bind lifecycle children to the root tenant`,
  );
}
assert.match(
  migration,
  /create unique index if not exists contracts_id_tenant_scope_uidx[\s\S]*?id, company_id, customer_id, project_id/i,
  "Contract roots must expose an exact tenant-scoped FK target",
);
assert.match(
  migration,
  /create or replace function public\.confirm_contract_lifecycle_child\([\s\S]*?from public\.contracts root_row[\s\S]*?for update[\s\S]*?v_root\.company_id is distinct from v_child\.company_id[\s\S]*?v_root\.customer_id is distinct from v_child\.customer_id[\s\S]*?v_root\.project_id is distinct from v_child\.project_id/i,
  "Contract confirmation must lock and revalidate the root tenant scope",
);
assert.match(
  migration,
  /revoke all on function public\.confirm_contract_lifecycle_child\(uuid,text\) from public, anon, authenticated, service_role/i,
  "The internal contract confirmation helper must not be directly executable",
);
assert.match(
  migration,
  /create or replace function public\.create_contract_lifecycle_child\([\s\S]*?from public\.contracts root_row[\s\S]*?for update[\s\S]*?v_root\.status not in \('confirmed', 'active'\)[\s\S]*?from public\.contracts pending_child[\s\S]*?pending_child\.status = 'draft'/i,
  "Lifecycle creation must lock an active root and reject another pending child",
);
assert.match(
  migration,
  /v_root\.project_id is distinct from v_child\.project_id[\s\S]*?v_root\.status is distinct from \([\s\S]*?'amending'[\s\S]*?'adding'/i,
  "Lifecycle confirmation must require the matching pending root state",
);
assert.match(
  migration,
  /revoke all on function public\.create_contract_lifecycle_child\(uuid,jsonb,text\) from public, anon, authenticated, service_role/i,
  "The internal lifecycle creation helper must not be directly executable",
);
assert.match(
  migration,
  /create or replace function public\.confirm_contract\(p_contract_id uuid\)[\s\S]*?v_contract\.contract_kind is distinct from 'original'[\s\S]*?v_contract\.root_contract_id is not null[\s\S]*?v_contract\.parent_contract_id is not null/i,
  "Generic confirmation must be restricted to original contracts",
);
assert.match(
  migration,
  /revoke all on function public\.confirm_contract\(uuid\) from public, anon, authenticated, service_role[\s\S]*?grant execute on function public\.confirm_contract\(uuid\) to authenticated/i,
  "Original-contract confirmation must expose only its authenticated wrapper",
);
assert.match(
  migration,
  /revoke insert, update, delete on table public\.contracts from public, anon, authenticated/i,
  "Contract lifecycle writes must be RPC-only",
);
for (const table of ["execution_budgets", "execution_budget_items"]) {
  assert.match(
    migration,
    new RegExp(
      `revoke insert, update, delete on table public\\.${table} from public, anon, authenticated`,
      "i",
    ),
    `${table} lifecycle writes must be RPC-only`,
  );
}
for (const stalePolicy of [
  "projects_select_erp",
  "projects_insert_erp",
  "projects_update_erp",
  "staff_project_materials_select",
  "staff_project_materials_insert",
  "staff_project_materials_update",
]) {
  assert.match(
    migration,
    new RegExp(`drop policy if exists ["']${stalePolicy}["']`, "i"),
    `${stalePolicy} must not remain as a permissive bypass`,
  );
}
assert.match(
  migration,
  /do \$is_admin_widening_preflight\$[\s\S]*Storage exact inventory[\s\S]*\$is_admin_widening_preflight\$;[\s\S]*create or replace function public\.is_admin\(\)/i,
  "Tenant and Storage policy checks must abort before is_admin widening",
);
assert.match(
  migration,
  /create or replace function public\._assert_material_token\(p_token text\)[\s\S]*public\.assert_customer_access_token_scope[\s\S]*returning \* into v_token/i,
  "Every portal token use must revalidate the live customer/project/set graph",
);
assert.match(
  migration,
  /revoke all on function public\._assert_material_token\(text\) from public, anon, authenticated, service_role/i,
  "The internal material token helper must not be directly executable",
);
assert.doesNotMatch(
  migration,
  /create policy "v1_material_storage_(?:select|insert)"[\s\S]{0,120}?to authenticated, anon/i,
  "Anonymous Storage access must not treat any valid project token as a bearer credential",
);
for (const rpc of [
  "update_employee_master",
  "transfer_employee_assignments",
  "merge_employees",
]) {
  assert.match(
    extractSqlFunction(migration, rpc),
    /for update/i,
    `${rpc} must keep the employee FOR UPDATE lock paired with child guards`,
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
assert.match(
  migration,
  /coalesce\(v_source_profile\.role, ''\) = 'super_admin'[\s\S]*coalesce\(v_target_profile\.role, ''\) = 'super_admin'/i,
  "Merge must reject super_admin on either side before keep resolution",
);
assert.match(
  migration,
  /v_actor_company_role = 'admin'[\s\S]*v_source_membership\.role[\s\S]*v_target_membership\.role[\s\S]*owner·director만 병합/i,
  "A peer admin must not move another admin login during merge",
);

assert.doesNotMatch(
  workspace,
  /<option value="super_admin">/,
  "Employee Master UI must not offer super_admin",
);
assert.match(workspace, /canManageLoginAccounts/);
assert.match(workspace, /canAssignAdminRole/);
assert.match(workspace, /프로젝트·계약·직원 할 일·레거시 견적·대기 알림/);
assert.doesNotMatch(workspace, /담당 업무가 없어 안전하게 비활성화/);
assert.doesNotMatch(dataAccess, /access\.isAdmin/);
assert.doesNotMatch(actions, /access\.isAdmin/);
assert.match(actions, /\["admin", "manager", "staff"\]\.includes/);

console.log("Employee account and company-scope security contract: PASS");
