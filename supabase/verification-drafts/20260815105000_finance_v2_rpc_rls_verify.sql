-- =============================================================================
-- Eighty ERP — Finance V2 RPC/RLS Verification (GATE 3 PREVIEW DRAFT ONLY)
-- 실제 migration 적용 후 Preview DB에서 실행할 검증 초안입니다.
-- =============================================================================

-- 1. RPC 존재/보안 속성
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_function_result(p.oid) as result_type,
  array_to_string(p.proconfig, ',') as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'register_expense_request_v3',
    'mark_expense_reimbursement_paid_v1',
    'register_collection_receipt_v2',
    'allocate_collection_receipt_v1',
    'confirm_collection_receipt_v2',
    'save_collection_opening_balance_v1'
  )
order by p.proname;

-- 기대: 모두 security_definer=true, search_path='' 설정.

-- 2. anon 실행권한이 있으면 실패
select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in (
    'register_expense_request_v3',
    'mark_expense_reimbursement_paid_v1',
    'register_collection_receipt_v2',
    'allocate_collection_receipt_v1',
    'confirm_collection_receipt_v2',
    'save_collection_opening_balance_v1'
  )
  and grantee in ('anon', 'PUBLIC')
order by routine_name, grantee;

-- 기대: 0건.

-- 3. 신규 RLS 테이블 중 RLS 미활성
with target(table_name) as (
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
    ('finance_month_closings'),
    ('pnl_classification_adjustments')
)
select t.table_name
from target t
left join pg_class c on c.relname = t.table_name
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.oid is null or not c.relrowsecurity
order by t.table_name;

-- 기대: 0건.

-- 4. 신규 RLS 테이블 중 SELECT policy가 없는 테이블
with target(table_name) as (
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
    ('finance_month_closings'),
    ('pnl_classification_adjustments')
)
select t.table_name
from target t
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = t.table_name
 and p.cmd in ('SELECT', 'ALL')
where p.policyname is null
order by t.table_name;

-- 기대: 0건.

-- 5. authenticated 직접 쓰기권한 유무
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'expense_classification_events',
    'expense_approval_events',
    'expense_payment_events',
    'finance_import_batches',
    'finance_import_rows',
    'collection_schedules',
    'collection_receipt_allocations',
    'collection_opening_balances',
    'employee_settlement_rules',
    'employee_settlement_previews',
    'employee_settlement_snapshots',
    'employee_settlement_approval_events',
    'company_sales_target_revisions',
    'finance_month_closings',
    'pnl_classification_adjustments'
  )
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
order by table_name, privilege_type;

-- 기대: 0건. 쓰기는 RPC로만 수행.

-- 6. 수금 idempotency 중복
select company_id, idempotency_key, count(*) as rows
from public.collection_receipts
where idempotency_key is not null
  and status <> 'cancelled'
group by company_id, idempotency_key
having count(*) > 1;

-- 기대: 0건.

-- 7. 수금 배분이 수금액을 초과하는지
select
  r.id as receipt_id,
  r.amount,
  coalesce(sum(a.allocated_amount), 0) as allocated
from public.collection_receipts r
left join public.collection_receipt_allocations a on a.receipt_id = r.id
where r.status <> 'cancelled'
group by r.id, r.amount
having coalesce(sum(a.allocated_amount), 0) > r.amount;

-- 기대: 0건.

-- 8. 다른 계약끼리 잘못 연결된 수금배분
select
  a.id,
  r.contract_id as receipt_contract_id,
  s.contract_id as schedule_contract_id
from public.collection_receipt_allocations a
join public.collection_receipts r on r.id = a.receipt_id
join public.collection_schedules s on s.id = a.schedule_id
where r.contract_id is distinct from s.contract_id;

-- 기대: 0건.

-- 9. 계약당 활성 기초잔액이 2개 이상
select company_id, contract_id, count(*) as active_rows
from public.collection_opening_balances
where is_active
group by company_id, contract_id
having count(*) > 1;

-- 기대: 0건.

-- 10. 직원 선지급인데 환급대상이 없는 비정상 지출
select id, payment_method, paid_by_party, reimbursement_status, reimbursement_employee_id
from public.expense_requests
where paid_by_party = 'employee'
  and (
    reimbursement_status = 'not_applicable'
    or reimbursement_employee_id is null
  );

-- 기대: 0건.

-- 11. 회사 지급인데 직원환급 대기인 비정상 지출
select id, payment_method, paid_by_party, reimbursement_status
from public.expense_requests
where paid_by_party = 'company'
  and reimbursement_status in ('payable', 'approved');

-- 기대: 0건.

-- 12. 미분류 비용이 posted/closed 상태인지
select id, business_unit, cost_nature, classification_status, accounting_status
from public.expense_requests
where accounting_status in ('posted', 'closed')
  and (
    business_unit = 'unclassified'
    or classification_status in ('unclassified', 'review_required')
  );

-- 기대: 0건.

-- 13. 확정/지급 직원정산 기준 스냅샷
select
  count(*) as batches,
  coalesce(sum(base_settlement_amount), 0) as base_settlement,
  coalesce(sum(additional_incentive_amount), 0) as additional_incentive,
  coalesce(sum(deduction_amount), 0) as deduction,
  coalesce(sum(paid_amount), 0) as paid
from public.employee_settlement_batches
where status in ('confirmed', 'paid');

-- Gate 3 migration 전후 결과가 정확히 동일해야 한다.

-- 14. 역할별 행동테스트 체크리스트
-- owner/director/admin:
--   전체 수금계획/기초잔액/지출/환급/정산/이관/월마감 조회 가능
-- manager/employee:
--   본인 담당 고객의 수금계획/기초잔액 조회 가능
--   본인 지출 이벤트 조회 가능
--   본인 예상/확정 정산만 조회 가능
--   타 직원 정산, 회사공통비, 이관/월마감 조회 차단
-- anon / 직원미연결 / 비활성:
--   Finance V2 자료 및 RPC 접근 차단
