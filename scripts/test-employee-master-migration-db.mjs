import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

function extractDoBlock(source, tag) {
  const startMarker = `do $${tag}$`;
  const endMarker = `\n$${tag}$;`;
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `Missing ${tag} DO block`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end >= 0, `Missing ${tag} DO block end`);
  return source.slice(start, end + endMarker.length);
}

const db = new PGlite();
await db.waitReady;
const companyA = "10000000-0000-0000-0000-000000000001";
const companyB = "10000000-0000-0000-0000-000000000002";
const employeeA = "20000000-0000-0000-0000-000000000001";
const employeeB = "20000000-0000-0000-0000-000000000002";
const protectedEmployee = "20000000-0000-0000-0000-000000000006";
const transferTarget = "20000000-0000-0000-0000-000000000007";
const adminProtectedEmployee = "20000000-0000-0000-0000-000000000008";
const superProtectedEmployee = "20000000-0000-0000-0000-000000000009";
const teamA = "30000000-0000-0000-0000-000000000001";
const teamB = "30000000-0000-0000-0000-000000000002";
const ownerProfile = "40000000-0000-0000-0000-000000000001";
const actorProfile = "40000000-0000-0000-0000-000000000002";
const unlinkedActor = "40000000-0000-0000-0000-000000000003";
const adminProtectedProfile = "40000000-0000-0000-0000-000000000004";
const superProtectedProfile = "40000000-0000-0000-0000-000000000005";
const ownerMembership = "50000000-0000-0000-0000-000000000001";
const customerA = "60000000-0000-0000-0000-000000000001";
const customerB = "60000000-0000-0000-0000-000000000002";
const projectA = "70000000-0000-0000-0000-000000000001";
const projectB = "70000000-0000-0000-0000-000000000002";
const materialSetA = "71000000-0000-0000-0000-000000000001";
const materialSetB = "71000000-0000-0000-0000-000000000002";
const contractRootA = "73000000-0000-0000-0000-000000000001";
const contractRootB = "73000000-0000-0000-0000-000000000002";
const contractChildA = "73000000-0000-0000-0000-000000000003";
const quoteA = "74000000-0000-0000-0000-000000000001";
const quoteB = "74000000-0000-0000-0000-000000000002";
const budgetA = "75000000-0000-0000-0000-000000000001";
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.auth_uid', true), '')::uuid
  $$;
  create table auth.users(id uuid primary key, email text, last_sign_in_at timestamptz);
  create table public.employees(
    id uuid primary key default gen_random_uuid(), company_id uuid, team_id uuid, name text, title text,
    phone text, email text, business_card_path text,
    show_business_card_on_quote boolean, is_active boolean, sort_order integer,
    created_at timestamptz, updated_at timestamptz,
    merged_into_employee_id uuid, merged_at timestamptz, merged_by uuid
  );
  create table public.profiles(
    id uuid primary key, employee_id uuid, active_company_id uuid, role text,
    permissions jsonb, is_active boolean, is_approved boolean,
    approval_status text, approved_at timestamptz, approved_by uuid,
    rejected_at timestamptz, rejection_reason text, email text, full_name text,
    updated_at timestamptz
  );
  create table public.company_memberships(
    id uuid primary key, company_id uuid, user_id uuid, employee_id uuid,
    role text, status text, reviewed_by uuid, reviewed_at timestamptz,
    rejection_reason text, updated_at timestamptz
  );
  create table public.teams(id uuid primary key, company_id uuid);
  create table public.customers(id uuid, company_id uuid, assigned_employee_id uuid references public.employees(id), deleted_at timestamptz, updated_at timestamptz);
  create table public.quotes(
    id uuid, company_id uuid, customer_id uuid, assigned_employee_id uuid references public.employees(id),
    created_by uuid, deleted_at timestamptz, updated_at timestamptz
  );
  create table public.customer_schedules(id uuid, company_id uuid, assigned_employee_id uuid references public.employees(id), deleted_at timestamptz, updated_at timestamptz);
  create table public.project_process_schedules(id uuid, company_id uuid, assigned_employee_id uuid references public.employees(id), deleted_at timestamptz, updated_at timestamptz);
  create table public.projects(id uuid, company_id uuid, customer_id uuid, assigned_employee_id uuid references public.employees(id), deleted_at timestamptz, updated_at timestamptz);
  create table public.contracts(
    id uuid primary key, company_id uuid, customer_id uuid, project_id uuid,
    quote_id uuid,
    assigned_employee_id uuid references public.employees(id),
    root_contract_id uuid, parent_contract_id uuid,
    contract_kind text, status text,
    confirmed_at timestamptz, confirmed_by uuid, updated_by uuid,
    cumulative_contract_amount bigint, contract_amount bigint,
    change_reason text, updated_at timestamptz
  );
  create function public.confirm_contract_lifecycle_child(uuid, text)
  returns jsonb language sql security definer set search_path = public as $$
    select jsonb_build_object('ok', true)
  $$;
  create function public.create_contract_lifecycle_child(uuid, jsonb, text)
  returns jsonb language sql security definer set search_path = public as $$
    select jsonb_build_object('ok', true)
  $$;
  create function public.confirm_contract(uuid)
  returns jsonb language sql security definer set search_path = public as $$
    select jsonb_build_object('ok', true)
  $$;
  create function public.confirm_contract_amendment(uuid)
  returns jsonb language sql security definer set search_path = public as $$
    select public.confirm_contract_lifecycle_child($1, 'amendment')
  $$;
  create function public.confirm_contract_addition(uuid)
  returns jsonb language sql security definer set search_path = public as $$
    select public.confirm_contract_lifecycle_child($1, 'addition')
  $$;
  create function public.create_contract_amendment(uuid, jsonb)
  returns jsonb language sql security definer set search_path = public as $$
    select public.create_contract_lifecycle_child($1, $2, 'amendment')
  $$;
  create function public.create_contract_addition(uuid, jsonb)
  returns jsonb language sql security definer set search_path = public as $$
    select public.create_contract_lifecycle_child($1, $2, 'addition')
  $$;
  revoke all on function public.confirm_contract_lifecycle_child(uuid, text)
    from public, anon, authenticated, service_role;
  revoke all on function public.create_contract_lifecycle_child(uuid, jsonb, text)
    from public, anon, authenticated, service_role;
  revoke all on function public.confirm_contract(uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.confirm_contract_amendment(uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.confirm_contract_addition(uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.create_contract_amendment(uuid, jsonb)
    from public, anon, authenticated, service_role;
  revoke all on function public.create_contract_addition(uuid, jsonb)
    from public, anon, authenticated, service_role;
  grant execute on function public.confirm_contract_amendment(uuid)
    to authenticated;
  grant execute on function public.confirm_contract_addition(uuid)
    to authenticated;
  grant execute on function public.create_contract_amendment(uuid, jsonb)
    to authenticated;
  grant execute on function public.create_contract_addition(uuid, jsonb)
    to authenticated;
  grant execute on function public.confirm_contract(uuid)
    to authenticated;
  create table public.execution_budgets(
    id uuid primary key, company_id uuid, contract_id uuid,
    project_id uuid, customer_id uuid, status text
  );
  create table public.execution_budget_items(
    id uuid primary key, company_id uuid, execution_budget_id uuid
  );
  create table public.employee_tasks(
    id uuid, assigned_employee_id uuid references public.employees(id), customer_id uuid, project_id uuid,
    quote_id uuid, deleted_at timestamptz, updated_at timestamptz
  );
  create table public.customer_quotes(
    id uuid, customer_id uuid, assigned_employee_id uuid references public.employees(id),
    deleted_at timestamptz, updated_at timestamptz
  );
  create table public.schedule_alert_events(
    id uuid, company_id uuid, assigned_employee_id uuid references public.employees(id),
    status text not null, updated_at timestamptz
  );
  create table public.project_materials(
    id uuid primary key, company_id uuid, customer_id uuid,
    project_id uuid, set_id uuid, deleted_at timestamptz
  );
  create table public.project_material_sets(
    id uuid primary key, customer_id uuid not null, project_id uuid not null,
    deleted_at timestamptz
  );
  create table public.customer_access_tokens(
    id uuid primary key default gen_random_uuid(), token text unique,
    customer_id uuid not null, project_id uuid not null, set_id uuid,
    purpose text not null default 'materials', expires_at timestamptz not null,
    revoked_at timestamptz, last_accessed_at timestamptz
  );
  create function public._assert_material_token(p_token text)
  returns public.customer_access_tokens
  language plpgsql security definer set search_path = public as $$
  declare token_row public.customer_access_tokens;
  begin
    select * into token_row from public.customer_access_tokens
    where token = p_token and revoked_at is null and expires_at > now();
    if not found then raise exception 'legacy invalid token'; end if;
    return token_row;
  end
  $$;
  create table public.material_approvals(
    id uuid primary key default gen_random_uuid(), material_id uuid,
    customer_id uuid not null, project_id uuid not null, access_token_id uuid
  );
  create table public.material_comments(
    id uuid primary key default gen_random_uuid(), material_id uuid not null,
    customer_id uuid not null, project_id uuid not null, access_token_id uuid
  );
  create table public.material_change_requests(
    id uuid primary key default gen_random_uuid(), customer_id uuid not null,
    project_id uuid not null, set_id uuid, access_token_id uuid
  );
  create table public.material_approval_versions(
    id uuid primary key default gen_random_uuid(), set_id uuid not null,
    customer_id uuid not null, project_id uuid not null, access_token_id uuid
  );
  create table public.employee_master_events(
    id uuid, company_id uuid, employee_id uuid, event_type text, actor_id uuid,
    before_data jsonb, after_data jsonb, detail jsonb
  );
  create table public.employee_merge_logs(
    id uuid default gen_random_uuid(), company_id uuid, source_employee_id uuid,
    target_employee_id uuid, transferred_counts jsonb, login_resolution jsonb,
    before_totals jsonb, after_totals jsonb, executed_by uuid
  );
  create unique index profiles_employee_login_uidx
    on public.profiles(employee_id) where employee_id is not null;
  create function public.prevent_employee_delete()
  returns trigger language plpgsql as $$ begin return old; end $$;
  create trigger employees_prevent_delete
    before delete on public.employees
    for each row execute function public.prevent_employee_delete();
  create function public.prevent_employee_duplicate()
  returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger employees_prevent_duplicate
    before insert or update of email, phone, name, team_id, company_id
    on public.employees
    for each row execute function public.prevent_employee_duplicate();
  alter table public.profiles enable row level security;
  alter table public.employees enable row level security;
  alter table public.teams enable row level security;
  alter table public.employee_master_events enable row level security;
  alter table public.employee_merge_logs enable row level security;
  alter table public.employee_tasks enable row level security;
  alter table public.customer_quotes enable row level security;
  alter table public.project_material_sets enable row level security;
  alter table public.customer_access_tokens enable row level security;
  alter table public.material_approvals enable row level security;
  alter table public.material_comments enable row level security;
  alter table public.material_change_requests enable row level security;
  alter table public.material_approval_versions enable row level security;
  grant select, insert, update, delete on public.employees, public.teams,
    public.employee_tasks, public.customer_quotes to authenticated;
  grant select, insert, update, delete on public.contracts to authenticated;
  grant select, insert, update, delete on public.execution_budgets,
    public.execution_budget_items to authenticated;
  create function public.current_company_id() returns uuid language sql stable as $$
    select nullif(current_setting('test.current_company_id', true), '')::uuid
  $$;
  create function public.current_company_role() returns text language sql stable as $$
    select nullif(current_setting('test.current_company_role', true), '')
  $$;
  create function public.current_employee_id() returns uuid language sql stable security definer set search_path = '' as $$
    select profile_row.employee_id
    from public.profiles profile_row
    where profile_row.id = auth.uid()
  $$;
  create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(
      public.current_company_role() in ('owner', 'director', 'admin'),
      false
    )
  $$;
  create function public.is_erp_user() returns boolean language sql stable as $$ select true $$;
  create function public.can_access_customer(p_customer_id uuid)
  returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1
      from public.customers customer_row
      where customer_row.id = p_customer_id
        and customer_row.company_id = public.current_company_id()
        and (
          public.current_company_role() in ('owner', 'director', 'admin')
          or customer_row.assigned_employee_id = (
            select profile_row.employee_id
            from public.profiles profile_row
            where profile_row.id = auth.uid()
          )
        )
    )
  $$;
  create function public.can_access_schedule_assignee(p_employee_id uuid)
  returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1
      from public.employees employee_row
      where employee_row.id = p_employee_id
        and employee_row.company_id = public.current_company_id()
        and (
          public.current_company_role() in ('owner', 'director', 'admin')
          or employee_row.id = (
            select profile_row.employee_id
            from public.profiles profile_row
            where profile_row.id = auth.uid()
          )
        )
    )
  $$;
  alter table public.projects enable row level security;
  create policy projects_company_guard on public.projects
    as restrictive for all to authenticated
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
  alter table public.project_materials enable row level security;
  create policy project_materials_company_guard on public.project_materials
    as restrictive for all to authenticated
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
  create function public.employee_card_storage_company_id(p_path text)
  returns uuid language sql immutable as $$
    select nullif(split_part(p_path, '/', 1), '')::uuid
  $$;
  create function public.employee_card_storage_employee_id(p_path text)
  returns uuid language sql immutable as $$
    select nullif(split_part(p_path, '/', 2), '')::uuid
  $$;
  -- Production may predate every Employee Master RPC. Keep them absent so this
  -- test enforces create-before-ACL migration ordering for the full surface.
`);

const sql = readFileSync(
  "supabase/migrations/20260811070000_employee_master_company_scope_guard.sql",
  "utf8",
);
await db.exec(sql);

// Self-service company owners legitimately have no employee row. Keep this
// fixture present while the production verifier runs so NULL/NULL links are
// not mistaken for a cross-company employee mismatch.
await db.query(`
  insert into public.profiles(
    id, active_company_id, role, is_active, is_approved, approval_status
  ) values ($1, $2, 'admin', true, true, 'approved')
`, [ownerProfile, companyA]);
await db.query(`
  insert into public.company_memberships(
    id, company_id, user_id, role, status
  ) values ($1, $2, $3, 'owner', 'active')
`, [ownerMembership, companyA, ownerProfile]);

const verification = readFileSync(
  "supabase/verifications/20260811070000_employee_master_company_scope_guard_verify.sql",
  "utf8",
);
await db.exec(verification);

async function expectReject(
  query,
  params,
  pattern = /row-level security|permission denied/i,
  client = db,
) {
  let error;
  try {
    await client.query(query, params);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `Expected a rejection matching ${pattern}`);
  assert.match(String(error.message), pattern);
}

await db.query(`
  insert into public.employees(
    id, company_id, team_id, name, title, is_active,
    show_business_card_on_quote, sort_order
  ) values
    ($1, $2, $3, '이전대상', '팀원', true, false, 10),
    ($4, $5, $6, '타회사직원', '팀원', true, false, 10),
    ($7, $2, $3, '대표직원', '대표', true, false, 20),
    ($8, $2, $3, '이전받을직원', '팀원', true, false, 30),
    ($9, $2, $3, '관리자직원', '관리자', true, false, 40),
    ($10, $2, $3, '최고관리자직원', '최고관리자', true, false, 50)
`, [
  employeeA, companyA, teamA,
  employeeB, companyB, teamB,
  protectedEmployee, transferTarget,
  adminProtectedEmployee, superProtectedEmployee,
]);
await db.query(`
  insert into public.teams(id, company_id)
  values ($1, $2), ($3, $4)
`, [teamA, companyA, teamB, companyB]);
await db.query(`
  update public.profiles
  set employee_id = $1
  where id = $2
`, [protectedEmployee, ownerProfile]);
await db.query(`
  update public.company_memberships
  set employee_id = $1
  where id = $2
`, [protectedEmployee, ownerMembership]);
await db.query(`
  insert into public.profiles(
    id, employee_id, active_company_id, role,
    is_active, is_approved, approval_status
  ) values
    ($1, $2, $3, 'admin', true, true, 'approved'),
    ($4, null, $3, 'staff', true, true, 'approved'),
    ($5, $6, $3, 'admin', true, true, 'approved'),
    ($7, $8, $3, 'super_admin', true, true, 'approved')
`, [
  actorProfile, transferTarget, companyA,
  unlinkedActor,
  adminProtectedProfile, adminProtectedEmployee,
  superProtectedProfile, superProtectedEmployee,
]);
await db.query(`
  insert into public.company_memberships(
    id, company_id, user_id, employee_id, role, status
  ) values
    (gen_random_uuid(), $1, $2, $3, 'employee', 'active'),
    (gen_random_uuid(), $1, $4, null, 'admin', 'active'),
    (gen_random_uuid(), $1, $5, $6, 'admin', 'active'),
    (gen_random_uuid(), $1, $7, $8, 'employee', 'active')
`, [
  companyA,
  actorProfile, transferTarget,
  unlinkedActor,
  adminProtectedProfile, adminProtectedEmployee,
  superProtectedProfile, superProtectedEmployee,
]);

await db.query(`
  insert into public.customers(id, company_id, assigned_employee_id)
  values ($1, $2, $3), ($4, $5, $6)
`, [customerA, companyA, employeeA, customerB, companyB, employeeB]);
await db.query(`
  insert into public.quotes(
    id, company_id, customer_id, assigned_employee_id
  ) values
    ($1, $2, $3, $4),
    ($5, $6, $7, $8)
`, [
  quoteA, companyA, customerA, employeeA,
  quoteB, companyB, customerB, employeeB,
]);
await db.query(`
  insert into public.customer_schedules(id, company_id, assigned_employee_id)
  values (gen_random_uuid(), $1, $2)
`, [companyA, employeeA]);
await db.query(`
  insert into public.project_process_schedules(id, company_id, assigned_employee_id)
  values (gen_random_uuid(), $1, $2)
`, [companyA, employeeA]);
await db.query(`
  insert into public.projects(
    id, company_id, customer_id, assigned_employee_id
  ) values
    ($1, $2, $3, $4),
    ($5, $6, $7, $8)
`, [
  projectA, companyA, customerA, employeeA,
  projectB, companyB, customerB, employeeB,
]);
await db.query(`
  insert into public.project_material_sets(
    id, customer_id, project_id
  ) values
    ($1, $2, $3),
    ($4, $5, $6)
`, [materialSetA, customerA, projectA, materialSetB, customerB, projectB]);
await db.query(`
  insert into public.customer_access_tokens(
    token, customer_id, project_id, set_id, expires_at
  ) values ('valid-a', $1, $2, $3, now() + interval '1 day')
`, [customerA, projectA, materialSetA]);
const validMaterialToken = await db.query(
  "select (public._assert_material_token('valid-a')).id as id",
);
assert.equal(validMaterialToken.rows.length, 1);
await db.query(
  "update public.project_material_sets set deleted_at = now() where id = $1",
  [materialSetA],
);
await expectReject(
  "select public._assert_material_token('valid-a')",
  [],
  /선택안이 고객·프로젝트와 일치/,
);
await db.query(
  "update public.project_material_sets set deleted_at = null where id = $1",
  [materialSetA],
);
await expectReject(
  `insert into public.customer_access_tokens(
    token, customer_id, project_id, set_id, expires_at
  ) values ('cross-project', $1, $2, null, now() + interval '1 day')`,
  [customerA, projectB],
  /프로젝트가 고객과 일치/,
);
await expectReject(
  `insert into public.customer_access_tokens(
    token, customer_id, project_id, set_id, expires_at
  ) values ('cross-set', $1, $2, $3, now() + interval '1 day')`,
  [customerA, projectA, materialSetB],
  /선택안이 고객·프로젝트와 일치/,
);
const materialA = "72000000-0000-0000-0000-000000000001";
await db.query(`
  insert into public.project_materials(
    id, company_id, customer_id, project_id, set_id
  ) values ($1, $2, $3, $4, $5)
`, [materialA, companyA, customerA, projectA, materialSetA]);
await expectReject(
  `insert into public.project_materials(
    id, company_id, customer_id, project_id
  ) values (gen_random_uuid(), $1, $2, $3)`,
  [companyA, customerA, projectB],
  /foreign key constraint/i,
);
await expectReject(
  `insert into public.project_materials(
    id, company_id, customer_id, project_id, set_id
  ) values (gen_random_uuid(), $1, $2, $3, $4)`,
  [companyA, customerA, projectA, materialSetB],
  /foreign key constraint/i,
);
await expectReject(
  `insert into public.material_approvals(
    material_id, customer_id, project_id
  ) values ($1, $2, $3)`,
  [materialA, customerB, projectB],
  /foreign key constraint/i,
);
await expectReject(
  `insert into public.material_approvals(
    material_id, customer_id, project_id, access_token_id
  ) values (null, $1, $2, null)`,
  [customerA, projectB],
  /foreign key constraint/i,
);
await expectReject(
  `insert into public.material_change_requests(
    customer_id, project_id, set_id
  ) values ($1, $2, $3)`,
  [customerA, projectB, materialSetB],
  /foreign key constraint/i,
);
await expectReject(
  `insert into public.material_approval_versions(
    set_id, customer_id, project_id
  ) values ($1, $2, $3)`,
  [materialSetB, customerA, projectA],
  /foreign key constraint/i,
);
await expectReject(
  `update public.projects
   set customer_id = $1, company_id = $2, assigned_employee_id = null
   where id = $3`,
  [customerB, companyB, projectA],
  /foreign key constraint/i,
);
await expectReject(
  "update public.project_material_sets set project_id = $1 where id = $2",
  [projectB, materialSetA],
  /foreign key constraint/i,
);
await db.query(`
  insert into public.contracts(
    id, company_id, customer_id, project_id, quote_id,
    contract_kind, status
  ) values
    ($1, $2, $3, $4, $5, 'original', 'confirmed'),
    ($6, $7, $8, $9, null, 'original', 'confirmed'),
    ($10, $2, $3, $4, null, 'amendment', 'draft')
`, [
  contractRootA, companyA, customerA, projectA, quoteA,
  contractRootB, companyB, customerB, projectB,
  contractChildA,
]);
await db.query(`
  update public.contracts
  set root_contract_id = $1, parent_contract_id = $1
  where id = $2
`, [contractRootA, contractChildA]);
await expectReject(
  "update public.contracts set root_contract_id = $1 where id = $2",
  [contractRootB, contractChildA],
  /foreign key constraint/i,
);
await expectReject(
  "update public.contracts set parent_contract_id = $1 where id = $2",
  [contractRootB, contractChildA],
  /foreign key constraint/i,
);
await expectReject(
  "update public.contracts set customer_id = $1 where id = $2",
  [customerB, contractChildA],
  /foreign key constraint/i,
);
await expectReject(
  "update public.contracts set project_id = $1 where id = $2",
  [projectB, contractChildA],
  /foreign key constraint/i,
);
await expectReject(
  "update public.contracts set quote_id = $1 where id = $2",
  [quoteB, contractChildA],
  /foreign key constraint/i,
);
await db.query("select set_config('test.current_company_id', $1, false)", [companyA]);
await db.query("select set_config('test.current_company_role', 'owner', false)");
await db.query("select set_config('test.auth_uid', $1, false)", [ownerProfile]);
await db.exec("set role authenticated");
await expectReject(
  "select public.confirm_contract($1)",
  [contractChildA],
  /일반 확정은 원계약에만 사용/,
);
await expectReject(
  "select public.create_contract_amendment($1, '{}'::jsonb)",
  [contractRootA],
  /대기 중인 변경 또는 추가 계약/,
);
await expectReject(
  "update public.contracts set status = 'confirmed' where id = $1",
  [contractChildA],
  /permission denied/i,
);
await db.exec("reset role");
const unchangedLifecycle = await db.query(`
  select
    (select status from public.contracts where id = $1) as root_status,
    (select status from public.contracts where id = $2) as child_status
`, [contractRootA, contractChildA]);
assert.deepEqual(unchangedLifecycle.rows[0], {
  root_status: "confirmed",
  child_status: "draft",
});
await db.query(
  "update public.contracts set status = 'terminated' where id = $1",
  [contractRootA],
);
await db.exec("set role authenticated");
await expectReject(
  "select public.confirm_contract_amendment($1)",
  [contractChildA],
  /원계약이 변경계약의 회사·고객·프로젝트와 일치하지 않습니다/,
);
await db.exec("reset role");
const terminatedLifecycle = await db.query(`
  select
    (select status from public.contracts where id = $1) as root_status,
    (select status from public.contracts where id = $2) as child_status
`, [contractRootA, contractChildA]);
assert.deepEqual(terminatedLifecycle.rows[0], {
  root_status: "terminated",
  child_status: "draft",
});
await db.query(
  "update public.contracts set status = 'confirmed' where id = $1",
  [contractRootA],
);
await db.query(`
  insert into public.execution_budgets(
    id, company_id, contract_id, project_id, customer_id, status
  ) values ($1, $2, $3, $4, $5, 'halted')
`, [budgetA, companyA, contractRootA, projectA, customerA]);
await db.exec("set role authenticated");
await expectReject(
  "update public.execution_budgets set status = 'confirmed' where id = $1",
  [budgetA],
  /permission denied/i,
);
await db.exec("reset role");
await expectReject(
  `insert into public.execution_budgets(
    id, company_id, contract_id, project_id, customer_id
  ) values (gen_random_uuid(), $1, $2, $3, $4)`,
  [companyA, contractRootB, projectA, customerA],
  /foreign key constraint/i,
);
await db.query(`
  insert into public.execution_budget_items(
    id, company_id, execution_budget_id
  ) values (gen_random_uuid(), $1, $2)
`, [companyA, budgetA]);
await expectReject(
  `insert into public.execution_budget_items(
    id, company_id, execution_budget_id
  ) values (gen_random_uuid(), $1, $2)`,
  [companyB, budgetA],
  /foreign key constraint/i,
);
await db.query(`
  insert into public.contracts(id, company_id, assigned_employee_id)
  values (gen_random_uuid(), $1, $2)
`, [companyA, employeeA]);
await db.query(`
  insert into public.employee_tasks(
    id, assigned_employee_id, customer_id
  ) values
    (gen_random_uuid(), $1, $2),
    (gen_random_uuid(), $3, null),
    (gen_random_uuid(), $4, $5)
`, [employeeA, customerA, transferTarget, employeeB, customerB]);
await db.query(`
  insert into public.customer_quotes(
    id, customer_id, assigned_employee_id
  ) values
    (gen_random_uuid(), $1, $2),
    (gen_random_uuid(), $3, $4)
`, [customerA, employeeA, customerB, employeeB]);
await db.query(`
  insert into public.schedule_alert_events(
    id, company_id, assigned_employee_id, status
  ) values
    (gen_random_uuid(), $1, $2, 'pending'),
    (gen_random_uuid(), $1, $2, 'sent')
`, [companyA, employeeA]);

await expectReject(
  `insert into public.projects(
    id, company_id, customer_id, assigned_employee_id
  ) values (gen_random_uuid(), $1, $2, $3)`,
  [companyA, customerA, employeeB],
  /담당 직원이 업무 행의 회사/,
);
await expectReject(
  `insert into public.customer_quotes(
    id, customer_id, assigned_employee_id
  ) values (gen_random_uuid(), $1, $2)`,
  [customerA, employeeB],
  /담당 직원이 업무 고객의 회사/,
);
await expectReject(
  `insert into public.employee_tasks(
    id, assigned_employee_id, customer_id
  ) values (gen_random_uuid(), $1, $2)`,
  [employeeB, customerA],
  /담당 직원이 업무 고객의 회사/,
);

await db.query("select set_config('test.current_company_id', $1, false)", [companyA]);
await db.query("select set_config('test.current_company_role', 'employee', false)");
await db.query("select set_config('test.auth_uid', $1, false)", [actorProfile]);
await db.exec("set role authenticated");

const visibleAsStaff = await db.query(`
  select
    (select count(*)::int from public.employees) as employee_count,
    (select count(*)::int from public.teams) as team_count,
    (select count(*)::int from public.employee_tasks) as task_count
`);
assert.deepEqual(visibleAsStaff.rows[0], {
  employee_count: 5,
  team_count: 1,
  task_count: 1,
});

const ownCard = await db.query(
  "select public.can_write_employee_business_card($1) as allowed",
  [`${companyA}/${transferTarget}/own.png`],
);
assert.equal(ownCard.rows[0].allowed, true);
const peerCardAsGlobalAdmin = await db.query(
  "select public.can_write_employee_business_card($1) as allowed",
  [`${companyA}/${protectedEmployee}/peer.png`],
);
assert.equal(peerCardAsGlobalAdmin.rows[0].allowed, false);

await expectReject(
  "insert into public.employees(id, company_id, name, title) values ($1, $2, 'staff', '팀원')",
  ["20000000-0000-0000-0000-000000000003", companyA],
);
await expectReject(
  "update public.employees set name = '권한없음' where id = $1 returning id",
  [employeeA],
);
await expectReject(
  "insert into public.teams(id, company_id) values ($1, $2)",
  ["30000000-0000-0000-0000-000000000003", companyA],
);

await db.query("select set_config('test.auth_uid', $1, false)", [unlinkedActor]);
await db.query("select set_config('test.current_company_role', 'admin', false)");
const visibleAsCompanyAdmin = await db.query(`
  select
    (select count(*)::int from public.employee_tasks) as task_count,
    (select count(*)::int from public.customer_quotes) as customer_quote_count
`);
assert.deepEqual(visibleAsCompanyAdmin.rows[0], {
  task_count: 2,
  customer_quote_count: 1,
});
const crossTaskUpdate = await db.query(
  "update public.employee_tasks set updated_at = now() where assigned_employee_id = $1 returning id",
  [employeeB],
);
assert.equal(crossTaskUpdate.rows.length, 0);
const crossQuoteDelete = await db.query(
  "delete from public.customer_quotes where customer_id = $1 returning id",
  [customerB],
);
assert.equal(crossQuoteDelete.rows.length, 0);

await expectReject(
  "update public.employees set name = '관리자직접수정' where id = $1 returning id",
  [employeeA],
);
await expectReject(
  "insert into public.employees(id, company_id, name, title) values ($1, $2, '타회사생성', '팀원')",
  ["20000000-0000-0000-0000-000000000005", companyB],
);
await db.query(
  "insert into public.teams(id, company_id) values ($1, $2)",
  ["30000000-0000-0000-0000-000000000004", companyA],
);
await expectReject(
  "insert into public.teams(id, company_id) values ($1, $2)",
  ["30000000-0000-0000-0000-000000000005", companyB],
);

const peerCardAsCompanyAdmin = await db.query(
  "select public.can_write_employee_business_card($1) as allowed",
  [`${companyA}/${protectedEmployee}/peer.png`],
);
assert.equal(peerCardAsCompanyAdmin.rows[0].allowed, true);

await expectReject(
  `select public.update_employee_contact_profile(
    $1, null, null, null, $2, null, null
  )`,
  [employeeA, `${companyB}/${employeeB}/forged.png`],
  /명함 경로/,
);
await expectReject(
  "select public.merge_employees($1, $2, null, null)",
  [employeeA, transferTarget],
  /unlink 또는 deactivate/,
);
await expectReject(
  "select public.merge_employees($1, $2, $3, 'unlink')",
  [superProtectedEmployee, transferTarget, superProtectedProfile],
  /super_admin/,
);
await expectReject(
  "select public.merge_employees($1, $2, $3, 'unlink')",
  [adminProtectedEmployee, transferTarget, adminProtectedProfile],
  /owner·director만 병합/,
);

await expectReject(
  `select public.update_employee_master(
    $1, '대표직원', $2, '대표', null, null, false
  )`,
  [protectedEmployee, teamA],
  /상위 권한 계정/,
);
await expectReject(
  `select public.update_employee_master(
    $1, '관리자직원', $2, '관리자', null, null, false
  )`,
  [adminProtectedEmployee, teamA],
  /상위 권한 계정/,
);
await expectReject(
  `select public.update_employee_master(
    $1, '이전대상', $2, '팀원', null, null, false
  )`,
  [employeeA, teamA],
  /담당 업무/,
);

const transfer = await db.query(
  "select public.transfer_employee_assignments($1, $2) as counts",
  [employeeA, transferTarget],
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
  assert.equal(transfer.rows[0].counts[table], 1, `${table} transfer count`);
}

await db.exec("reset role");
const transferred = await db.query(`
  select
    (select count(*)::int from public.customers where id = $1 and assigned_employee_id = $2) as customers,
    (select count(*)::int from public.quotes where company_id = $3 and assigned_employee_id = $2) as quotes,
    (select count(*)::int from public.customer_schedules where company_id = $3 and assigned_employee_id = $2) as customer_schedules,
    (select count(*)::int from public.project_process_schedules where company_id = $3 and assigned_employee_id = $2) as process_schedules,
    (select count(*)::int from public.projects where company_id = $3 and assigned_employee_id = $2) as projects,
    (select count(*)::int from public.contracts where company_id = $3 and assigned_employee_id = $2) as contracts,
    (select count(*)::int from public.employee_tasks where customer_id = $1 and assigned_employee_id = $2) as employee_tasks,
    (select count(*)::int from public.customer_quotes where customer_id = $1 and assigned_employee_id = $2) as customer_quotes,
    (select count(*)::int from public.schedule_alert_events where status = 'pending' and assigned_employee_id = $2) as pending_alerts,
    (select count(*)::int from public.schedule_alert_events where status = 'sent' and assigned_employee_id = $4) as sent_history
`, [customerA, transferTarget, companyA, employeeA]);
assert.deepEqual(transferred.rows[0], {
  customers: 1,
  quotes: 1,
  customer_schedules: 1,
  process_schedules: 1,
  projects: 1,
  contracts: 1,
  employee_tasks: 1,
  customer_quotes: 1,
  pending_alerts: 1,
  sent_history: 1,
});
await db.exec("set role authenticated");

const deactivated = await db.query(
  `select (public.update_employee_master(
    $1, '이전완료', $2, '팀원', null, null, false
  )).is_active as is_active`,
  [employeeA, teamA],
);
assert.equal(deactivated.rows[0].is_active, false);

const created = await db.query(
  "select (public.create_employee_master('RPC생성', $1, '팀원', null, null)).company_id as company_id",
  [teamA],
);
assert.equal(created.rows[0].company_id, companyA);

await db.exec("reset role");
await expectReject(
  `insert into public.projects(
    id, company_id, customer_id, assigned_employee_id
  ) values (gen_random_uuid(), $1, $2, $3)`,
  [companyA, customerA, employeeA],
  /활성·미병합 담당 직원/,
);

const deletedHistoryProject = "70000000-0000-0000-0000-000000000099";
await db.query(
  `insert into public.projects(
    id, company_id, customer_id, assigned_employee_id, deleted_at
  ) values ($1, $2, $3, $4, now())`,
  [deletedHistoryProject, companyA, customerA, employeeA],
);
await expectReject(
  "update public.projects set deleted_at = null where id = $1",
  [deletedHistoryProject],
  /활성·미병합 담당 직원/,
);
await expectReject(
  `update public.schedule_alert_events
   set status = 'pending'
   where status = 'sent' and assigned_employee_id = $1`,
  [employeeA],
  /활성·미병합 담당 직원/,
);

await db.close();

// A 038/039-era partial installation may have contracts without the later
// lifecycle helper. The core quote/customer/project graph must still harden
// instead of returning early and widening is_admin over a poisoned FK graph.
const partialDb = new PGlite();
await partialDb.waitReady;
await partialDb.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create table public.customers(id uuid, company_id uuid);
  create unique index customers_id_company_scope_uidx
    on public.customers(id, company_id);
  create table public.projects(id uuid, company_id uuid, customer_id uuid);
  create unique index projects_id_customer_scope_uidx
    on public.projects(id, customer_id);
  create table public.quotes(id uuid, company_id uuid, customer_id uuid);
  create table public.contracts(
    id uuid primary key,
    company_id uuid,
    customer_id uuid,
    project_id uuid,
    quote_id uuid
  );
`);
await partialDb.exec(extractDoBlock(sql, "contract_lifecycle_scope_relations"));
await partialDb.exec(
  extractDoBlock(verification, "contract_lifecycle_scope_verification"),
);
await partialDb.query(`
  insert into public.customers(id, company_id)
  values ($1, $2), ($3, $4)
`, [customerA, companyA, customerB, companyB]);
await partialDb.query(`
  insert into public.projects(id, company_id, customer_id)
  values ($1, $2, $3), ($4, $5, $6)
`, [projectA, companyA, customerA, projectB, companyB, customerB]);
await partialDb.query(`
  insert into public.quotes(id, company_id, customer_id)
  values ($1, $2, $3), ($4, $5, $6)
`, [quoteA, companyA, customerA, quoteB, companyB, customerB]);
await expectReject(
  `insert into public.contracts(
    id, company_id, customer_id, project_id, quote_id
  ) values (gen_random_uuid(), $1, $2, $3, $4)`,
  [companyA, customerA, projectA, quoteB],
  /foreign key constraint/i,
  partialDb,
);
await partialDb.close();
console.log("Employee Master migration, verification, and RLS behavior: PASS");
