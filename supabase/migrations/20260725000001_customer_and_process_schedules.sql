-- =============================================================================
-- Eighty ERP — 고객상담 일정 + 공정 스케줄
-- 파일: 20260725000001_customer_and_process_schedules.sql
--
-- 안전: CRM/견적/자재 DROP 없음. 기존 migration 수정 없음. 재실행 가능.
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

-- 접근 헬퍼가 없으면 최소 보장 (기존 함수는 유지)
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

-- 담당자 기준 일정 접근: admin 전체 / manager 동팀 / staff 본인
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
      -- manager도 본인 일정
      public.is_manager_or_above()
      and p_employee_id = public.current_employee_id()
    );
$$;

grant execute on function public.can_access_schedule_assignee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) customer_schedules
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
alter table public.customer_schedules add column if not exists assigned_employee_id uuid references public.employees (id);
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

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_schedules_type_check') then
    alter table public.customer_schedules
      add constraint customer_schedules_type_check
      check (schedule_type in (
        '전화상담','방문상담','실측','견적작성','견적발송','계약상담','재연락','해피콜','기타'
      ));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_schedules_status_check') then
    alter table public.customer_schedules
      add constraint customer_schedules_status_check
      check (status in ('예정','진행중','완료','연기','취소','미처리'));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_schedules_priority_check') then
    alter table public.customer_schedules
      add constraint customer_schedules_priority_check
      check (priority in ('낮음','보통','높음','긴급'));
  end if;
exception when others then null;
end $$;

create index if not exists customer_schedules_start_idx
  on public.customer_schedules (start_at)
  where deleted_at is null;

create index if not exists customer_schedules_assignee_idx
  on public.customer_schedules (assigned_employee_id, start_at)
  where deleted_at is null;

create index if not exists customer_schedules_customer_idx
  on public.customer_schedules (customer_id, start_at)
  where deleted_at is null;

create index if not exists customer_schedules_status_idx
  on public.customer_schedules (status)
  where deleted_at is null;

drop trigger if exists customer_schedules_touch_updated_at on public.customer_schedules;
create trigger customer_schedules_touch_updated_at
  before update on public.customer_schedules
  for each row execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2) project_process_schedules
-- ---------------------------------------------------------------------------
create table if not exists public.project_process_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  customer_id uuid not null references public.customers (id) on delete cascade,
  assigned_employee_id uuid references public.employees (id),
  process_name text not null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default true,
  status text not null default '예정',
  progress integer not null default 0,
  contractor_name text,
  contractor_contact text,
  location text,
  dependency_schedule_id uuid,
  color_key text,
  checklist_note text,
  completion_note text,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text,
  constraint project_process_schedules_progress_check check (progress >= 0 and progress <= 100)
);

alter table public.project_process_schedules add column if not exists project_id uuid;
alter table public.project_process_schedules add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.project_process_schedules add column if not exists assigned_employee_id uuid references public.employees (id);
alter table public.project_process_schedules add column if not exists process_name text;
alter table public.project_process_schedules add column if not exists title text;
alter table public.project_process_schedules add column if not exists description text;
alter table public.project_process_schedules add column if not exists start_at timestamptz;
alter table public.project_process_schedules add column if not exists end_at timestamptz;
alter table public.project_process_schedules add column if not exists all_day boolean not null default true;
alter table public.project_process_schedules add column if not exists status text not null default '예정';
alter table public.project_process_schedules add column if not exists progress integer not null default 0;
alter table public.project_process_schedules add column if not exists contractor_name text;
alter table public.project_process_schedules add column if not exists contractor_contact text;
alter table public.project_process_schedules add column if not exists location text;
alter table public.project_process_schedules add column if not exists dependency_schedule_id uuid;
alter table public.project_process_schedules add column if not exists color_key text;
alter table public.project_process_schedules add column if not exists checklist_note text;
alter table public.project_process_schedules add column if not exists completion_note text;
alter table public.project_process_schedules add column if not exists completed_at timestamptz;
alter table public.project_process_schedules add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.project_process_schedules add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.project_process_schedules add column if not exists created_at timestamptz not null default now();
alter table public.project_process_schedules add column if not exists updated_at timestamptz not null default now();
alter table public.project_process_schedules add column if not exists deleted_at timestamptz;
alter table public.project_process_schedules add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.project_process_schedules add column if not exists delete_reason text;

do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'project_process_schedules_project_id_fkey'
     ) then
    alter table public.project_process_schedules
      add constraint project_process_schedules_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_process_schedules_dependency_fkey'
  ) then
    alter table public.project_process_schedules
      add constraint project_process_schedules_dependency_fkey
      foreign key (dependency_schedule_id)
      references public.project_process_schedules (id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_process_schedules_status_check') then
    alter table public.project_process_schedules
      add constraint project_process_schedules_status_check
      check (status in ('예정','진행중','완료','지연','중단','취소'));
  end if;
exception when others then null;
end $$;

create index if not exists process_schedules_start_idx
  on public.project_process_schedules (start_at)
  where deleted_at is null;

create index if not exists process_schedules_assignee_idx
  on public.project_process_schedules (assigned_employee_id, start_at)
  where deleted_at is null;

create index if not exists process_schedules_customer_idx
  on public.project_process_schedules (customer_id, start_at)
  where deleted_at is null;

create index if not exists process_schedules_project_idx
  on public.project_process_schedules (project_id, start_at)
  where deleted_at is null;

drop trigger if exists project_process_schedules_touch_updated_at on public.project_process_schedules;
create trigger project_process_schedules_touch_updated_at
  before update on public.project_process_schedules
  for each row execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) schedule_alert_events (카카오 API 없이 알림 이벤트만 준비)
--    기존 notification_events event_type check를 건드리지 않음
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_alert_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  schedule_kind text not null,
  schedule_id uuid not null,
  customer_id uuid references public.customers (id) on delete set null,
  project_id uuid,
  assigned_employee_id uuid references public.employees (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.schedule_alert_events add column if not exists event_type text;
alter table public.schedule_alert_events add column if not exists schedule_kind text;
alter table public.schedule_alert_events add column if not exists schedule_id uuid;
alter table public.schedule_alert_events add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.schedule_alert_events add column if not exists project_id uuid;
alter table public.schedule_alert_events add column if not exists assigned_employee_id uuid references public.employees (id) on delete set null;
alter table public.schedule_alert_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.schedule_alert_events add column if not exists status text not null default 'pending';
alter table public.schedule_alert_events add column if not exists created_at timestamptz not null default now();
alter table public.schedule_alert_events add column if not exists processed_at timestamptz;

create index if not exists schedule_alert_events_status_idx
  on public.schedule_alert_events (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
alter table public.customer_schedules enable row level security;
alter table public.project_process_schedules enable row level security;
alter table public.schedule_alert_events enable row level security;

drop policy if exists "staff_customer_schedules_select" on public.customer_schedules;
create policy "staff_customer_schedules_select" on public.customer_schedules
  for select to authenticated
  using (
    auth.uid() is not null
    and public.can_access_schedule_assignee(assigned_employee_id)
  );

drop policy if exists "staff_customer_schedules_insert" on public.customer_schedules;
create policy "staff_customer_schedules_insert" on public.customer_schedules
  for insert to authenticated
  with check (
    auth.uid() is not null
    and public.can_access_schedule_assignee(assigned_employee_id)
  );

drop policy if exists "staff_customer_schedules_update" on public.customer_schedules;
create policy "staff_customer_schedules_update" on public.customer_schedules
  for update to authenticated
  using (
    auth.uid() is not null
    and (
      public.is_admin()
      or public.can_access_schedule_assignee(assigned_employee_id)
      or created_by = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and (
      public.is_admin()
      or public.can_access_schedule_assignee(assigned_employee_id)
    )
  );

-- 공정: 담당자 null이면 생성자/관리자/매니저(팀)만 — 담당자 있으면 시 assignee 기준
drop policy if exists "staff_process_schedules_select" on public.project_process_schedules;
create policy "staff_process_schedules_select" on public.project_process_schedules
  for select to authenticated
  using (
    auth.uid() is not null
    and (
      public.is_admin()
      or created_by = auth.uid()
      or (
        assigned_employee_id is not null
        and public.can_access_schedule_assignee(assigned_employee_id)
      )
      or (
        assigned_employee_id is null
        and public.is_manager_or_above()
      )
    )
  );

drop policy if exists "staff_process_schedules_insert" on public.project_process_schedules;
create policy "staff_process_schedules_insert" on public.project_process_schedules
  for insert to authenticated
  with check (
    auth.uid() is not null
    and (
      public.is_admin()
      or assigned_employee_id is null
      or public.can_access_schedule_assignee(assigned_employee_id)
    )
  );

drop policy if exists "staff_process_schedules_update" on public.project_process_schedules;
create policy "staff_process_schedules_update" on public.project_process_schedules
  for update to authenticated
  using (
    auth.uid() is not null
    and (
      public.is_admin()
      or created_by = auth.uid()
      or (
        assigned_employee_id is not null
        and public.can_access_schedule_assignee(assigned_employee_id)
      )
      or (
        assigned_employee_id is null
        and public.is_manager_or_above()
      )
    )
  )
  with check (
    auth.uid() is not null
    and (
      public.is_admin()
      or assigned_employee_id is null
      or public.can_access_schedule_assignee(assigned_employee_id)
    )
  );

drop policy if exists "staff_schedule_alert_events_select" on public.schedule_alert_events;
create policy "staff_schedule_alert_events_select" on public.schedule_alert_events
  for select to authenticated
  using (
    auth.uid() is not null
    and (
      public.is_admin()
      or assigned_employee_id = public.current_employee_id()
      or public.can_access_schedule_assignee(assigned_employee_id)
    )
  );

drop policy if exists "staff_schedule_alert_events_insert" on public.schedule_alert_events;
create policy "staff_schedule_alert_events_insert" on public.schedule_alert_events
  for insert to authenticated
  with check (auth.uid() is not null);

grant select, insert, update on public.customer_schedules to authenticated;
grant select, insert, update on public.project_process_schedules to authenticated;
grant select, insert on public.schedule_alert_events to authenticated;

notify pgrst, 'reload schema';
