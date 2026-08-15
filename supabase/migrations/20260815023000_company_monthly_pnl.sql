-- Eighty ERP — 월별 손익 원장
-- 관리자 전용, 수기/엑셀/ERP 자동실적 소스 충돌 방지

create table if not exists public.company_monthly_pnl (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pnl_year integer not null check (pnl_year between 2020 and 2100),
  pnl_month integer not null check (pnl_month between 1 and 12),
  window_revenue numeric(18,2) not null default 0 check (window_revenue >= 0),
  window_cogs numeric(18,2) not null default 0 check (window_cogs >= 0),
  interior_revenue numeric(18,2) not null default 0 check (interior_revenue >= 0),
  interior_cogs numeric(18,2) not null default 0 check (interior_cogs >= 0),
  sga_expense numeric(18,2) not null default 0 check (sga_expense >= 0),
  home_shopping_incentive numeric(18,2) not null default 0 check (home_shopping_incentive >= 0),
  sales_incentive numeric(18,2) not null default 0 check (sales_incentive >= 0),
  other_income_adjustment numeric(18,2) not null default 0,
  source_type text not null check (source_type in ('erp','manual','excel_import')),
  source_name text null,
  source_cutoff_date date null,
  note text null,
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_monthly_pnl_source_uq
on public.company_monthly_pnl (company_id, pnl_year, pnl_month, source_type)
where is_active;

create index if not exists idx_company_monthly_pnl_company_period
on public.company_monthly_pnl (company_id, pnl_year, pnl_month);

alter table public.company_monthly_pnl enable row level security;

drop policy if exists company_monthly_pnl_select_admin on public.company_monthly_pnl;
create policy company_monthly_pnl_select_admin
on public.company_monthly_pnl for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

drop policy if exists company_monthly_pnl_insert_admin on public.company_monthly_pnl;
create policy company_monthly_pnl_insert_admin
on public.company_monthly_pnl for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and public.current_company_role() = any (array['owner'::text,'director'::text,'admin'::text])
);

drop policy if exists company_monthly_pnl_update_admin on public.company_monthly_pnl;
create policy company_monthly_pnl_update_admin
on public.company_monthly_pnl for update
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

grant select, insert, update on public.company_monthly_pnl to authenticated;
revoke all on public.company_monthly_pnl from anon;

create or replace view public.company_monthly_pnl_effective
with (security_invoker = true)
as
select
  id,
  company_id,
  pnl_year,
  pnl_month,
  window_revenue,
  window_cogs,
  interior_revenue,
  interior_cogs,
  (window_revenue + interior_revenue) as total_revenue,
  (window_cogs + interior_cogs) as total_cogs,
  ((window_revenue + interior_revenue) - (window_cogs + interior_cogs)) as gross_profit,
  sga_expense,
  ((window_revenue + interior_revenue) - (window_cogs + interior_cogs) - sga_expense) as operating_profit,
  home_shopping_incentive,
  sales_incentive,
  other_income_adjustment,
  (home_shopping_incentive + sales_incentive + other_income_adjustment) as other_income,
  (
    (window_revenue + interior_revenue)
    - (window_cogs + interior_cogs)
    - sga_expense
    + home_shopping_incentive
    + sales_incentive
    + other_income_adjustment
  ) as net_profit,
  source_type,
  source_name,
  source_cutoff_date,
  note,
  created_at,
  updated_at
from (
  select p.*,
    row_number() over (
      partition by company_id, pnl_year, pnl_month
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
  from public.company_monthly_pnl p
  where is_active = true
) ranked
where source_rank = 1;

grant select on public.company_monthly_pnl_effective to authenticated;
revoke all on public.company_monthly_pnl_effective from anon;
