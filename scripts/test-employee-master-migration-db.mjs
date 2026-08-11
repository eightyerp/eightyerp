import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.waitReady;
const companyA = "10000000-0000-0000-0000-000000000001";
const companyB = "10000000-0000-0000-0000-000000000002";
const employeeA = "20000000-0000-0000-0000-000000000001";
const employeeB = "20000000-0000-0000-0000-000000000002";
const teamA = "30000000-0000-0000-0000-000000000001";
const teamB = "30000000-0000-0000-0000-000000000002";
const ownerProfile = "40000000-0000-0000-0000-000000000001";
const ownerMembership = "50000000-0000-0000-0000-000000000001";
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create table auth.users(id uuid primary key, email text, last_sign_in_at timestamptz);
  create table public.employees(
    id uuid primary key, company_id uuid, team_id uuid, name text, title text,
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
  create table public.customers(id uuid, company_id uuid, assigned_employee_id uuid, deleted_at timestamptz, updated_at timestamptz);
  create table public.quotes(id uuid, company_id uuid, assigned_employee_id uuid, deleted_at timestamptz, updated_at timestamptz);
  create table public.customer_schedules(id uuid, company_id uuid, assigned_employee_id uuid, deleted_at timestamptz, updated_at timestamptz);
  create table public.project_process_schedules(id uuid, company_id uuid, assigned_employee_id uuid, deleted_at timestamptz, updated_at timestamptz);
  create table public.employee_master_events(
    id uuid, company_id uuid, employee_id uuid, event_type text, actor_id uuid,
    before_data jsonb, after_data jsonb, detail jsonb
  );
  create table public.employee_merge_logs(
    id uuid default gen_random_uuid(), company_id uuid, source_employee_id uuid,
    target_employee_id uuid, transferred_counts jsonb, login_resolution jsonb,
    before_totals jsonb, after_totals jsonb, executed_by uuid
  );
  alter table public.employees enable row level security;
  alter table public.teams enable row level security;
  alter table public.employee_master_events enable row level security;
  alter table public.employee_merge_logs enable row level security;
  grant select, insert, update, delete on public.employees, public.teams to authenticated;
  create function public.current_company_id() returns uuid language sql stable as $$
    select nullif(current_setting('test.current_company_id', true), '')::uuid
  $$;
  create function public.current_company_role() returns text language sql stable as $$
    select nullif(current_setting('test.current_company_role', true), '')
  $$;
  create function public.is_erp_user() returns boolean language sql stable as $$ select true $$;
  create function public.create_employee_master(text,uuid,text,text,text) returns public.employees language sql as $$ select null::public.employees $$;
  create function public.update_employee_master(uuid,text,uuid,text,text,text,boolean) returns public.employees language sql as $$ select null::public.employees $$;
  create function public.transfer_employee_assignments(uuid,uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
  create function public.unlink_employee_login(uuid) returns void language plpgsql as $$ begin end $$;
  create function public.update_employee_login_role(uuid,text) returns void language plpgsql as $$ begin end $$;
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

await db.query(`
  insert into public.employees(id, company_id, name, title)
  values ($1, $2, 'A직원', '팀원'), ($3, $4, 'B직원', '팀원')
`, [employeeA, companyA, employeeB, companyB]);
await db.query(`
  insert into public.teams(id, company_id)
  values ($1, $2), ($3, $4)
`, [teamA, companyA, teamB, companyB]);
await db.query("select set_config('test.current_company_id', $1, false)", [companyA]);
await db.query("select set_config('test.current_company_role', 'employee', false)");
await db.exec("set role authenticated");

const visibleAsStaff = await db.query(`
  select
    (select count(*)::int from public.employees) as employee_count,
    (select count(*)::int from public.teams) as team_count
`);
assert.deepEqual(visibleAsStaff.rows[0], { employee_count: 1, team_count: 1 });

async function expectRlsReject(query, params) {
  let error;
  try {
    await db.query(query, params);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, "Expected an RLS rejection");
  assert.match(String(error.message), /row-level security|permission denied/i);
}

await expectRlsReject(
  "insert into public.employees(id, company_id, name, title) values ($1, $2, 'staff', '팀원')",
  ["20000000-0000-0000-0000-000000000003", companyA],
);
const staffUpdate = await db.query(
  "update public.employees set name = '권한없음' where id = $1 returning id",
  [employeeA],
);
assert.equal(staffUpdate.rows.length, 0);

await db.query("select set_config('test.current_company_role', 'admin', false)");
await db.query(
  "insert into public.employees(id, company_id, name, title) values ($1, $2, '관리자생성', '팀원')",
  ["20000000-0000-0000-0000-000000000004", companyA],
);
await expectRlsReject(
  "insert into public.employees(id, company_id, name, title) values ($1, $2, '타회사생성', '팀원')",
  ["20000000-0000-0000-0000-000000000005", companyB],
);
const crossCompanyUpdate = await db.query(
  "update public.employees set name = '타회사수정' where id = $1 returning id",
  [employeeB],
);
assert.equal(crossCompanyUpdate.rows.length, 0);
await db.query(
  "insert into public.teams(id, company_id) values ($1, $2)",
  ["30000000-0000-0000-0000-000000000003", companyA],
);
await expectRlsReject(
  "insert into public.teams(id, company_id) values ($1, $2)",
  ["30000000-0000-0000-0000-000000000004", companyB],
);

await db.exec("reset role");
await db.close();
console.log("Employee Master migration, verification, and RLS behavior: PASS");
