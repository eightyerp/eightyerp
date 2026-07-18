-- =============================================================================
-- Eighty ERP — 직원 회원가입 + 관리자 승인
-- 파일: 20260801000001_employee_signup_approval.sql
-- 안전: DROP TABLE/DELETE/TRUNCATE 없음. 기존 계정·고객·일정·현장 데이터 유지.
-- 재실행 가능.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles 승인 관련 컬럼
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists full_name text;

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists requested_team text;

alter table public.profiles
  add column if not exists requested_title text;

alter table public.profiles
  add column if not exists is_approved boolean not null default false;

alter table public.profiles
  add column if not exists approval_status text not null default 'pending';

alter table public.profiles
  add column if not exists approved_at timestamptz;

alter table public.profiles
  add column if not exists approved_by uuid references auth.users (id) on delete set null;

alter table public.profiles
  add column if not exists rejected_at timestamptz;

alter table public.profiles
  add column if not exists rejection_reason text;

-- approval_status 체크 (없을 때만)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_approval_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
exception when others then null;
end $$;

create index if not exists profiles_approval_status_idx
  on public.profiles (approval_status);

create index if not exists profiles_is_approved_idx
  on public.profiles (is_approved)
  where is_approved = false;

-- 기존 활성 계정만 승인 완료로 백필 (신규 가입 대기는 is_active=false).
-- 데이터 삭제·비활성 계정 강제 활성화 없음.
update public.profiles
set
  is_approved = true,
  approval_status = 'approved',
  approved_at = coalesce(approved_at, created_at, now())
where is_active = true
  and approval_status = 'pending';

-- 이미 직원에 연결된 비활성 계정도 '기존 계정'으로 보고 승인 플래그만 부여
-- (is_active는 false 유지 → ERP 접근은 계속 차단)
update public.profiles
set
  is_approved = true,
  approval_status = 'approved'
where is_active = false
  and employee_id is not null
  and approval_status = 'pending';

-- ---------------------------------------------------------------------------
-- 2) 신규 Auth 가입 시 승인대기 프로필 생성
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_team text;
  v_title text;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_team := nullif(trim(coalesce(new.raw_user_meta_data->>'requested_team', '')), '');
  v_title := nullif(trim(coalesce(new.raw_user_meta_data->>'requested_title', '')), '');

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    requested_team,
    requested_title,
    role,
    permissions,
    is_active,
    is_approved,
    approval_status
  )
  values (
    new.id,
    new.email,
    v_name,
    v_phone,
    v_team,
    v_title,
    'staff',
    '{}'::jsonb,
    false,
    false,
    'pending'
  )
  on conflict (id) do update
    set
      email = coalesce(excluded.email, public.profiles.email),
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      phone = coalesce(excluded.phone, public.profiles.phone),
      requested_team = coalesce(excluded.requested_team, public.profiles.requested_team),
      requested_title = coalesce(excluded.requested_title, public.profiles.requested_title),
      -- 자기 승격 방지: conflict 시에도 role/승인 필드는 기존값 유지
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3) ERP 접근 헬퍼 (승인 + 활성)
-- ---------------------------------------------------------------------------
create or replace function public.is_erp_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select is_active = true
         and is_approved = true
         and approval_status = 'approved'
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
    and is_approved = true
    and approval_status = 'approved';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role in ('admin', 'super_admin')
      from public.profiles
      where id = auth.uid()
        and is_active = true
        and is_approved = true
        and approval_status = 'approved'
    ),
    false
  );
$$;

create or replace function public.is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role in ('manager', 'admin', 'super_admin')
      from public.profiles
      where id = auth.uid()
        and is_active = true
        and is_approved = true
        and approval_status = 'approved'
    ),
    false
  );
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select employee_id
  from public.profiles
  where id = auth.uid()
    and is_active = true
    and is_approved = true
    and approval_status = 'approved';
$$;

create or replace function public.current_employee_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.team_id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where p.id = auth.uid()
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved';
$$;

-- ---------------------------------------------------------------------------
-- 4) 자기 role/승인 필드 변조 방지
-- ---------------------------------------------------------------------------
create or replace function public.profiles_enforce_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 관리자(승인된 admin/super_admin)만 민감 필드 변경 가능
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
      or new.is_approved is distinct from old.is_approved
      or new.is_active is distinct from old.is_active
      or new.employee_id is distinct from old.employee_id
      or new.permissions is distinct from old.permissions
      or new.approval_status is distinct from old.approval_status
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
    then
      raise exception '승인·역할 변경 권한이 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_security on public.profiles;
create trigger profiles_enforce_security
  before update on public.profiles
  for each row execute function public.profiles_enforce_security();

-- ---------------------------------------------------------------------------
-- 5) profiles RLS — 가입 시 staff/미승인만 자기 insert 허용
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      id = auth.uid()
      and role = 'staff'
      and coalesce(is_approved, false) = false
      and coalesce(is_active, false) = false
      and coalesce(approval_status, 'pending') = 'pending'
    )
  );

-- ---------------------------------------------------------------------------
-- 6) employees / teams — 승인된 ERP 사용자만 조회, 쓰기는 관리자
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is not null then
    alter table public.employees enable row level security;

    drop policy if exists "employees_select_authenticated" on public.employees;
    drop policy if exists "employees_insert_authenticated" on public.employees;
    drop policy if exists "employees_update_authenticated" on public.employees;
    drop policy if exists "employees_delete_authenticated" on public.employees;
    drop policy if exists "employees_select_erp" on public.employees;
    drop policy if exists "employees_insert_admin" on public.employees;
    drop policy if exists "employees_update_admin" on public.employees;
    drop policy if exists "employees_delete_admin" on public.employees;

    create policy "employees_select_erp" on public.employees
      for select to authenticated
      using (public.is_erp_user());

    create policy "employees_insert_admin" on public.employees
      for insert to authenticated
      with check (public.is_admin());

    create policy "employees_update_admin" on public.employees
      for update to authenticated
      using (public.is_admin())
      with check (public.is_admin());

    create policy "employees_delete_admin" on public.employees
      for delete to authenticated
      using (public.is_admin());
  end if;

  if to_regclass('public.teams') is not null then
    alter table public.teams enable row level security;

    drop policy if exists "teams_select_authenticated" on public.teams;
    drop policy if exists "teams_insert_authenticated" on public.teams;
    drop policy if exists "teams_update_authenticated" on public.teams;
    drop policy if exists "teams_delete_authenticated" on public.teams;
    drop policy if exists "teams_select_erp" on public.teams;
    drop policy if exists "teams_write_admin" on public.teams;

    create policy "teams_select_erp" on public.teams
      for select to authenticated
      using (public.is_erp_user());

    create policy "teams_write_admin" on public.teams
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) customers — 승인된 사용자만 조회/등록/수정 (관리자 소프트삭제 정책 유지)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.customers') is not null then
    drop policy if exists "customers_select_active_or_admin" on public.customers;
    drop policy if exists "customers_insert_authenticated" on public.customers;
    drop policy if exists "customers_update_staff" on public.customers;
    drop policy if exists "customers_select_erp" on public.customers;
    drop policy if exists "customers_insert_erp" on public.customers;
    drop policy if exists "customers_update_staff_erp" on public.customers;

    create policy "customers_select_erp" on public.customers
      for select to authenticated
      using (
        public.is_erp_user()
        and (deleted_at is null or public.is_admin())
      );

    create policy "customers_insert_erp" on public.customers
      for insert to authenticated
      with check (public.is_erp_user());

    create policy "customers_update_staff_erp" on public.customers
      for update to authenticated
      using (public.is_erp_user() and deleted_at is null and not public.is_admin())
      with check (
        public.is_erp_user()
        and deleted_at is null
        and deleted_by is null
        and delete_reason is null
      );

    -- customers_update_admin / customers_delete_admin_only 는 기존 유지
    -- (is_admin()이 승인·활성 관리자만 true)
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) projects — 승인 사용자만 (테이블 있을 때)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.projects') is not null then
    drop policy if exists "staff_projects_select" on public.projects;
    drop policy if exists "staff_projects_insert" on public.projects;
    drop policy if exists "staff_projects_update" on public.projects;
    drop policy if exists "projects_select_erp" on public.projects;
    drop policy if exists "projects_insert_erp" on public.projects;
    drop policy if exists "projects_update_erp" on public.projects;

    create policy "projects_select_erp" on public.projects
      for select to authenticated
      using (public.is_erp_user());

    create policy "projects_insert_erp" on public.projects
      for insert to authenticated
      with check (public.is_erp_user());

    create policy "projects_update_erp" on public.projects
      for update to authenticated
      using (public.is_erp_user())
      with check (public.is_erp_user());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9) 승인 RPC (admin/super_admin only)
-- ---------------------------------------------------------------------------
create or replace function public.approve_staff_signup(
  p_user_id uuid,
  p_role text,
  p_employee_id uuid default null,
  p_employee_name text default null,
  p_employee_title text default null,
  p_team_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_employee_id uuid;
begin
  if not public.is_admin() then
    raise exception '관리자만 가입을 승인할 수 있습니다.';
  end if;

  if p_role not in ('super_admin', 'admin', 'manager', 'staff') then
    raise exception 'invalid role: %', p_role;
  end if;

  -- staff는 다른 직원을 admin/super_admin으로 올리는 건 관리자만 (이미 is_admin 체크)

  v_employee_id := p_employee_id;

  if v_employee_id is null then
    if p_employee_name is null or trim(p_employee_name) = '' then
      raise exception '연결할 직원 또는 새 직원 이름이 필요합니다.';
    end if;
    if p_employee_title is null or trim(p_employee_title) = '' then
      raise exception '직급을 입력해 주세요.';
    end if;

    insert into public.employees (team_id, name, title, is_active, sort_order)
    values (
      p_team_id,
      trim(p_employee_name),
      trim(p_employee_title),
      true,
      100
    )
    returning id into v_employee_id;
  else
    -- 기존 직원 연결 시 팀/직급 갱신(선택)
    if p_employee_title is not null and trim(p_employee_title) <> '' then
      update public.employees
      set
        title = trim(p_employee_title),
        team_id = coalesce(p_team_id, team_id),
        is_active = true,
        updated_at = now()
      where id = v_employee_id;
    elsif p_team_id is not null then
      update public.employees
      set team_id = p_team_id, is_active = true, updated_at = now()
      where id = v_employee_id;
    end if;
  end if;

  update public.profiles
  set
    employee_id = v_employee_id,
    role = p_role,
    is_active = true,
    is_approved = true,
    approval_status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    rejected_at = null,
    rejection_reason = null,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception '승인 대상 프로필을 찾을 수 없습니다.';
  end if;

  return v_profile;
end;
$$;

create or replace function public.reject_staff_signup(
  p_user_id uuid,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception '관리자만 가입을 거절할 수 있습니다.';
  end if;

  update public.profiles
  set
    is_active = false,
    is_approved = false,
    approval_status = 'rejected',
    rejected_at = now(),
    rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception '거절 대상 프로필을 찾을 수 없습니다.';
  end if;

  return v_profile;
end;
$$;

create or replace function public.deactivate_staff_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception '관리자만 계정을 비활성화할 수 있습니다.';
  end if;

  if p_user_id = auth.uid() then
    raise exception '본인 계정은 비활성화할 수 없습니다.';
  end if;

  update public.profiles
  set
    is_active = false,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception '대상 프로필을 찾을 수 없습니다.';
  end if;

  return v_profile;
end;
$$;

-- link helper도 승인 완료로 맞춤
create or replace function public.link_profile_to_employee(
  p_user_id uuid,
  p_employee_name text,
  p_role text default 'staff',
  p_permissions jsonb default '{}'::jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_profile public.profiles;
begin
  if p_role not in ('super_admin', 'admin', 'manager', 'staff') then
    raise exception 'invalid role: %', p_role;
  end if;

  select id into v_employee_id
  from public.employees
  where name = p_employee_name
  order by sort_order
  limit 1;

  if v_employee_id is null then
    raise exception 'employee not found: %', p_employee_name;
  end if;

  insert into public.profiles (
    id, employee_id, role, permissions, is_active, is_approved, approval_status, approved_at
  )
  values (
    p_user_id, v_employee_id, p_role, coalesce(p_permissions, '{}'::jsonb),
    true, true, 'approved', now()
  )
  on conflict (id) do update
    set employee_id = excluded.employee_id,
        role = excluded.role,
        permissions = excluded.permissions,
        is_active = true,
        is_approved = true,
        approval_status = 'approved',
        approved_at = coalesce(public.profiles.approved_at, now()),
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.is_erp_user() to authenticated;
grant execute on function public.is_erp_user() to anon;
grant execute on function public.approve_staff_signup(uuid, text, uuid, text, text, uuid) to authenticated;
grant execute on function public.reject_staff_signup(uuid, text) to authenticated;
grant execute on function public.deactivate_staff_user(uuid) to authenticated;

notify pgrst, 'reload schema';
