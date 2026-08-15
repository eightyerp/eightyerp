-- =============================================================================
-- Eighty ERP — Finance V2 Gate 3 Candidate Addendum
-- 설계/Preview 전용. 운영 migration 아님. 마지막 ROLLBACK 유지.
-- =============================================================================

begin;

-- 1) 개인카드/현금 선지급 환급과 법인카드 현금흐름 분리
alter table public.expense_requests
  add column if not exists paid_by_party text not null default 'company',
  add column if not exists reimbursement_status text not null default 'not_applicable',
  add column if not exists reimbursement_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists reimbursement_due_date date,
  add column if not exists reimbursed_at timestamptz,
  add column if not exists liability_type text not null default 'none',
  add column if not exists liability_due_date date,
  add column if not exists cashflow_date date;

alter table public.expense_requests
  drop constraint if exists expense_requests_paid_by_party_check,
  drop constraint if exists expense_requests_reimbursement_status_check,
  drop constraint if exists expense_requests_liability_type_check;

alter table public.expense_requests
  add constraint expense_requests_paid_by_party_check
    check (paid_by_party in ('company', 'employee', 'customer', 'other')) not valid,
  add constraint expense_requests_reimbursement_status_check
    check (reimbursement_status in ('not_applicable', 'payable', 'approved', 'paid', 'waived')) not valid,
  add constraint expense_requests_liability_type_check
    check (liability_type in ('none', 'corporate_card_payable', 'employee_reimbursement', 'vendor_payable')) not valid;

-- Gate 3 실제 migration에서는 결제수단과 요청자에 따라 backfill을 수행한다.
-- personal_card/cash + 직원요청 → paid_by_party=employee, reimbursement_status=payable
-- company_card → liability_type=corporate_card_payable

create index if not exists expense_requests_reimbursement_queue_idx
  on public.expense_requests (
    company_id,
    reimbursement_status,
    reimbursement_employee_id,
    expense_date desc
  )
  where reimbursement_status in ('payable', 'approved');

-- 2) 기초 수금잔액은 계약당 활성 1건만 허용
-- Gate 2 초안의 (company_id, contract_id, as_of_date) active unique 대신 사용한다.
drop index if exists public.collection_opening_balances_active_uq;
create unique index if not exists collection_opening_balances_active_uq
  on public.collection_opening_balances (company_id, contract_id)
  where is_active;

-- 3) 예상 정산은 재계산 가능한 cache이며 공식 원장이 아니다.
alter table public.employee_settlement_previews
  add column if not exists calculation_hash text,
  add column if not exists source_revision text,
  add column if not exists stale_at timestamptz,
  add column if not exists recalculation_reason text;

create index if not exists employee_settlement_previews_stale_idx
  on public.employee_settlement_previews (company_id, stale_at)
  where is_active and stale_at is not null;

-- 4) 회사 목표는 연도별 active revision 1건만 허용
create unique index if not exists company_sales_target_revisions_active_uq
  on public.company_sales_target_revisions (company_id, target_year)
  where status = 'active';

-- 현재 운영값 100억원은 정상이며 Gate 3에서 DML 수정하지 않는다.

-- 5) 회사공통비 재분류는 원본 Excel 손익을 덮어쓰지 않고 조정원장으로 처리
create table if not exists public.pnl_classification_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pnl_year integer not null,
  pnl_month integer not null check (pnl_month between 1 and 12),
  source_pnl_id uuid references public.company_monthly_pnl(id) on delete set null,
  source_label text not null,
  amount bigint not null check (amount >= 0),
  from_business_unit text not null check (from_business_unit in ('window', 'interior', 'common', 'unclassified')),
  to_business_unit text not null check (to_business_unit in ('window', 'interior', 'common', 'unclassified')),
  cost_nature text not null default 'sga'
    check (cost_nature in ('direct_cost', 'sga', 'non_operating', 'asset', 'tax_finance', 'other')),
  reason text not null,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'cancelled')),
  source_type text not null default 'manual_adjustment',
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  check (from_business_unit <> to_business_unit)
);

create index if not exists pnl_classification_adjustments_month_idx
  on public.pnl_classification_adjustments (company_id, pnl_year, pnl_month, status);

alter table public.pnl_classification_adjustments enable row level security;

create policy pnl_classification_adjustments_admin_select
on public.pnl_classification_adjustments
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

create policy pnl_classification_adjustments_admin_insert
on public.pnl_classification_adjustments
for insert to authenticated
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

create policy pnl_classification_adjustments_admin_update
on public.pnl_classification_adjustments
for update to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
)
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

-- 6) 미분류 비용은 손익에서 숨기지 않고 별도 노출
-- 실제 View는 Gate 3 Preview DB 검증 후 작성한다.
-- 기대 집계:
--   unclassified_expense_amount
--   unclassified_expense_count
--   oldest_unclassified_expense_date
-- 월마감은 미분류/검토중 비용이 존재하면 차단한다.

-- 7) 수금배분은 클라이언트 직접 INSERT가 아니라 RPC 트랜잭션으로만 처리
-- Gate 3 실제 migration 후보 함수 요구사항:
--   * receipt와 schedule의 company/contract 동일성 확인
--   * 수금액 초과 배분 차단
--   * 취소 수금 배분 차단
--   * 회차 상태 planned/partial/received 자동 갱신
--   * 계약 received/outstanding 재계산
--   * 관리자/담당직원 권한 재검증

-- 8) 실제 운영 migration 전 필수 검사
--   * 신규 RLS 테이블 policy 누락 0건
--   * authenticated TRUNCATE/TRIGGER/REFERENCES 권한 0건
--   * 확정 employee_settlement_batches 변경 0건
--   * 회사 손익 불변식 diff 0원
--   * 수금/매출 중복 집계 0건

rollback;
