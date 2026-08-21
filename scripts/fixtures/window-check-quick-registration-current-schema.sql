-- CI-only augmentation for 20260822013000_window_check_quick_customer_project_rpc.sql.
-- This is NOT a production migration. The base operational fixture already
-- creates company/auth/customer/project identities; this adds the current CRM
-- columns, activity timeline, and audit surface used by the quick-registration RPC.

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

create unique index if not exists fixture_customers_phone_unique
  on public.customers(phone);

grant select, insert on public.customers, public.projects, public.customer_activities, public.audit_logs to authenticated;
