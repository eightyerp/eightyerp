-- CI-only augmentation for Window Check customer/project quick registration.
-- This is NOT a production migration. The base operational fixture already
-- creates company/auth/customer/project identities; this adds the current CRM
-- columns, activity timeline, audit surface, and the legacy pre-company global
-- phone constraint that the multi-company phone migration must replace.

do $$ begin
  create type public.consultation_type as enum ('창호', '인테리어', '욕실', '기타');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.customer_status as enum (
    '신규', '미연락', '상담중', '방문예약', '견적제출', '계약', '보류', '완료'
  );
exception when duplicate_object then null;
end $$;

alter table public.customers
  add column if not exists name text not null default 'Fixture Customer',
  add column if not exists phone text not null default '010-0000-0000',
  add column if not exists address text,
  add column if not exists consultation_type public.consultation_type not null default '기타',
  add column if not exists status public.customer_status not null default '신규',
  add column if not exists interest_items text[] not null default '{}',
  add column if not exists source_channel text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.projects
  add column if not exists name text not null default 'Fixture Project',
  add column if not exists address text,
  add column if not exists status text not null default '준비',
  add column if not exists assigned_employee_id uuid references public.employees(id),
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.customer_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  customer_id uuid not null references public.customers(id) on delete cascade,
  activity_type text not null,
  content text,
  previous_status text,
  new_status text,
  employee_id uuid references public.employees(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fixture_customer_activities_customer_created_idx
  on public.customer_activities(company_id, customer_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_id uuid references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fixture_audit_logs_company_created_idx
  on public.audit_logs(company_id, created_at desc);

-- Reproduce the original CRM rule so isolated CI proves the new migration
-- replaces a true constraint-backed global unique index, not merely a fixture.
do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'customers'
      and constraint_row.conname = 'customers_phone_unique'
  ) then
    alter table public.customers
      add constraint customers_phone_unique unique(phone);
  end if;
end $$;

grant select, insert on public.customers, public.projects, public.customer_activities, public.audit_logs to authenticated;
