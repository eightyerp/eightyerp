-- Eighty ERP: CRM 접근 헬퍼 함수 보장
-- 목적: can_access_customer / is_admin 등이 없는 DB에서도
--       자재·견적 RLS가 동작하도록 헬퍼를 먼저 설치한다.
-- 비파괴: 고객 데이터 삭제 없음. 재실행 가능.

-- ---------------------------------------------------------------------------
-- 0) 전제 테이블 (없으면 최소 생성 — 기존 데이터 유지)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  role text not null default 'staff'
    check (role in ('super_admin', 'admin', 'manager', 'staff')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_employee_id_idx on public.profiles (employee_id);
create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- 1) 역할 헬퍼
-- ---------------------------------------------------------------------------
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
    and is_active = true;
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
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) 직원/팀 헬퍼
-- ---------------------------------------------------------------------------
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
    and is_active = true;
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
    and p.is_active = true;
$$;

-- ---------------------------------------------------------------------------
-- 3) 고객 접근 권한 (자재/견적 RLS가 의존)
--    - admin/super_admin: 전체
--    - 담당 직원이거나 같은 팀이면 접근
--    - 담당자 미지정 고객도 접근 가능
-- ---------------------------------------------------------------------------
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.customers c
      left join public.employees assignee on assignee.id = c.assigned_employee_id
      where c.id = p_customer_id
        and (
          c.assigned_employee_id = public.current_employee_id()
          or (
            public.current_employee_team_id() is not null
            and assignee.team_id = public.current_employee_team_id()
          )
          or c.assigned_employee_id is null
        )
    );
$$;

-- authenticated 역할에서 RLS/정책 평가에 사용
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager_or_above() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.current_employee_team_id() to authenticated;
grant execute on function public.can_access_customer(uuid) to authenticated;

-- anon은 고객 포털 RPC(security definer)만 사용 — 직접 호출 불필요
grant execute on function public.is_admin() to anon;
grant execute on function public.can_access_customer(uuid) to anon;

notify pgrst, 'reload schema';
