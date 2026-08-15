-- =============================================================================
-- Eighty ERP — Finance Workflow V2 Verification (GATE 2 DRAFT ONLY)
--
-- 목적:
--   실제 migration 적용 전·후 데이터 무결성, RLS, 계산식, 권한을 검증하기 위한 초안.
--   현재 운영 DB에 실행하지 않습니다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 기준점 스냅샷
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.collection_receipts) as collection_receipt_rows,
  (select count(*) from public.expense_requests) as expense_rows,
  (select count(*) from public.employee_settlement_batches) as settlement_batch_rows,
  (select count(*) from public.employee_settlement_lines) as settlement_line_rows,
  (select count(*) from public.company_monthly_pnl) as pnl_rows,
  (select count(*) from public.sales_performance_monthly) as sales_performance_rows;

-- -----------------------------------------------------------------------------
-- 1. 신규 컬럼 및 제약 확인
-- -----------------------------------------------------------------------------

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'projects' and column_name = 'business_unit')
    or
    (table_name = 'expense_requests' and column_name in (
      'business_unit', 'cost_nature', 'classification_status',
      'approval_status', 'payment_status', 'evidence_status',
      'accounting_status', 'recognized_at', 'source_type', 'version'
    ))
  )
order by table_name, ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.projects'::regclass, 'public.expense_requests'::regclass)
  and conname in (
    'projects_business_unit_check',
    'expense_requests_business_unit_check',
    'expense_requests_cost_nature_check',
    'expense_requests_classification_status_check',
    'expense_requests_approval_status_check',
    'expense_requests_payment_status_check',
    'expense_requests_evidence_status_check',
    'expense_requests_accounting_status_check',
    'expense_requests_scope_project_check'
  )
order by conname;

-- 운영비와 현장비 제약 검증
select count(*) as invalid_scope_rows
from public.expense_requests
where not (
  (expense_scope = 'project' and project_id is not null)
  or
  (expense_scope = 'operating' and project_id is null)
);

-- -----------------------------------------------------------------------------
-- 2. 기존 지출 상태 호환 검증
-- -----------------------------------------------------------------------------

select status, approval_status, payment_status, evidence_status,
       classification_status, accounting_status, count(*) as rows
from public.expense_requests
group by status, approval_status, payment_status, evidence_status,
         classification_status, accounting_status
order by status, approval_status, payment_status;

-- legacy status와 신규 승인상태의 비정상 조합
select count(*) as invalid_legacy_approval_mapping
from public.expense_requests
where
  (status = 'pending' and approval_status <> 'pending')
  or (status in ('approved', 'paid') and approval_status <> 'approved')
  or (status = 'rejected' and approval_status <> 'rejected')
  or (status = 'cancelled' and approval_status <> 'cancelled');

-- 증빙 존재 여부와 evidence_status 비교
select count(*) as evidence_status_mismatch
from public.expense_requests e
where
  (
    exists (select 1 from public.expense_documents d where d.expense_request_id = e.id)
    and e.evidence_status = 'missing'
  )
  or
  (
    not exists (select 1 from public.expense_documents d where d.expense_request_id = e.id)
    and e.evidence_status in ('attached', 'tax_reviewed', 'complete')
  );

-- -----------------------------------------------------------------------------
-- 3. 신규 테이블 존재 및 RLS
-- -----------------------------------------------------------------------------

with expected(table_name) as (
  values
    ('expense_classification_events'),
    ('expense_approval_events'),
    ('expense_payment_events'),
    ('finance_import_batches'),
    ('finance_import_rows'),
    ('collection_schedules'),
    ('collection_receipt_allocations'),
    ('collection_opening_balances'),
    ('employee_settlement_rules'),
    ('employee_settlement_previews'),
    ('employee_settlement_snapshots'),
    ('employee_settlement_approval_events'),
    ('company_sales_target_revisions'),
    ('finance_month_closings')
)
select e.table_name,
       c.relname is not null as table_exists,
       coalesce(c.relrowsecurity, false) as rls_enabled
from expected e
left join pg_class c on c.relname = e.table_name
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by e.table_name;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'expense_classification_events', 'expense_approval_events', 'expense_payment_events',
    'finance_import_batches', 'finance_import_rows',
    'collection_schedules', 'collection_receipt_allocations', 'collection_opening_balances',
    'employee_settlement_rules', 'employee_settlement_previews',
    'employee_settlement_snapshots', 'employee_settlement_approval_events',
    'company_sales_target_revisions', 'finance_month_closings'
  )
order by tablename, policyname;

-- 신규 RLS 테이블 중 policy가 없는 테이블
with target_tables(table_name) as (
  values
    ('expense_classification_events'),
    ('expense_approval_events'),
    ('expense_payment_events'),
    ('finance_import_batches'),
    ('finance_import_rows'),
    ('collection_schedules'),
    ('collection_receipt_allocations'),
    ('collection_opening_balances'),
    ('employee_settlement_rules'),
    ('employee_settlement_previews'),
    ('employee_settlement_snapshots'),
    ('employee_settlement_approval_events'),
    ('company_sales_target_revisions'),
    ('finance_month_closings')
)
select t.table_name
from target_tables t
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = t.table_name
where p.policyname is null
order by t.table_name;

-- -----------------------------------------------------------------------------
-- 4. 최소권한
-- -----------------------------------------------------------------------------

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'collection_receipts', 'expense_requests',
    'employee_settlement_batches', 'employee_settlement_lines',
    'company_monthly_pnl', 'company_sales_targets',
    'sales_performance_monthly', 'sales_performance_period_totals'
  )
  and grantee = 'authenticated'
  and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
order by table_name, privilege_type;

-- 결과 0건이어야 함.

-- -----------------------------------------------------------------------------
-- 5. 수금계획·배분 무결성
-- -----------------------------------------------------------------------------

-- 회차 배분합계가 실제 수금액을 초과하면 안 됨
select r.id as receipt_id,
       r.amount as receipt_amount,
       coalesce(sum(a.allocated_amount), 0) as allocated_amount
from public.collection_receipts r
left join public.collection_receipt_allocations a on a.receipt_id = r.id
where r.status <> 'cancelled'
group by r.id, r.amount
having coalesce(sum(a.allocated_amount), 0) > r.amount;

-- 계획 회차별 배분 및 상태 점검
select s.id, s.contract_id, s.schedule_type, s.planned_amount,
       coalesce(sum(a.allocated_amount), 0) as received_amount,
       s.status
from public.collection_schedules s
left join public.collection_receipt_allocations a on a.schedule_id = s.id
where s.status <> 'cancelled'
group by s.id
order by s.contract_id, s.sequence_no;

-- 계약별 미수금 계산 대조
with receipt_sum as (
  select contract_id, coalesce(sum(amount), 0)::bigint as receipt_amount
  from public.collection_receipts
  where status = 'confirmed'
  group by contract_id
), opening_sum as (
  select contract_id, coalesce(sum(opening_received_amount), 0)::bigint as opening_received
  from public.collection_opening_balances
  where is_active
  group by contract_id
)
select c.id,
       c.contract_amount,
       coalesce(o.opening_received, 0) as opening_received,
       coalesce(r.receipt_amount, 0) as erp_received,
       greatest(c.contract_amount - coalesce(o.opening_received, 0) - coalesce(r.receipt_amount, 0), 0) as calculated_outstanding
from public.contracts c
left join opening_sum o on o.contract_id = c.id
left join receipt_sum r on r.contract_id = c.id
where c.contract_kind = 'original'
  and c.status not in ('draft', 'cancelled', 'terminated');

-- -----------------------------------------------------------------------------
-- 6. 지출 손익반영 대상
-- -----------------------------------------------------------------------------

select business_unit, cost_nature, approval_status, accounting_status,
       count(*) as rows,
       coalesce(sum(cost_basis_amount), 0) as cost_basis_amount
from public.expense_requests
where approval_status = 'approved'
group by business_unit, cost_nature, approval_status, accounting_status
order by business_unit, cost_nature, accounting_status;

-- 미분류인데 posted/closed인 비용은 없어야 함
select count(*) as invalid_posted_unclassified
from public.expense_requests
where accounting_status in ('posted', 'closed')
  and (
    business_unit = 'unclassified'
    or classification_status in ('unclassified', 'review_required')
  );

-- 회사 운영비에 현장이 연결되거나 현장비에 현장이 없으면 안 됨
select count(*) as invalid_expense_scope
from public.expense_requests
where
  (expense_scope = 'operating' and project_id is not null)
  or (expense_scope = 'project' and project_id is null);

-- -----------------------------------------------------------------------------
-- 7. 직원 정산규칙
-- -----------------------------------------------------------------------------

select company_id, employee_id, business_unit, basis_type, rate,
       effective_from, effective_to, is_active
from public.employee_settlement_rules
where is_active
order by business_unit, employee_id nulls first;

-- 기본 규칙 기대값
select
  count(*) filter (
    where employee_id is null and business_unit = 'interior'
      and basis_type = 'contribution_margin' and rate = 0.5 and is_active
  ) as interior_default_rule,
  count(*) filter (
    where employee_id is null and business_unit = 'window'
      and basis_type = 'contract_amount' and rate = 0.02 and is_active
  ) as window_default_rule
from public.employee_settlement_rules;

-- 직원별 예상 계산 무결성
select id, employee_id, settlement_year, settlement_month,
       basis_amount, rate, base_preview_amount,
       additional_incentive_amount, deduction_amount, paid_amount,
       expected_payable_amount,
       greatest(
         base_preview_amount + additional_incentive_amount - deduction_amount - paid_amount,
         0
       ) as recalculated_payable
from public.employee_settlement_previews
where is_active
  and expected_payable_amount <>
      greatest(base_preview_amount + additional_incentive_amount - deduction_amount - paid_amount, 0);

-- 인테리어 50% 규칙 검사
select id, employee_id, basis_amount, base_preview_amount,
       floor(greatest(basis_amount, 0) * 0.5)::bigint as expected_base
from public.employee_settlement_previews
where is_active
  and business_unit = 'interior'
  and basis_type in ('contribution_margin', 'sales_performance_proxy')
  and base_preview_amount <> floor(greatest(basis_amount, 0) * 0.5)::bigint;

-- 창호 2% 규칙 검사
select id, employee_id, basis_amount, base_preview_amount,
       floor(greatest(basis_amount, 0) * 0.02)::bigint as expected_base
from public.employee_settlement_previews
where is_active
  and business_unit = 'window'
  and basis_type in ('contract_amount', 'sales_performance_proxy')
  and base_preview_amount <> floor(greatest(basis_amount, 0) * 0.02)::bigint;

-- 예상값이 기존 확정·지급 배치를 변경하지 않았는지 비교할 스냅샷
select count(*) as confirmed_batches,
       coalesce(sum(base_settlement_amount), 0) as base_settlement,
       coalesce(sum(paid_amount), 0) as paid_amount
from public.employee_settlement_batches
where status in ('confirmed', 'paid');

-- -----------------------------------------------------------------------------
-- 8. 회사 손익 계산 불변식
-- -----------------------------------------------------------------------------

select pnl_year, pnl_month,
       total_revenue - window_revenue - interior_revenue as revenue_diff,
       total_cogs - window_cogs - interior_cogs as cogs_diff,
       sga_expense - window_sga_expense - interior_sga_expense - common_sga_expense as sga_diff,
       operating_profit
         - window_operating_profit
         - interior_operating_profit
         + common_sga_expense as operating_profit_diff,
       net_profit - operating_profit - other_income as net_profit_diff
from public.company_monthly_pnl_effective
order by pnl_year, pnl_month;

-- 모든 diff는 0이어야 함.

-- -----------------------------------------------------------------------------
-- 9. 월마감
-- -----------------------------------------------------------------------------

select close_year, close_month, status,
       sales_status, collections_status, expenses_status, settlements_status,
       validation_result
from public.finance_month_closings
order by close_year, close_month;

-- 미분류 또는 검토중 비용이 있는데 마감된 월
select c.close_year, c.close_month, count(e.*) as unresolved_expenses
from public.finance_month_closings c
join public.expense_requests e
  on e.company_id = c.company_id
 and extract(year from e.expense_date)::int = c.close_year
 and extract(month from e.expense_date)::int = c.close_month
where c.status in ('closed', 'approved')
  and (
    e.business_unit = 'unclassified'
    or e.classification_status in ('unclassified', 'review_required')
    or e.accounting_status in ('unclassified', 'review_required')
  )
group by c.close_year, c.close_month;

-- -----------------------------------------------------------------------------
-- 10. 역할별 행동 테스트는 Preview 사용자 세션에서 별도 수행
-- -----------------------------------------------------------------------------

-- 대표/이사/관리자:
--   전체 수금·지출·정산·이관·마감 조회 및 승인 가능
-- 매니저/일반직원:
--   본인 담당 계약 수금, 본인 지출요청, 본인 예상·확정 정산만 조회
-- 비활성/직원미연결/익명:
--   재무자료 접근 차단
