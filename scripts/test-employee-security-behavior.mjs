import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260811060000_employee_assignment_guard.sql",
  "utf8",
);
const companyScopeMigration = readFileSync(
  "supabase/migrations/20260811070000_employee_master_company_scope_guard.sql",
  "utf8",
);
const inviteMigration = readFileSync(
  "supabase/migrations/20260803000026_company_employee_invitations.sql",
  "utf8",
);

function extractSqlFunction(source, functionName) {
  const start = source.indexOf(
    `create or replace function public.${functionName}(`,
  );
  assert.notEqual(start, -1, `${functionName} RPC is missing`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${functionName} RPC end is missing`);
  return source.slice(start, end + 4);
}

const db = new PGlite();
await db.waitReady;

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema extensions;
  create or replace function auth.uid()
  returns uuid language sql stable set search_path = ''
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    last_sign_in_at timestamptz
  );
  create function extensions.digest(p_value text, p_algorithm text)
  returns bytea language sql immutable set search_path = '' as $$
    select pg_catalog.decode(
      pg_catalog.md5(p_value || ':' || p_algorithm),
      'hex'
    )
  $$;

  create table public.companies (
    id uuid primary key,
    status text not null,
    created_by uuid
  );
  create table public.teams (
    id uuid primary key,
    company_id uuid not null,
    name text not null,
    sort_order integer not null default 100
  );
  create table public.company_employee_invitations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    token_hash bytea not null,
    team_id uuid,
    default_title text not null,
    max_uses integer not null default 1,
    use_count integer not null default 0,
    is_active boolean not null default true,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_by uuid,
    last_used_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.employees (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    team_id uuid,
    name text not null,
    title text not null,
    phone text,
    email text,
    business_card_path text,
    show_business_card_on_quote boolean not null default false,
    is_active boolean not null default true,
    sort_order integer not null default 100,
    merged_into_employee_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.profiles (
    id uuid primary key,
    employee_id uuid,
    active_company_id uuid,
    role text not null default 'staff',
    permissions jsonb not null default '{}'::jsonb,
    is_active boolean not null default false,
    email text,
    full_name text,
    phone text,
    requested_team text,
    requested_title text,
    is_approved boolean not null default false,
    approval_status text not null default 'pending',
    approved_at timestamptz,
    approved_by uuid,
    rejected_at timestamptz,
    rejection_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index profiles_employee_login_uidx
    on public.profiles(employee_id) where employee_id is not null;
  create table public.company_memberships (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    user_id uuid not null,
    employee_id uuid,
    role text not null default 'employee',
    status text not null default 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    rejection_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, user_id)
  );
  alter table public.profiles enable row level security;
  create policy "profiles_select_own_or_admin" on public.profiles
    for select to authenticated using (true);
  create policy "profiles_update_own" on public.profiles
    for update to authenticated using (true) with check (true);

  create or replace function public.normalize_employee_phone(p_value text)
  returns text language sql immutable parallel safe set search_path = ''
  as $$
    select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '')
  $$;

  create or replace function public.current_company_id()
  returns uuid language sql stable security definer set search_path = ''
  as $$
    select p.active_company_id
    from public.profiles p
    join public.company_memberships m
      on m.user_id = p.id
     and m.company_id = p.active_company_id
     and m.status = 'active'
    join public.companies c
      on c.id = m.company_id
     and c.status = 'active'
    where p.id = auth.uid()
      and p.is_active
      and p.is_approved
      and p.approval_status = 'approved'
    limit 1
  $$;

  create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select coalesce((
      select p.role in ('admin', 'super_admin')
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active
        and p.is_approved
        and p.approval_status = 'approved'
    ), false)
  $$;

  create or replace function public.current_company_role()
  returns text language sql stable security definer set search_path = ''
  as $$
    select m.role
    from public.company_memberships m
    where m.user_id = auth.uid()
      and m.company_id = public.current_company_id()
      and m.status = 'active'
    limit 1
  $$;

  create or replace function public.can_approve_company_members(p_company_id uuid)
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1
      from public.company_memberships m
      join public.profiles p on p.id = m.user_id
      join public.companies c on c.id = m.company_id
      where m.user_id = auth.uid()
        and m.company_id = p_company_id
        and m.status = 'active'
        and m.role in ('owner', 'director')
        and p.is_active
        and p.is_approved
        and p.approval_status = 'approved'
        and c.status = 'active'
    )
  $$;
`);

// Execute the production Auth handler itself so invitation consumption and all
// auth/employee/membership/profile rollback behavior are covered.
await db.exec(extractSqlFunction(inviteMigration, "handle_new_user"));
await db.exec(`
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
`);

await db.exec(migration);

const signupGuardIds = {
  owner: "60000000-0000-0000-0000-000000000001",
  missing: "60000000-0000-0000-0000-000000000002",
  unknown: "60000000-0000-0000-0000-000000000003",
  invite: "60000000-0000-0000-0000-000000000004",
  orphan: "60000000-0000-0000-0000-000000000005",
  invalidInvite: "60000000-0000-0000-0000-000000000006",
  reusedInvite: "60000000-0000-0000-0000-000000000007",
};
const signupCompany = "61000000-0000-0000-0000-000000000001";
const signupTeam = "62000000-0000-0000-0000-000000000001";
const signupCreator = "63000000-0000-0000-0000-000000000001";
const validInviteToken = "a".repeat(64);

await db.query(
  "insert into public.companies(id, status, created_by) values ($1, 'active', $2)",
  [signupCompany, signupCreator],
);
await db.query(
  "insert into public.teams(id, company_id, name) values ($1, $2, '초대팀')",
  [signupTeam, signupCompany],
);
await db.query(`
  insert into public.company_employee_invitations(
    company_id, token_hash, team_id, default_title, expires_at, created_by
  ) values (
    $1, extensions.digest($2, 'sha256'), $3, '직원', now() + interval '1 day', $4
  )
`, [signupCompany, validInviteToken, signupTeam, signupCreator]);

await db.query(`
  insert into auth.users(id, email, raw_user_meta_data)
  values ($1, 'owner-signup@test.local', '{"signup_type":"company_owner"}')
`, [signupGuardIds.owner]);
const guardedOwner = await db.query(`
  select u.raw_user_meta_data->>'signup_type' as signup_type,
         p.approval_status,
         (select count(*)::int from public.company_memberships m where m.user_id = u.id) as membership_count
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.id = $1
`, [signupGuardIds.owner]);
assert.deepEqual(guardedOwner.rows[0], {
  signup_type: "company_owner",
  approval_status: "pending",
  membership_count: 0,
});

await expectReject(
  () => db.query(
    "insert into auth.users(id, email) values ($1, 'missing-signup@test.local')",
    [signupGuardIds.missing],
  ),
  /지원되지 않는 가입 경로/,
);
await expectReject(
  () => db.query(`
    insert into auth.users(id, email, raw_user_meta_data)
    values ($1, 'unknown-signup@test.local', '{"signup_type":"legacy_staff"}')
  `, [signupGuardIds.unknown]),
  /지원되지 않는 가입 경로/,
);
const blockedSignupRows = await db.query(`
  select
    (select count(*)::int from auth.users where id = any($1::uuid[])) as auth_count,
    (select count(*)::int from public.profiles where id = any($1::uuid[])) as profile_count
`, [[signupGuardIds.missing, signupGuardIds.unknown]]);
assert.deepEqual(blockedSignupRows.rows[0], { auth_count: 0, profile_count: 0 });

await expectReject(
  () => db.query(`
    insert into auth.users(id, email, raw_user_meta_data)
    values ($1, 'invalid-invite@test.local', '{"signup_type":"company_invite","full_name":"무효초대"}')
  `, [signupGuardIds.invalidInvite]),
  /유효하지 않은 직원 초대 링크/,
);

await db.query(`
  insert into auth.users(id, email, raw_user_meta_data)
  values (
    $1,
    'invite-signup@test.local',
    jsonb_build_object(
      'signup_type', 'company_invite',
      'invite_token', $2::text,
      'full_name', '초대 사용자',
      'phone', '010-0000-0000'
    )
  )
`, [signupGuardIds.invite, validInviteToken]);
const guardedInvite = await db.query(`
  select u.raw_user_meta_data->>'signup_type' as signup_type,
         u.raw_app_meta_data->>'onboarding_type' as onboarding_type,
         p.approval_status, p.is_active,
         m.status as membership_status,
         e.company_id as employee_company_id,
         i.use_count, i.is_active as invitation_active
  from auth.users u
  join public.profiles p on p.id = u.id
  join public.company_memberships m on m.user_id = u.id
  join public.employees e on e.id = m.employee_id
  cross join public.company_employee_invitations i
  where u.id = $1 and i.company_id = $2
`, [signupGuardIds.invite, signupCompany]);
assert.deepEqual(guardedInvite.rows[0], {
  signup_type: "company_invite",
  onboarding_type: "company_invite",
  approval_status: "approved",
  is_active: true,
  membership_status: "active",
  employee_company_id: signupCompany,
  use_count: 1,
  invitation_active: false,
});

await expectReject(
  () => db.query(`
    insert into auth.users(id, email, raw_user_meta_data)
    values (
      $1,
      'reused-invite@test.local',
      jsonb_build_object(
        'signup_type', 'company_invite',
        'invite_token', $2::text,
        'full_name', '재사용 시도'
      )
    )
  `, [signupGuardIds.reusedInvite, validInviteToken]),
  /만료되었거나 이미 사용된 직원 초대 링크/,
);
const rolledBackInvites = await db.query(`
  select
    (select count(*)::int from auth.users where id = any($1::uuid[])) as auth_count,
    (select count(*)::int from public.profiles where id = any($1::uuid[])) as profile_count,
    (select count(*)::int from public.company_memberships where user_id = any($1::uuid[])) as membership_count
`, [[signupGuardIds.invalidInvite, signupGuardIds.reusedInvite]]);
assert.deepEqual(rolledBackInvites.rows[0], {
  auth_count: 0,
  profile_count: 0,
  membership_count: 0,
});

await db.exec(extractSqlFunction(companyScopeMigration, "update_employee_contact_profile"));
await db.exec(extractSqlFunction(companyScopeMigration, "unlink_employee_login"));

const ids = {
  companyA: "10000000-0000-0000-0000-000000000001",
  companyB: "10000000-0000-0000-0000-000000000002",
  teamA: "20000000-0000-0000-0000-000000000001",
  teamB: "20000000-0000-0000-0000-000000000002",
  ownerA: "30000000-0000-0000-0000-000000000001",
  directorA: "30000000-0000-0000-0000-000000000002",
  adminA: "30000000-0000-0000-0000-000000000003",
  ownerB: "30000000-0000-0000-0000-000000000004",
  success: "40000000-0000-0000-0000-000000000001",
  noMember: "40000000-0000-0000-0000-000000000002",
  cross: "40000000-0000-0000-0000-000000000003",
  superRole: "40000000-0000-0000-0000-000000000004",
  directorAdmin: "40000000-0000-0000-0000-000000000005",
  teamMismatch: "40000000-0000-0000-0000-000000000006",
  createEmployee: "40000000-0000-0000-0000-000000000007",
  reject: "40000000-0000-0000-0000-000000000008",
  deactivate: "40000000-0000-0000-0000-000000000009",
  rollback: "40000000-0000-0000-0000-000000000010",
  race: "40000000-0000-0000-0000-000000000011",
  otherPending: "40000000-0000-0000-0000-000000000012",
  otherActive: "40000000-0000-0000-0000-000000000013",
  otherSuspended: "40000000-0000-0000-0000-000000000014",
  protectedSuper: "40000000-0000-0000-0000-000000000015",
  globalAdminStaff: "40000000-0000-0000-0000-000000000016",
  staffSelf: "40000000-0000-0000-0000-000000000017",
  rejectOtherPending: "40000000-0000-0000-0000-000000000018",
  rejectOtherActive: "40000000-0000-0000-0000-000000000019",
  rejectOtherSuspended: "40000000-0000-0000-0000-000000000020",
  crossActive: "40000000-0000-0000-0000-000000000021",
  crossSuspended: "40000000-0000-0000-0000-000000000022",
  empSuccess: "50000000-0000-0000-0000-000000000001",
  empDirectorAdmin: "50000000-0000-0000-0000-000000000002",
  empSuperRole: "50000000-0000-0000-0000-000000000003",
  empDeactivate: "50000000-0000-0000-0000-000000000004",
  empRace: "50000000-0000-0000-0000-000000000005",
  empOtherPending: "50000000-0000-0000-0000-000000000006",
  empOtherActive: "50000000-0000-0000-0000-000000000007",
  empOtherSuspended: "50000000-0000-0000-0000-000000000008",
  empProtectedSuper: "50000000-0000-0000-0000-000000000009",
  empGlobalAdminStaff: "50000000-0000-0000-0000-000000000010",
  empStaffSelf: "50000000-0000-0000-0000-000000000011",
  empPeerA: "50000000-0000-0000-0000-000000000012",
  empCompanyB: "50000000-0000-0000-0000-000000000013",
};

const q = (value) => `'${value}'::uuid`;

await db.exec(`
  insert into public.companies(id, status) values
    (${q(ids.companyA)}, 'active'),
    (${q(ids.companyB)}, 'active');
  insert into public.teams(id, company_id, name) values
    (${q(ids.teamA)}, ${q(ids.companyA)}, 'A팀'),
    (${q(ids.teamB)}, ${q(ids.companyB)}, 'B팀');
  insert into public.employees(id, company_id, team_id, name, title) values
    (${q(ids.empSuccess)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '성공직원', '팀원'),
    (${q(ids.empDirectorAdmin)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '관리자직원', '팀장'),
    (${q(ids.empSuperRole)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '최고관리자시도', '팀원'),
    (${q(ids.empDeactivate)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '비활성대상', '팀원'),
    (${q(ids.empRace)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '경쟁승인', '팀원'),
    (${q(ids.empOtherPending)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '타회사대기', '팀원'),
    (${q(ids.empOtherActive)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '타회사활성', '팀원'),
    (${q(ids.empOtherSuspended)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '타회사중지', '팀원'),
    (${q(ids.empProtectedSuper)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '보호최고관리자', '팀원'),
    (${q(ids.empGlobalAdminStaff)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '전역관리자회사직원', '팀원'),
    (${q(ids.empStaffSelf)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '본인수정직원', '팀원'),
    (${q(ids.empPeerA)}, ${q(ids.companyA)}, ${q(ids.teamA)}, '동료직원', '팀원'),
    (${q(ids.empCompanyB)}, ${q(ids.companyB)}, ${q(ids.teamB)}, '타회사직원', '팀원');

  insert into public.profiles(
    id, active_company_id, role, is_active, is_approved, approval_status, email
  ) values
    (${q(ids.ownerA)}, ${q(ids.companyA)}, 'staff', true, true, 'approved', 'owner-a@test.local'),
    (${q(ids.directorA)}, ${q(ids.companyA)}, 'admin', true, true, 'approved', 'director-a@test.local'),
    (${q(ids.adminA)}, ${q(ids.companyA)}, 'admin', true, true, 'approved', 'admin-a@test.local'),
    (${q(ids.ownerB)}, ${q(ids.companyB)}, 'admin', true, true, 'approved', 'owner-b@test.local');
  insert into public.company_memberships(company_id, user_id, role, status) values
    (${q(ids.companyA)}, ${q(ids.ownerA)}, 'owner', 'active'),
    (${q(ids.companyA)}, ${q(ids.directorA)}, 'director', 'active'),
    (${q(ids.companyB)}, ${q(ids.directorA)}, 'employee', 'active'),
    (${q(ids.companyA)}, ${q(ids.adminA)}, 'admin', 'active'),
    (${q(ids.companyB)}, ${q(ids.ownerB)}, 'owner', 'active');

  insert into public.profiles(id, role, is_active, is_approved, approval_status, email, phone) values
    (${q(ids.success)}, 'staff', false, false, 'pending', 'success@test.local', '010-1111-0001'),
    (${q(ids.noMember)}, 'staff', false, false, 'pending', 'nomember@test.local', '010-1111-0002'),
    (${q(ids.cross)}, 'staff', false, false, 'pending', 'cross@test.local', '010-1111-0003'),
    (${q(ids.crossActive)}, 'staff', false, false, 'pending', 'cross-active@test.local', '010-1111-0021'),
    (${q(ids.crossSuspended)}, 'staff', false, false, 'pending', 'cross-suspended@test.local', '010-1111-0022'),
    (${q(ids.superRole)}, 'staff', false, false, 'pending', 'super@test.local', '010-1111-0004'),
    (${q(ids.directorAdmin)}, 'staff', false, false, 'pending', 'director-admin@test.local', '010-1111-0005'),
    (${q(ids.teamMismatch)}, 'staff', false, false, 'pending', 'team-mismatch@test.local', '010-1111-0006'),
    (${q(ids.createEmployee)}, 'staff', false, false, 'pending', 'create@test.local', '010-1111-0007'),
    (${q(ids.reject)}, 'staff', false, false, 'pending', 'reject@test.local', '010-1111-0008'),
    (${q(ids.rollback)}, 'staff', false, false, 'pending', 'rollback@test.local', '010-1111-0010'),
    (${q(ids.race)}, 'staff', false, false, 'pending', 'race@test.local', '010-1111-0011'),
    (${q(ids.rejectOtherPending)}, 'staff', false, false, 'pending', 'reject-other-pending@test.local', '010-1111-0018'),
    (${q(ids.rejectOtherActive)}, 'staff', false, false, 'pending', 'reject-other-active@test.local', '010-1111-0019'),
    (${q(ids.rejectOtherSuspended)}, 'staff', false, false, 'pending', 'reject-other-suspended@test.local', '010-1111-0020');
  insert into public.company_memberships(company_id, user_id, role, status) values
    (${q(ids.companyA)}, ${q(ids.success)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.cross)}, 'employee', 'pending'),
    (${q(ids.companyB)}, ${q(ids.cross)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.crossActive)}, 'employee', 'pending'),
    (${q(ids.companyB)}, ${q(ids.crossActive)}, 'employee', 'active'),
    (${q(ids.companyA)}, ${q(ids.crossSuspended)}, 'employee', 'pending'),
    (${q(ids.companyB)}, ${q(ids.crossSuspended)}, 'employee', 'suspended'),
    (${q(ids.companyA)}, ${q(ids.superRole)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.directorAdmin)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.teamMismatch)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.createEmployee)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.reject)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.rollback)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.race)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.rejectOtherPending)}, 'employee', 'pending'),
    (${q(ids.companyB)}, ${q(ids.rejectOtherPending)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.rejectOtherActive)}, 'employee', 'pending'),
    (${q(ids.companyB)}, ${q(ids.rejectOtherActive)}, 'employee', 'active'),
    (${q(ids.companyA)}, ${q(ids.rejectOtherSuspended)}, 'employee', 'pending'),
    (${q(ids.companyB)}, ${q(ids.rejectOtherSuspended)}, 'employee', 'suspended');

  insert into public.profiles(
    id, employee_id, active_company_id, role, is_active, is_approved,
    approval_status, email
  ) values (
    ${q(ids.deactivate)}, ${q(ids.empDeactivate)}, ${q(ids.companyA)},
    'staff', true, true, 'approved', 'deactivate@test.local'
  );
  insert into public.company_memberships(
    company_id, user_id, employee_id, role, status
  ) values (
    ${q(ids.companyA)}, ${q(ids.deactivate)}, ${q(ids.empDeactivate)},
    'employee', 'active'
  );

  insert into public.profiles(
    id, employee_id, active_company_id, role, is_active, is_approved,
    approval_status, email
  ) values
    (${q(ids.otherPending)}, ${q(ids.empOtherPending)}, ${q(ids.companyA)}, 'staff', true, true, 'approved', 'other-pending@test.local'),
    (${q(ids.otherActive)}, ${q(ids.empOtherActive)}, ${q(ids.companyA)}, 'staff', true, true, 'approved', 'other-active@test.local'),
    (${q(ids.otherSuspended)}, ${q(ids.empOtherSuspended)}, ${q(ids.companyA)}, 'staff', true, true, 'approved', 'other-suspended@test.local'),
    (${q(ids.protectedSuper)}, ${q(ids.empProtectedSuper)}, ${q(ids.companyA)}, 'super_admin', true, true, 'approved', 'protected-super@test.local'),
    (${q(ids.globalAdminStaff)}, ${q(ids.empGlobalAdminStaff)}, ${q(ids.companyA)}, 'super_admin', true, true, 'approved', 'global-admin-staff@test.local'),
    (${q(ids.staffSelf)}, ${q(ids.empStaffSelf)}, ${q(ids.companyA)}, 'staff', true, true, 'approved', 'staff-self@test.local');
  insert into public.company_memberships(
    company_id, user_id, employee_id, role, status
  ) values
    (${q(ids.companyA)}, ${q(ids.otherPending)}, ${q(ids.empOtherPending)}, 'employee', 'active'),
    (${q(ids.companyB)}, ${q(ids.otherPending)}, ${q(ids.empOtherPending)}, 'employee', 'pending'),
    (${q(ids.companyA)}, ${q(ids.otherActive)}, ${q(ids.empOtherActive)}, 'employee', 'active'),
    (${q(ids.companyB)}, ${q(ids.otherActive)}, ${q(ids.empOtherActive)}, 'employee', 'active'),
    (${q(ids.companyA)}, ${q(ids.otherSuspended)}, ${q(ids.empOtherSuspended)}, 'employee', 'active'),
    (${q(ids.companyB)}, ${q(ids.otherSuspended)}, ${q(ids.empOtherSuspended)}, 'employee', 'suspended'),
    (${q(ids.companyA)}, ${q(ids.protectedSuper)}, ${q(ids.empProtectedSuper)}, 'employee', 'active'),
    (${q(ids.companyA)}, ${q(ids.globalAdminStaff)}, ${q(ids.empGlobalAdminStaff)}, 'employee', 'active'),
    (${q(ids.companyA)}, ${q(ids.staffSelf)}, ${q(ids.empStaffSelf)}, 'employee', 'active');
`);

async function asUser(userId) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function expectReject(fn, pattern) {
  let error;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `Expected rejection matching ${pattern}`);
  assert.match(String(error.message), pattern);
}

const meta = await db.query(`
  select p.prosecdef, p.proconfig,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
  where p.oid = 'public.approve_staff_signup(uuid,text,uuid,text,text,uuid)'::regprocedure
`);
assert.equal(meta.rows[0].prosecdef, true);
assert.deepEqual(meta.rows[0].proconfig, ["search_path=\"\""]);
assert.equal(meta.rows[0].authenticated_exec, true);
assert.equal(meta.rows[0].anon_exec, false);
assert.equal(meta.rows[0].service_exec, false);

await asUser(ids.ownerA);
const pending = await db.query("select id from public.list_pending_company_signups()");
const pendingIds = new Set(pending.rows.map((row) => row.id));
assert.equal(pendingIds.has(ids.success), true);
assert.equal(pendingIds.has(ids.noMember), false);
assert.equal(pendingIds.has(ids.ownerB), false);

await db.query(
  "select id from public.approve_staff_signup($1, 'staff', $2, null, null, null)",
  [ids.success, ids.empSuccess],
);
const approved = await db.query(`
  select p.employee_id, p.active_company_id, p.is_active, p.is_approved,
         p.approval_status, m.employee_id as membership_employee_id,
         m.status as membership_status, m.role as membership_role
  from public.profiles p
  join public.company_memberships m on m.user_id = p.id
  where p.id = $1 and m.company_id = $2
`, [ids.success, ids.companyA]);
assert.deepEqual(approved.rows[0], {
  employee_id: ids.empSuccess,
  active_company_id: ids.companyA,
  is_active: true,
  is_approved: true,
  approval_status: "approved",
  membership_employee_id: ids.empSuccess,
  membership_status: "active",
  membership_role: "employee",
});

await expectReject(
  () => db.query(
    "select id from public.approve_staff_signup($1, 'staff', $2, null, null, null)",
    [ids.noMember, ids.empSuperRole],
  ),
  /승인 대기 멤버십/,
);
for (const userId of [ids.cross, ids.crossActive, ids.crossSuspended]) {
  await expectReject(
    () => db.query(
      "select id from public.approve_staff_signup($1, 'staff', $2, null, null, null)",
      [userId, ids.empSuperRole],
    ),
    /다른 회사/,
  );
}
const protectedApprovals = await db.query(`
  select p.id, p.approval_status, p.employee_id,
         current_membership.status as current_status,
         other_membership.status as other_status
  from public.profiles p
  join public.company_memberships current_membership
    on current_membership.user_id = p.id
   and current_membership.company_id = $1
  join public.company_memberships other_membership
    on other_membership.user_id = p.id
   and other_membership.company_id = $2
  where p.id = any($3::uuid[])
  order by p.id
`, [ids.companyA, ids.companyB, [ids.cross, ids.crossActive, ids.crossSuspended]]);
assert.equal(protectedApprovals.rows.length, 3);
assert.equal(protectedApprovals.rows.every((row) => (
  row.approval_status === "pending"
  && row.employee_id === null
  && row.current_status === "pending"
  && ["pending", "active", "suspended"].includes(row.other_status)
)), true);
await expectReject(
  () => db.query(
    "select id from public.approve_staff_signup($1, 'super_admin', $2, null, null, null)",
    [ids.superRole, ids.empSuperRole],
  ),
  /유효하지 않은 권한/,
);

await asUser(ids.adminA);
await expectReject(
  () => db.query(
    "select id from public.approve_staff_signup($1, 'staff', $2, null, null, null)",
    [ids.superRole, ids.empSuperRole],
  ),
  /현재 회사의 owner·director만/,
);

await asUser(ids.directorA);
await db.query(
  "select id from public.approve_staff_signup($1, 'admin', $2, null, null, null)",
  [ids.directorAdmin, ids.empDirectorAdmin],
);
const adminMembership = await db.query(
  "select role, status from public.company_memberships where company_id = $1 and user_id = $2",
  [ids.companyA, ids.directorAdmin],
);
assert.deepEqual(adminMembership.rows[0], { role: "admin", status: "active" });

// The production producer for a pending membership is login unlink. Prove it
// feeds the same scoped pending list and can be re-linked to the existing
// employee without creating or moving business data.
await db.query(
  "select public.unlink_employee_login($1)",
  [ids.empDirectorAdmin],
);
const unlinkedLogin = await db.query(`
  select p.employee_id, p.approval_status, p.is_active,
         m.employee_id as membership_employee_id, m.status as membership_status
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id and m.company_id = $2
  where p.id = $1
`, [ids.directorAdmin, ids.companyA]);
assert.deepEqual(unlinkedLogin.rows[0], {
  employee_id: null,
  approval_status: "pending",
  is_active: false,
  membership_employee_id: null,
  membership_status: "pending",
});
const relinkPending = await db.query(
  "select id from public.list_pending_company_signups() where id = $1",
  [ids.directorAdmin],
);
assert.equal(relinkPending.rows.length, 1);
await db.query(
  "select id from public.approve_staff_signup($1, 'admin', $2, null, null, null)",
  [ids.directorAdmin, ids.empDirectorAdmin],
);
const relinkedLogin = await db.query(`
  select p.employee_id, p.approval_status, p.is_active,
         m.employee_id as membership_employee_id, m.status as membership_status,
         m.role as membership_role
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id and m.company_id = $2
  where p.id = $1
`, [ids.directorAdmin, ids.companyA]);
assert.deepEqual(relinkedLogin.rows[0], {
  employee_id: ids.empDirectorAdmin,
  approval_status: "approved",
  is_active: true,
  membership_employee_id: ids.empDirectorAdmin,
  membership_status: "active",
  membership_role: "admin",
});

await asUser(ids.ownerA);
await expectReject(
  () => db.query(
    "select id from public.approve_staff_signup($1, 'staff', null, '타회사팀', '직원', $2)",
    [ids.teamMismatch, ids.teamB],
  ),
  /현재 회사에 속하지 않은 팀/,
);
await db.query(
  "select id from public.approve_staff_signup($1, 'staff', null, '신규직원', '팀원', $2)",
  [ids.createEmployee, ids.teamA],
);
const created = await db.query(`
  select e.company_id, e.team_id, m.employee_id, m.status, p.employee_id as profile_employee_id
  from public.profiles p
  join public.company_memberships m on m.user_id = p.id and m.company_id = $2
  join public.employees e on e.id = p.employee_id
  where p.id = $1
`, [ids.createEmployee, ids.companyA]);
assert.equal(created.rows[0].company_id, ids.companyA);
assert.equal(created.rows[0].team_id, ids.teamA);
assert.equal(created.rows[0].employee_id, created.rows[0].profile_employee_id);
assert.equal(created.rows[0].status, "active");

await db.query("select id from public.reject_staff_signup($1, '테스트 거절')", [ids.reject]);
const rejected = await db.query(`
  select p.approval_status, p.is_active, p.is_approved,
         m.status as membership_status, m.rejection_reason
  from public.profiles p
  join public.company_memberships m on m.user_id = p.id and m.company_id = $2
  where p.id = $1
`, [ids.reject, ids.companyA]);
assert.deepEqual(rejected.rows[0], {
  approval_status: "rejected",
  is_active: false,
  is_approved: false,
  membership_status: "rejected",
  rejection_reason: "테스트 거절",
});

// A rejection is all-or-nothing when any other company has a nonterminal
// relationship. Exercise every protected status and prove both the current
// membership and global profile remain pending after the exception.
for (const userId of [
  ids.rejectOtherPending,
  ids.rejectOtherActive,
  ids.rejectOtherSuspended,
]) {
  await expectReject(
    () => db.query("select id from public.reject_staff_signup($1, '타회사 보호')", [userId]),
    /다른 회사와 비종결 관계/,
  );
}
const protectedRejections = await db.query(`
  select p.id, p.approval_status, p.is_active, p.is_approved,
         current_membership.status as current_status,
         other_membership.status as other_status
  from public.profiles p
  join public.company_memberships current_membership
    on current_membership.user_id = p.id
   and current_membership.company_id = $1
  join public.company_memberships other_membership
    on other_membership.user_id = p.id
   and other_membership.company_id = $2
  where p.id = any($3::uuid[])
  order by p.id
`, [ids.companyA, ids.companyB, [
  ids.rejectOtherPending,
  ids.rejectOtherActive,
  ids.rejectOtherSuspended,
]]);
assert.equal(protectedRejections.rows.length, 3);
assert.equal(protectedRejections.rows.every((row) => (
  row.approval_status === "pending"
  && row.is_active === false
  && row.is_approved === false
  && row.current_status === "pending"
  && ["pending", "active", "suspended"].includes(row.other_status)
)), true);

const ownerAccessBeforeDeactivate = await db.query(`
  select auth.uid() as user_id,
         public.current_company_id() as company_id,
         public.current_company_role() as company_role,
         public.can_approve_company_members(public.current_company_id()) as can_approve
`);
assert.deepEqual(ownerAccessBeforeDeactivate.rows[0], {
  user_id: ids.ownerA,
  company_id: ids.companyA,
  company_role: "owner",
  can_approve: true,
});

await db.query("select id from public.deactivate_staff_user($1)", [ids.deactivate]);
const deactivated = await db.query(`
  select p.is_active, m.status as membership_status
  from public.profiles p
  join public.company_memberships m on m.user_id = p.id and m.company_id = $2
  where p.id = $1
`, [ids.deactivate, ids.companyA]);
assert.deepEqual(deactivated.rows[0], {
  is_active: false,
  membership_status: "suspended",
});

// Deactivation is a global profile mutation, so every nonterminal relationship
// in another company must stop it. super_admin is independently protected.
for (const userId of [
  ids.otherPending,
  ids.otherActive,
  ids.otherSuspended,
]) {
  await expectReject(
    () => db.query("select id from public.deactivate_staff_user($1)", [userId]),
    /다른 회사와 비종결 관계/,
  );
}
await expectReject(
  () => db.query("select id from public.deactivate_staff_user($1)", [ids.protectedSuper]),
  /super_admin/,
);
const protectedProfiles = await db.query(`
  select id, is_active
  from public.profiles
  where id = any($1::uuid[])
  order by id
`, [[
  ids.otherPending,
  ids.otherActive,
  ids.otherSuspended,
  ids.protectedSuper,
]]);
assert.equal(protectedProfiles.rows.length, 4);
assert.equal(protectedProfiles.rows.every((row) => row.is_active), true);

// Current-company admin may edit a peer.
await asUser(ids.adminA);
await db.query(
  "select id from public.update_employee_contact_profile($1, $2, null, null, null, false, null)",
  [ids.empPeerA, "관리자수정"],
);

// An ordinary employee may edit exactly their own record.
await asUser(ids.staffSelf);
await db.query(
  "select id from public.update_employee_contact_profile($1, $2, null, null, null, false, null)",
  [ids.empStaffSelf, "본인수정"],
);
await expectReject(
  () => db.query(
    "select id from public.update_employee_contact_profile($1, $2, null, null, null, false, null)",
    [ids.empPeerA, "권한없는수정"],
  ),
  /관리자 또는 본인/,
);

// A global profile role must not substitute for a current-company manager role.
await asUser(ids.globalAdminStaff);
await expectReject(
  () => db.query(
    "select id from public.update_employee_contact_profile($1, $2, null, null, null, false, null)",
    [ids.empPeerA, "전역역할우회"],
  ),
  /관리자 또는 본인/,
);
await db.query(
  "select id from public.update_employee_contact_profile($1, $2, null, null, null, false, null)",
  [ids.empGlobalAdminStaff, "본인수정허용"],
);

// Even a company manager cannot reach an employee in another company.
await asUser(ids.ownerA);
await expectReject(
  () => db.query(
    "select id from public.update_employee_contact_profile($1, $2, null, null, null, false, null)",
    [ids.empCompanyB, "타회사수정"],
  ),
  /현재 회사의 미병합 직원/,
);

// PGlite queues requests through one backend. This proves duplicate requests
// converge to one approval and one stale-state rejection, but is not a genuine
// two-session lock-contention test.
const duplicateApproval = () => db.query(
  "select id from public.approve_staff_signup($1, 'staff', $2, null, null, null)",
  [ids.race, ids.empRace],
);
const raceResults = await Promise.allSettled([
  duplicateApproval(),
  duplicateApproval(),
]);
assert.equal(
  raceResults.filter((result) => result.status === "fulfilled").length,
  1,
);
assert.equal(
  raceResults.filter((result) => result.status === "rejected").length,
  1,
);
assert.match(
  String(raceResults.find((result) => result.status === "rejected").reason.message),
  /이미 처리되었거나 직원에 연결된 가입 요청/,
);
const raceState = await db.query(`
  select p.employee_id, p.approval_status, m.status as membership_status
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id and m.company_id = $2
  where p.id = $1
`, [ids.race, ids.companyA]);
assert.deepEqual(raceState.rows[0], {
  employee_id: ids.empRace,
  approval_status: "approved",
  membership_status: "active",
});

await db.exec(`
  create or replace function public.fail_rollback_profile_update()
  returns trigger language plpgsql set search_path = '' as $$
  begin
    if new.id = '${ids.rollback}'::uuid and new.is_active then
      raise exception 'forced profile failure';
    end if;
    return new;
  end
  $$;
  create trigger rollback_profile_failure
  before update on public.profiles
  for each row execute function public.fail_rollback_profile_update();
`);
await expectReject(
  () => db.query(
    "select id from public.approve_staff_signup($1, 'staff', null, '롤백직원', '팀원', $2)",
    [ids.rollback, ids.teamA],
  ),
  /forced profile failure/,
);
const rollbackState = await db.query(`
  select
    (select count(*)::int from public.employees where email = 'rollback@test.local') as employee_count,
    (select status from public.company_memberships where company_id = $1 and user_id = $2) as membership_status,
    (select approval_status from public.profiles where id = $2) as profile_status
`, [ids.companyA, ids.rollback]);
assert.deepEqual(rollbackState.rows[0], {
  employee_count: 0,
  membership_status: "pending",
  profile_status: "pending",
});

await asUser(ids.directorA);
await expectReject(
  () => db.query(
    "update public.profiles set role = 'super_admin' where id = $1",
    [ids.directorA],
  ),
  /승인·역할 변경 권한/,
);
const unchangedRole = await db.query(
  "select role from public.profiles where id = $1",
  [ids.directorA],
);
assert.equal(unchangedRole.rows[0].role, "admin");

await db.query(
  "update public.profiles set active_company_id = $1 where id = $2",
  [ids.companyB, ids.directorA],
);
const switchedCompany = await db.query(
  "select active_company_id from public.profiles where id = $1",
  [ids.directorA],
);
assert.equal(switchedCompany.rows[0].active_company_id, ids.companyB);

await expectReject(
  () => db.query(
    "update public.profiles set active_company_id = '10000000-0000-0000-0000-000000000099' where id = $1",
    [ids.directorA],
  ),
  /승인·역할 변경 권한/,
);

// Restore the deliberately inconsistent multi-active fixtures before running
// the production read-only verification SQL. Those rows exist only to exercise
// defensive branches above and are not valid steady-state production data.
await asUser(ids.ownerA);
await db.query(
  "update public.company_memberships set status = 'rejected' where company_id = $1 and user_id = any($2::uuid[])",
  [ids.companyB, [ids.otherActive]],
);
await db.query(
  "update public.profiles set active_company_id = $1 where id = $2",
  [ids.companyA, ids.directorA],
);

const policies = await db.query(`
  select policyname, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
  order by policyname
`);
for (const policy of policies.rows) {
  assert.match(policy.qual ?? policy.with_check ?? "", /auth\.uid\(\)/);
  assert.doesNotMatch(`${policy.qual ?? ""} ${policy.with_check ?? ""}`, /is_admin/);
}

const verification = readFileSync(
  "supabase/verifications/20260811060000_employee_assignment_guard_verify.sql",
  "utf8",
);

// The verifier must fail when trusted app metadata says a pending identity is
// not an owner but it has no nonterminal membership. Create a valid owner first,
// then deliberately corrupt only the trusted marker to exercise that branch.
await db.query(`
  insert into auth.users(id, email, raw_user_meta_data)
  values ($1, 'orphan-signup@test.local', '{"signup_type":"company_owner"}')
`, [signupGuardIds.orphan]);
await db.query(`
  update auth.users
  set raw_app_meta_data = jsonb_set(
    raw_app_meta_data,
    '{onboarding_type}',
    '"company_invite"'::jsonb,
    true
  )
  where id = $1
`, [signupGuardIds.orphan]);
await expectReject(
  () => db.exec(verification),
  /회사 멤버십이 없는 직원 승인 대기 프로필/,
);
await db.query("delete from public.profiles where id = $1", [signupGuardIds.orphan]);
await db.query("delete from auth.users where id = $1", [signupGuardIds.orphan]);
await db.exec(verification);

await db.close();
console.log("Local PostgreSQL approval integration tests: PASS");
