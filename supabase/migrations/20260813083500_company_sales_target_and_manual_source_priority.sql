-- Eighty ERP — 회사 매출목표 + 수기/ERP 실적 충돌 방지

create table if not exists public.company_sales_targets (
  company_id uuid not null references public.companies(id) on delete cascade,
  target_year integer not null check (target_year between 2020 and 2100),
  target_amount bigint not null check (target_amount >= 0),
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, target_year)
);

alter table public.company_sales_targets enable row level security;

drop policy if exists company_sales_targets_select_admin on public.company_sales_targets;
create policy company_sales_targets_select_admin
on public.company_sales_targets for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

drop policy if exists company_sales_targets_insert_admin on public.company_sales_targets;
create policy company_sales_targets_insert_admin
on public.company_sales_targets for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

drop policy if exists company_sales_targets_update_admin on public.company_sales_targets;
create policy company_sales_targets_update_admin
on public.company_sales_targets for update
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
)
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

grant select, insert, update on public.company_sales_targets to authenticated;
revoke all on public.company_sales_targets from anon;

alter table public.sales_performance_monthly
  add column if not exists is_active boolean not null default true;

alter table public.sales_performance_monthly
  drop constraint if exists sales_performance_monthly_company_id_business_unit_sales_ye_key;

create unique index if not exists sales_performance_monthly_subject_source_uq
on public.sales_performance_monthly (
  company_id,
  business_unit,
  sales_year,
  sales_month,
  (coalesce(employee_id::text, 'label:' || owner_label)),
  source_type
)
where is_active;

drop policy if exists sales_performance_monthly_insert_admin on public.sales_performance_monthly;
create policy sales_performance_monthly_insert_admin
on public.sales_performance_monthly for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

drop policy if exists sales_performance_monthly_update_admin on public.sales_performance_monthly;
create policy sales_performance_monthly_update_admin
on public.sales_performance_monthly for update
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
)
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

grant insert, update on public.sales_performance_monthly to authenticated;

create or replace view public.sales_performance_effective
with (security_invoker = true)
as
select
  id, company_id, employee_id, business_unit, sales_year, sales_month, owner_label,
  revenue_amount, cost_amount, margin_amount, source_type, source_name,
  source_cutoff_date, note, is_active, created_at, updated_at
from (
  select spm.*,
    row_number() over (
      partition by company_id, business_unit, sales_year, sales_month,
        coalesce(employee_id::text, 'label:' || owner_label)
      order by
        case source_type
          when 'erp' then 30
          when 'manual' then 20
          when 'excel_import' then 10
          else 0
        end desc,
        updated_at desc,
        id desc
    ) as source_rank
  from public.sales_performance_monthly spm
  where is_active = true
) ranked
where source_rank = 1;

grant select on public.sales_performance_effective to authenticated;
revoke all on public.sales_performance_effective from anon;

create or replace view public.sales_performance_2026
with (security_invoker = true)
as
select
  id, company_id, employee_id, business_unit, sales_year, sales_month, owner_label,
  revenue_amount, cost_amount, margin_amount, source_type, source_name,
  source_cutoff_date, note, created_at, updated_at
from public.sales_performance_effective
where sales_year = 2026;

grant select on public.sales_performance_2026 to authenticated;
revoke all on public.sales_performance_2026 from anon;
