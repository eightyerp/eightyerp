-- Eighty ERP — 2026 monthly sales performance ledger
create table if not exists public.sales_performance_monthly (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete restrict,
  business_unit text not null check (business_unit in ('window','interior','shared')),
  sales_year integer not null check (sales_year between 2020 and 2100),
  sales_month integer not null check (sales_month between 1 and 12),
  owner_label text not null,
  revenue_amount bigint not null default 0 check (revenue_amount >= 0),
  cost_amount bigint not null default 0 check (cost_amount >= 0),
  margin_amount bigint generated always as (revenue_amount - cost_amount) stored,
  source_type text not null default 'manual' check (source_type in ('excel_import','erp','manual')),
  source_name text,
  source_cutoff_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, business_unit, sales_year, sales_month, owner_label)
);

create index if not exists idx_sales_performance_company_year_month
  on public.sales_performance_monthly(company_id, sales_year, sales_month);
create index if not exists idx_sales_performance_employee_year
  on public.sales_performance_monthly(employee_id, sales_year, sales_month)
  where employee_id is not null;

alter table public.sales_performance_monthly enable row level security;

drop policy if exists sales_performance_monthly_select on public.sales_performance_monthly;
create policy sales_performance_monthly_select
on public.sales_performance_monthly
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.current_company_role() in ('owner','director','admin')
    or employee_id = public.current_employee_id()
  )
);

revoke all on public.sales_performance_monthly from anon;
revoke insert, update, delete, truncate, references, trigger on public.sales_performance_monthly from authenticated;
grant select on public.sales_performance_monthly to authenticated;

create or replace view public.sales_performance_2026
with (security_invoker = true)
as
select
  id, company_id, employee_id, business_unit, sales_year, sales_month, owner_label,
  revenue_amount, cost_amount, margin_amount, source_type, source_name, source_cutoff_date, note,
  created_at, updated_at
from public.sales_performance_monthly
where sales_year = 2026;

revoke all on public.sales_performance_2026 from anon;
grant select on public.sales_performance_2026 to authenticated;
