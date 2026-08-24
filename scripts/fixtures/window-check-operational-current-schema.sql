-- CI-only minimal fixture representing the current ERP objects used by
-- 20260818030000_window_check_operational_storage_v1.sql.
--
-- This is NOT a production migration and must never be applied to ERP.
-- It deliberately models only the tables/functions/policies that the Window Check
-- migration and authenticated mobile lifecycle depend on, while auth/storage objects
-- are supplied by local Supabase.

create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Fixture Company',
  status text not null default 'active'
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  name text not null default 'Fixture Employee',
  title text not null default 'staff',
  is_active boolean not null default true,
  merged_into_employee_id uuid
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id),
  active_company_id uuid references public.companies(id),
  is_active boolean not null default true,
  is_approved boolean not null default false,
  approval_status text not null default 'pending'
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id),
  employee_id uuid references public.employees(id),
  role text not null default 'employee',
  status text not null default 'pending'
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  assigned_employee_id uuid references public.employees(id),
  deleted_at timestamptz
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  customer_id uuid not null references public.customers(id),
  deleted_at timestamptz
);

create table public.window_inspections (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  customer_id uuid not null references public.customers(id),
  project_id uuid not null references public.projects(id),
  performed_by_user_id uuid not null references auth.users(id),
  performed_by_employee_id uuid not null references public.employees(id),
  inspection_status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_windows integer not null default 0,
  status_counts jsonb not null default '{}'::jsonb,
  highest_status_level integer,
  report_status text not null default 'draft',
  report_reference text,
  version bigint not null default 1,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, client_request_id)
);

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile_row.active_company_id
  from public.profiles profile_row
  join public.company_memberships membership_row
    on membership_row.user_id = profile_row.id
   and membership_row.company_id = profile_row.active_company_id
   and membership_row.status = 'active'
  join public.companies company_row
    on company_row.id = membership_row.company_id
   and company_row.status = 'active'
  left join public.employees employee_row
    on employee_row.id = membership_row.employee_id
   and employee_row.company_id = membership_row.company_id
  where profile_row.id = auth.uid()
    and auth.uid() is not null
    and profile_row.active_company_id is not null
    and profile_row.is_active = true
    and profile_row.is_approved = true
    and profile_row.approval_status = 'approved'
    and membership_row.role in ('owner', 'director', 'admin', 'manager', 'employee')
    and membership_row.employee_id is not distinct from profile_row.employee_id
    and (
      (
        membership_row.employee_id is null
        and membership_row.role in ('owner', 'director', 'admin')
      )
      or (
        employee_row.id is not null
        and employee_row.is_active = true
        and employee_row.merged_into_employee_id is null
      )
    )
  limit 1;
$$;

create or replace function public.current_company_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership_row.role
  from public.company_memberships membership_row
  where membership_row.user_id = auth.uid()
    and auth.uid() is not null
    and membership_row.company_id = public.current_company_id()
    and membership_row.status = 'active'
    and membership_row.role in ('owner', 'director', 'admin', 'manager', 'employee')
  limit 1;
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_company_role() in ('owner', 'director', 'admin'),
    false
  );
$$;

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.company_id = public.current_company_id()
      and (
        public.is_admin()
        or (
          public.current_employee_id() is not null
          and c.assigned_employee_id = public.current_employee_id()
        )
      )
  );
$$;

alter table public.window_inspections enable row level security;

create policy window_inspections_company_select
on public.window_inspections
for select to authenticated
using (company_id = (select public.current_company_id()));

-- Mirror the already-deployed 20260816012630 parent policies so the isolated
-- #87 test exercises the same scaffold/finalize contract as the Android client.
create policy window_inspections_company_insert
on public.window_inspections for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and performed_by_user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    join public.company_memberships m on m.user_id = p.id
      and m.company_id = window_inspections.company_id
      and m.employee_id = window_inspections.performed_by_employee_id
    where p.id = (select auth.uid())
      and p.employee_id = window_inspections.performed_by_employee_id
      and p.is_active = true
      and p.is_approved = true
      and p.approval_status = 'approved'
      and m.status = 'active'
  )
  and exists (
    select 1 from public.customers c
    join public.projects pr on pr.customer_id = c.id
    where c.id = window_inspections.customer_id and pr.id = window_inspections.project_id
      and c.company_id = window_inspections.company_id and pr.company_id = window_inspections.company_id
      and c.deleted_at is null and pr.deleted_at is null
  )
);

create policy window_inspections_company_update
on public.window_inspections for update to authenticated
using (
  company_id = (select public.current_company_id())
  and performed_by_user_id = (select auth.uid())
)
with check (
  company_id = (select public.current_company_id())
  and performed_by_user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    join public.company_memberships m on m.user_id = p.id
      and m.company_id = window_inspections.company_id
      and m.employee_id = window_inspections.performed_by_employee_id
    where p.id = (select auth.uid())
      and p.employee_id = window_inspections.performed_by_employee_id
      and p.is_active = true
      and p.is_approved = true
      and p.approval_status = 'approved'
      and m.status = 'active'
  )
  and exists (
    select 1 from public.customers c
    join public.projects pr on pr.customer_id = c.id
    where c.id = window_inspections.customer_id and pr.id = window_inspections.project_id
      and c.company_id = window_inspections.company_id and pr.company_id = window_inspections.company_id
      and c.deleted_at is null and pr.deleted_at is null
  )
);

-- The real ERP already grants these reads through its wider schema grants. The
-- minimal fixture needs them explicitly so RLS policy subqueries execute as the
-- authenticated actor rather than failing for a fixture-only privilege reason.
grant select on public.companies, public.employees, public.profiles,
  public.company_memberships, public.customers, public.projects to authenticated;
grant select, insert, update on public.window_inspections to authenticated;
