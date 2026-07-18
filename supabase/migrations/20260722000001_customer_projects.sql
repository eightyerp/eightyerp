-- =============================================================================
-- Eighty ERP — 고객 현장(projects) + project_materials.project_id FK
-- 파일: 20260722000001_customer_projects.sql
-- 안전: CRM/카탈로그 DROP 없음. 재실행 가능.
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

-- ---------------------------------------------------------------------------
-- 1) projects (현장)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  address text,
  status text not null default '진행중'
    check (status in ('준비', '진행중', '완료', '보류', '취소')),
  assigned_employee_id uuid references public.employees (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

alter table public.projects
  add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.projects
  add column if not exists name text;
alter table public.projects
  add column if not exists address text;
alter table public.projects
  add column if not exists status text;
alter table public.projects
  add column if not exists assigned_employee_id uuid references public.employees (id) on delete set null;
alter table public.projects
  add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.projects
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.projects
  add column if not exists created_at timestamptz not null default now();
alter table public.projects
  add column if not exists updated_at timestamptz not null default now();
alter table public.projects
  add column if not exists deleted_at timestamptz;
alter table public.projects
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.projects
  add column if not exists delete_reason text;

-- status 기본값/체크 (없을 때만)
do $$
begin
  update public.projects set status = '진행중' where status is null or status = '';
  alter table public.projects alter column status set default '진행중';
exception when others then null;
end $$;

create index if not exists projects_customer_idx
  on public.projects (customer_id)
  where deleted_at is null;

create index if not exists projects_status_idx
  on public.projects (status)
  where deleted_at is null;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row
  execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2) project_materials.project_id FK (테이블이 있을 때만)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.project_materials') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'project_materials_project_id_fkey'
     ) then
    alter table public.project_materials
      add constraint project_materials_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists "staff_projects_select" on public.projects;
create policy "staff_projects_select" on public.projects
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_projects_insert" on public.projects;
create policy "staff_projects_insert" on public.projects
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_projects_update" on public.projects;
create policy "staff_projects_update" on public.projects
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

grant select, insert, update on public.projects to authenticated;

notify pgrst, 'reload schema';
