-- =============================================================================
-- Eighty ERP — employee_tasks schema repair for current multi-company model
-- 파일: 20260816000000_employee_tasks_schema_repair.sql
--
-- 배경:
--   - 앱은 public.employee_tasks 를 사용하지만 운영 DB에는 테이블이 없음.
--   - 20260729000001_employee_tasks.sql 은 구형 profiles.role 권한 함수를 함께 덮어쓰므로
--     현재 멀티회사 Employee Master 환경에 그대로 재적용하면 안 됨.
--
-- 원칙:
--   - 현재 권한 함수(is_admin / can_access_schedule_assignee 등)는 절대 재정의하지 않음.
--   - company_id 를 명시적으로 보유하고 RESTRICTIVE company guard 적용.
--   - 고객/현장/견적 참조가 있으면 반드시 동일 company인지 검증.
--   - DELETE 권한은 주지 않고 기존 앱의 soft delete만 허용.
--   - 기존 테이블이 있는 환경도 안전하게 보강할 수 있도록 backfill + 검증 후 NOT NULL.
-- =============================================================================

begin;

create table if not exists public.employee_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  title text not null,
  description text,
  assigned_employee_id uuid not null,
  customer_id uuid,
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

-- 구형 employee_tasks 가 이미 있는 환경 보강.
alter table public.employee_tasks add column if not exists company_id uuid;
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

-- 기존 데이터가 있다면 가장 강한 부모인 담당직원부터 회사 상속.
update public.employee_tasks task
set company_id = employee.company_id
from public.employees employee
where task.company_id is null
  and task.assigned_employee_id = employee.id
  and employee.company_id is not null;

update public.employee_tasks task
set company_id = customer.company_id
from public.customers customer
where task.company_id is null
  and task.customer_id = customer.id
  and customer.company_id is not null;

update public.employee_tasks task
set company_id = project.company_id
from public.projects project
where task.company_id is null
  and task.project_id = project.id
  and project.company_id is not null;

update public.employee_tasks task
set company_id = quote.company_id
from public.quotes quote
where task.company_id is null
  and task.quote_id = quote.id
  and quote.company_id is not null;

-- FK 생성 전 데이터 정합성 검증. 하나라도 어긋나면 전체 migration rollback.
do $$
declare
  v_company_null integer;
  v_assignee_mismatch integer;
  v_customer_mismatch integer;
  v_project_mismatch integer;
  v_quote_mismatch integer;
begin
  select count(*)::integer into v_company_null
  from public.employee_tasks
  where company_id is null;

  select count(*)::integer into v_assignee_mismatch
  from public.employee_tasks task
  left join public.employees employee on employee.id = task.assigned_employee_id
  where employee.id is null
     or employee.company_id is distinct from task.company_id;

  select count(*)::integer into v_customer_mismatch
  from public.employee_tasks task
  left join public.customers customer on customer.id = task.customer_id
  where task.customer_id is not null
    and (customer.id is null or customer.company_id is distinct from task.company_id);

  select count(*)::integer into v_project_mismatch
  from public.employee_tasks task
  left join public.projects project on project.id = task.project_id
  where task.project_id is not null
    and (project.id is null or project.company_id is distinct from task.company_id);

  select count(*)::integer into v_quote_mismatch
  from public.employee_tasks task
  left join public.quotes quote on quote.id = task.quote_id
  where task.quote_id is not null
    and (quote.id is null or quote.company_id is distinct from task.company_id);

  if v_company_null <> 0
     or v_assignee_mismatch <> 0
     or v_customer_mismatch <> 0
     or v_project_mismatch <> 0
     or v_quote_mismatch <> 0 then
    raise exception
      'employee_tasks 정합성 검증 실패: company_null=%, assignee=%, customer=%, project=%, quote=%',
      v_company_null,
      v_assignee_mismatch,
      v_customer_mismatch,
      v_project_mismatch,
      v_quote_mismatch;
  end if;
end $$;

alter table public.employee_tasks
  alter column company_id set default public.current_company_id();
alter table public.employee_tasks
  alter column company_id set not null;
alter table public.employee_tasks
  alter column title set not null;
alter table public.employee_tasks
  alter column assigned_employee_id set not null;

-- 현재 스키마 기준 FK. 기존 구형 테이블에서도 중복 생성하지 않음.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_tasks'::regclass
      and conname = 'employee_tasks_company_id_fkey'
  ) then
    alter table public.employee_tasks
      add constraint employee_tasks_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_tasks'::regclass
      and conname = 'employee_tasks_assigned_employee_id_fkey'
  ) then
    alter table public.employee_tasks
      add constraint employee_tasks_assigned_employee_id_fkey
      foreign key (assigned_employee_id) references public.employees(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_tasks'::regclass
      and conname = 'employee_tasks_customer_id_fkey'
  ) then
    alter table public.employee_tasks
      add constraint employee_tasks_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_tasks'::regclass
      and conname = 'employee_tasks_project_id_fkey'
  ) then
    alter table public.employee_tasks
      add constraint employee_tasks_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_tasks'::regclass
      and conname = 'employee_tasks_quote_id_fkey'
  ) then
    alter table public.employee_tasks
      add constraint employee_tasks_quote_id_fkey
      foreign key (quote_id) references public.quotes(id) on delete set null;
  end if;
end $$;

create index if not exists employee_tasks_company_assignee_due_idx
  on public.employee_tasks (company_id, assigned_employee_id, due_at)
  where deleted_at is null;

create index if not exists employee_tasks_company_status_due_idx
  on public.employee_tasks (company_id, status, due_at)
  where deleted_at is null;

drop trigger if exists employee_tasks_touch_updated_at on public.employee_tasks;
create trigger employee_tasks_touch_updated_at
  before update on public.employee_tasks
  for each row execute function public.touch_updated_at_column();

alter table public.employee_tasks enable row level security;

-- 회사 경계는 다른 permissive policy와 OR로 합쳐지면 안 되므로 반드시 RESTRICTIVE.
drop policy if exists employee_tasks_company_guard on public.employee_tasks;
create policy employee_tasks_company_guard
  on public.employee_tasks
  as restrictive
  for all
  to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

drop policy if exists staff_employee_tasks_select on public.employee_tasks;
create policy staff_employee_tasks_select
  on public.employee_tasks
  for select
  to authenticated
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.can_access_schedule_assignee(assigned_employee_id)
  );

drop policy if exists staff_employee_tasks_insert on public.employee_tasks;
create policy staff_employee_tasks_insert
  on public.employee_tasks
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.can_access_schedule_assignee(assigned_employee_id)
    and (
      customer_id is null
      or exists (
        select 1 from public.customers customer
        where customer.id = employee_tasks.customer_id
          and customer.company_id = employee_tasks.company_id
      )
    )
    and (
      project_id is null
      or exists (
        select 1 from public.projects project
        where project.id = employee_tasks.project_id
          and project.company_id = employee_tasks.company_id
      )
    )
    and (
      quote_id is null
      or exists (
        select 1 from public.quotes quote
        where quote.id = employee_tasks.quote_id
          and quote.company_id = employee_tasks.company_id
      )
    )
  );

drop policy if exists staff_employee_tasks_update on public.employee_tasks;
create policy staff_employee_tasks_update
  on public.employee_tasks
  for update
  to authenticated
  using (
    auth.uid() is not null
    and deleted_at is null
    and (
      public.is_admin()
      or created_by = auth.uid()
      or public.can_access_schedule_assignee(assigned_employee_id)
    )
  )
  with check (
    auth.uid() is not null
    and (
      public.is_admin()
      or public.can_access_schedule_assignee(assigned_employee_id)
    )
    and (
      customer_id is null
      or exists (
        select 1 from public.customers customer
        where customer.id = employee_tasks.customer_id
          and customer.company_id = employee_tasks.company_id
      )
    )
    and (
      project_id is null
      or exists (
        select 1 from public.projects project
        where project.id = employee_tasks.project_id
          and project.company_id = employee_tasks.company_id
      )
    )
    and (
      quote_id is null
      or exists (
        select 1 from public.quotes quote
        where quote.id = employee_tasks.quote_id
          and quote.company_id = employee_tasks.company_id
      )
    )
  );

revoke all on table public.employee_tasks from public, anon;
revoke delete on public.employee_tasks from authenticated;
grant select, insert, update on public.employee_tasks to authenticated;

comment on table public.employee_tasks is
  '직원 내부 할 일. company-scoped RLS, staff=본인, manager=팀, owner/director/admin=전체, soft delete.';

notify pgrst, 'reload schema';

commit;
