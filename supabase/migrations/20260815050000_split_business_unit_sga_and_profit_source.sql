-- Eighty ERP — 사업부별 판관비 실분류 및 손익 지표 기준 정리
-- 원본: 2026년 영업계획 (1).xlsx / 2026손익계산서
-- 인테리어 판관비: 인테리어 손익 블록의 경비총액
-- 창호 판관비: 창호 손익 블록의 경비총액(사무실·대표급여 등 본사성 비용 포함)

alter table public.company_monthly_pnl
  add column if not exists window_sga_expense numeric not null default 0,
  add column if not exists interior_sga_expense numeric not null default 0,
  add column if not exists common_sga_expense numeric not null default 0;

comment on column public.company_monthly_pnl.window_sga_expense is
  '창호 손익 블록에 분류된 판관비. 현재 내부 엑셀 기준으로 사무실·대표급여 등 본사성 비용이 포함될 수 있음.';
comment on column public.company_monthly_pnl.interior_sga_expense is
  '인테리어 손익 블록에 분류된 판관비.';
comment on column public.company_monthly_pnl.common_sga_expense is
  '별도로 식별된 회사 공통 판관비. 미분류 잔액은 effective view에서 공통비로 보완.';

update public.company_monthly_pnl
set
  window_sga_expense = case pnl_month
    when 1 then 46453379
    when 2 then 45426515
    when 3 then 47206869
    when 4 then 47739094
    when 5 then 72234082
    when 6 then 58684716
    when 7 then 59222747
    else window_sga_expense
  end,
  interior_sga_expense = case pnl_month
    when 1 then 2750000
    when 2 then 5283000
    when 3 then 5940000
    when 4 then 11044000
    when 5 then 9090000
    when 6 then 8877690
    when 7 then 8245690
    else interior_sga_expense
  end,
  common_sga_expense = 0,
  note = concat_ws(
    ' / ',
    nullif(note, ''),
    '사업부 판관비는 2026손익계산서의 각 사업부 경비총액을 반영. 창호 블록에는 본사성 비용 포함.'
  ),
  updated_at = now()
where company_id = 'bec4db38-052d-4953-86f9-9d2c65a805e5'
  and pnl_year = 2026
  and pnl_month between 1 and 7
  and source_type = 'excel_import'
  and source_name = '2026년 영업계획 (1).xlsx / 2026손익계산서';

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
  window_revenue + interior_revenue as total_revenue,
  window_cogs + interior_cogs as total_cogs,
  window_revenue + interior_revenue - (window_cogs + interior_cogs) as gross_profit,
  sga_expense,
  window_revenue + interior_revenue - (window_cogs + interior_cogs) - sga_expense as operating_profit,
  home_shopping_incentive,
  sales_incentive,
  other_income_adjustment,
  home_shopping_incentive + sales_incentive + other_income_adjustment as other_income,
  window_revenue + interior_revenue - (window_cogs + interior_cogs) - sga_expense
    + home_shopping_incentive + sales_incentive + other_income_adjustment as net_profit,
  source_type,
  source_name,
  source_cutoff_date,
  note,
  created_at,
  updated_at,
  window_sga_expense,
  interior_sga_expense,
  common_sga_expense
    + greatest(
        sga_expense - window_sga_expense - interior_sga_expense - common_sga_expense,
        0
      ) as common_sga_expense,
  window_revenue - window_cogs as window_gross_profit,
  interior_revenue - interior_cogs as interior_gross_profit,
  window_revenue - window_cogs - window_sga_expense as window_operating_profit,
  interior_revenue - interior_cogs - interior_sga_expense as interior_operating_profit
from (
  select
    p.*,
    row_number() over (
      partition by p.company_id, p.pnl_year, p.pnl_month
      order by
        case p.source_type
          when 'erp' then 30
          when 'manual' then 20
          when 'excel_import' then 10
          else 0
        end desc,
        p.updated_at desc,
        p.id desc
    ) as source_rank
  from public.company_monthly_pnl p
  where p.is_active = true
) ranked
where source_rank = 1;

grant select on public.company_monthly_pnl_effective to authenticated;
revoke all on public.company_monthly_pnl_effective from anon;
