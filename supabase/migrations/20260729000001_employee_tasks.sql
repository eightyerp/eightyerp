-- =============================================================================
-- Eighty ERP — 직원 내부 할 일 (employee_tasks)
-- 파일: 20260729000001_employee_tasks.sql
-- 안전: CRM/견적/자재/일정 DROP 없음. 기존 migration 수정 없음. 재실행 가능.
-- 권한: profiles.role (staff / manager / admin / super_admin)
-- =============================================================================

create or replace function public.touch_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
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

create table if not exists public.employee_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_employee_id uuid not null references public.employees (id),
  customer_id uuid references public.customers (id) on delete set null,
  project_id uuid,
  quote_id uuid,
  due_at timestamptz,
  priority text not null default '보통',
  status text not null default '대기',
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text,
  constraint employee_tasks_priority_check
    check (priority in ('낮음', '보통', '높음', '긴급')),
  constraint employee_tasks_status_check
    check (status in ('대기', '진행중', '완료', '취소'))
);

alter table public.employee_tasks add column if not exists title text;
alter table public.employee_tasks add column if not exists description text;
alter table public.employee_tasks add column if not exists assigned_employee_id uuid;
alter table public.employee_tasks add column if not exists customer_id uuid;
alter table public.employee_tasks add column if not exists project_id uuid;
alter table public.employee_tasks add column if not exists quote_id uuid;
alter table public.employee_tasks add column if not exists due_at timestamptz;
alter table public.employee_tasks add column if not exists priority text not null default '보통';
alter table public.employee_tasks add column if not exists status text not null default '대기';
alter table public.employee_tasks add column if not exists completed_at timestamptz;
alter table public.employee_tasks add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.employee_tasks add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.employee_tasks add column if not exists created_at timestamptz not null default now();
alter table public.employee_tasks add column if not exists updated_at timestamptz not null default now();
alter table public.employee_tasks add column if not exists deleted_at timestamptz;
alter table public.employee_tasks add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.employee_tasks add column if not exists delete_reason text;

create index if not exists employee_tasks_assignee_idx
  on public.employee_tasks (assigned_employee_id)
  where deleted_at is null;

create index if not exists employee_tasks_due_at_idx
  on public.employee_tasks (due_at)
  where deleted_at is null;

create index if not exists employee_tasks_status_idx
  on public.employee_tasks (status)
  where deleted_at is null;

drop trigger if exists employee_tasks_touch_updated_at on public.employee_tasks;
create trigger employee_tasks_touch_updated_at
  before update on public.employee_tasks
  for each row execute function public.touch_updated_at_column();

alter table public.employee_tasks enable row level security;

drop policy if exists "staff_employee_tasks_select" on public.employee_tasks;
create policy "staff_employee_tasks_select"
  on public.employee_tasks for select to authenticated
  using (
    deleted_at is null
    and public.can_access_schedule_assignee(assigned_employee_id)
  );

drop policy if exists "staff_employee_tasks_insert" on public.employee_tasks;
create policy "staff_employee_tasks_insert"
  on public.employee_tasks for insert to authenticated
  with check (public.can_access_schedule_assignee(assigned_employee_id));

drop policy if exists "staff_employee_tasks_update" on public.employee_tasks;
create policy "staff_employee_tasks_update"
  on public.employee_tasks for update to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or public.can_access_schedule_assignee(assigned_employee_id)
  )
  with check (
    public.is_admin()
    or public.can_access_schedule_assignee(assigned_employee_id)
  );

revoke delete on public.employee_tasks from authenticated;
grant select, insert, update on public.employee_tasks to authenticated;

comment on table public.employee_tasks is
  '직원 내부 할 일. soft delete. staff=본인, manager=팀, admin/super_admin=전체';
