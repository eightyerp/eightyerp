-- =============================================================================
-- Eighty ERP — 고객상담 스케줄 v2 (컬럼 보강 + RLS 재확인)
-- 파일: 20260728000001_customer_schedules_v2.sql
-- 전제: 20260725000001_customer_and_process_schedules.sql (권장)
-- 안전: CRM/견적/자재 DROP 없음. 기존 migration 수정 없음. 재실행 가능.
-- 권한: profiles.role (staff / manager / admin / super_admin)
--       executive 역할은 DB에 없음 → super_admin 으로 취급
-- =============================================================================

-- 접근 헬퍼 재확인 (기존 정의 유지·보강)
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

create or replace function public.can_access_schedule_assignee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      p_employee_id is not null
      and p_employee_id = public.current_employee_id()
    )
    or (
      public.is_manager_or_above()
      and not public.is_admin()
      and p_employee_id is not null
      and exists (
        select 1
        from public.employees e
        where e.id = p_employee_id
          and e.team_id is not null
          and e.team_id = public.current_employee_team_id()
      )
    )
    or (
      public.is_manager_or_above()
      and p_employee_id = public.current_employee_id()
    );
$$;

grant execute on function public.can_access_schedule_assignee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- customer_schedules: 없으면 생성, 있으면 컬럼만 추가
-- ---------------------------------------------------------------------------
create table if not exists public.customer_schedules (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  assigned_employee_id uuid not null references public.employees (id),
  schedule_type text not null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  status text not null default '예정',
  priority text not null default '보통',
  location text,
  result_note text,
  next_contact_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

alter table public.customer_schedules add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.customer_schedules add column if not exists assigned_employee_id uuid;
alter table public.customer_schedules add column if not exists schedule_type text;
alter table public.customer_schedules add column if not exists title text;
alter table public.customer_schedules add column if not exists description text;
alter table public.customer_schedules add column if not exists start_at timestamptz;
alter table public.customer_schedules add column if not exists end_at timestamptz;
alter table public.customer_schedules add column if not exists all_day boolean not null default false;
alter table public.customer_schedules add column if not exists status text not null default '예정';
alter table public.customer_schedules add column if not exists priority text not null default '보통';
alter table public.customer_schedules add column if not exists location text;
alter table public.customer_schedules add column if not exists result_note text;
alter table public.customer_schedules add column if not exists next_contact_at timestamptz;
alter table public.customer_schedules add column if not exists completed_at timestamptz;
alter table public.customer_schedules add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.customer_schedules add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.customer_schedules add column if not exists created_at timestamptz not null default now();
alter table public.customer_schedules add column if not exists updated_at timestamptz not null default now();
alter table public.customer_schedules add column if not exists deleted_at timestamptz;
alter table public.customer_schedules add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.customer_schedules add column if not exists delete_reason text;
alter table public.customer_schedules add column if not exists customer_reaction text;
alter table public.customer_schedules add column if not exists next_action text;

-- check 제약은 이미 있을 수 있으므로 안전하게 재생성
do $$
begin
  alter table public.customer_schedules drop constraint if exists customer_schedules_schedule_type_check;
  alter table public.customer_schedules
    add constraint customer_schedules_schedule_type_check
    check (schedule_type in (
      '전화상담','방문상담','실측','견적작성','견적발송','계약상담','재연락','해피콜','기타'
    ));
exception when others then null;
end $$;

do $$
begin
  alter table public.customer_schedules drop constraint if exists customer_schedules_status_check;
  alter table public.customer_schedules
    add constraint customer_schedules_status_check
    check (status in ('예정','진행중','완료','연기','취소','미처리'));
exception when others then null;
end $$;

do $$
begin
  alter table public.customer_schedules drop constraint if exists customer_schedules_priority_check;
  alter table public.customer_schedules
    add constraint customer_schedules_priority_check
    check (priority in ('낮음','보통','높음','긴급'));
exception when others then null;
end $$;

create index if not exists customer_schedules_start_at_idx
  on public.customer_schedules (start_at)
  where deleted_at is null;

create index if not exists customer_schedules_assignee_idx
  on public.customer_schedules (assigned_employee_id)
  where deleted_at is null;

create index if not exists customer_schedules_customer_idx
  on public.customer_schedules (customer_id)
  where deleted_at is null;

create index if not exists customer_schedules_status_idx
  on public.customer_schedules (status)
  where deleted_at is null;

create index if not exists customer_schedules_next_contact_idx
  on public.customer_schedules (next_contact_at)
  where deleted_at is null and next_contact_at is not null;

drop trigger if exists customer_schedules_touch_updated_at on public.customer_schedules;
create trigger customer_schedules_touch_updated_at
  before update on public.customer_schedules
  for each row execute function public.touch_updated_at_column();

alter table public.customer_schedules enable row level security;

drop policy if exists "staff_customer_schedules_select" on public.customer_schedules;
create policy "staff_customer_schedules_select"
  on public.customer_schedules for select to authenticated
  using (
    deleted_at is null
    and public.can_access_schedule_assignee(assigned_employee_id)
  );

drop policy if exists "staff_customer_schedules_insert" on public.customer_schedules;
create policy "staff_customer_schedules_insert"
  on public.customer_schedules for insert to authenticated
  with check (public.can_access_schedule_assignee(assigned_employee_id));

drop policy if exists "staff_customer_schedules_update" on public.customer_schedules;
create policy "staff_customer_schedules_update"
  on public.customer_schedules for update to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or public.can_access_schedule_assignee(assigned_employee_id)
  )
  with check (
    public.is_admin()
    or public.can_access_schedule_assignee(assigned_employee_id)
  );

-- 실제 DELETE 금지: soft delete(UPDATE)만
revoke delete on public.customer_schedules from authenticated;
grant select, insert, update on public.customer_schedules to authenticated;

comment on table public.customer_schedules is
  '고객상담 일정. soft delete. 권한: staff=본인, manager=팀, admin/super_admin=전체';
