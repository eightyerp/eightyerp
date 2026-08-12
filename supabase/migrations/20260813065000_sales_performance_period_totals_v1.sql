create table if not exists public.sales_performance_period_totals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid null references public.employees(id) on delete restrict,
  business_unit text not null check (business_unit in ('window','interior','shared')),
  period_start date not null,
  period_end date not null,
  owner_label text not null,
  revenue_amount bigint not null default 0 check (revenue_amount >= 0),
  cost_amount bigint not null default 0 check (cost_amount >= 0),
  margin_amount bigint not null default 0,
  source_type text not null default 'manual' check (source_type in ('excel_import','erp','manual','derived_summary')),
  source_name text null,
  source_cutoff_date date null,
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_performance_period_totals_period_check check (period_end >= period_start),
  constraint sales_performance_period_totals_margin_check check (margin_amount = revenue_amount - cost_amount),
  constraint sales_performance_period_totals_unique unique (company_id,business_unit,period_start,period_end,owner_label)
);

create index if not exists idx_sales_performance_period_totals_company_period
  on public.sales_performance_period_totals(company_id,business_unit,period_end desc);

create index if not exists idx_sales_performance_period_totals_employee
  on public.sales_performance_period_totals(company_id,employee_id,period_end desc)
  where employee_id is not null;

alter table public.sales_performance_period_totals enable row level security;

drop policy if exists sales_performance_period_totals_select
  on public.sales_performance_period_totals;

create policy sales_performance_period_totals_select
on public.sales_performance_period_totals
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

revoke all on table public.sales_performance_period_totals from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.sales_performance_period_totals from authenticated;
grant select on table public.sales_performance_period_totals to authenticated;
