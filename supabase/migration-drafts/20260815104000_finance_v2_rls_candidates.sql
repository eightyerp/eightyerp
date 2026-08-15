-- =============================================================================
-- Eighty ERP — Finance V2 RLS Candidates (GATE 3 PREVIEW DRAFT ONLY)
-- 운영 migration 아님. 마지막 ROLLBACK 유지.
-- =============================================================================

begin;

-- 모든 신규 Finance V2 테이블은 RLS 활성화
alter table public.expense_classification_events enable row level security;
alter table public.expense_approval_events enable row level security;
alter table public.expense_payment_events enable row level security;
alter table public.finance_import_batches enable row level security;
alter table public.finance_import_rows enable row level security;
alter table public.collection_schedules enable row level security;
alter table public.collection_receipt_allocations enable row level security;
alter table public.collection_opening_balances enable row level security;
alter table public.employee_settlement_rules enable row level security;
alter table public.employee_settlement_previews enable row level security;
alter table public.employee_settlement_snapshots enable row level security;
alter table public.employee_settlement_approval_events enable row level security;
alter table public.company_sales_target_revisions enable row level security;
alter table public.finance_month_closings enable row level security;
alter table public.pnl_classification_adjustments enable row level security;

-- -----------------------------------------------------------------------------
-- 1. 지출 이벤트: 관리자 전체 / 직원은 본인이 요청한 지출의 이벤트만 조회
-- -----------------------------------------------------------------------------

drop policy if exists expense_classification_events_select_scope on public.expense_classification_events;
create policy expense_classification_events_select_scope
on public.expense_classification_events
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_company_role() in ('owner', 'director', 'admin')
    or exists (
      select 1
      from public.expense_requests e
      where e.id = expense_request_id
        and e.company_id = public.current_company_id()
        and e.requested_by_employee_id = public.current_employee_id()
    )
  )
);

drop policy if exists expense_approval_events_select_scope on public.expense_approval_events;
create policy expense_approval_events_select_scope
on public.expense_approval_events
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_company_role() in ('owner', 'director', 'admin')
    or exists (
      select 1
      from public.expense_requests e
      where e.id = expense_request_id
        and e.company_id = public.current_company_id()
        and e.requested_by_employee_id = public.current_employee_id()
    )
  )
);

drop policy if exists expense_payment_events_select_scope on public.expense_payment_events;
create policy expense_payment_events_select_scope
on public.expense_payment_events
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_company_role() in ('owner', 'director', 'admin')
    or exists (
      select 1
      from public.expense_requests e
      where e.id = expense_request_id
        and e.company_id = public.current_company_id()
        and e.requested_by_employee_id = public.current_employee_id()
    )
  )
);

-- 이벤트의 직접 INSERT/UPDATE/DELETE는 앱에서 사용하지 않고 SECURITY DEFINER RPC로만 기록

-- -----------------------------------------------------------------------------
-- 2. 재무 이관: 관리자 전용
-- -----------------------------------------------------------------------------

drop policy if exists finance_import_batches_admin_select on public.finance_import_batches;
create policy finance_import_batches_admin_select
on public.finance_import_batches
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

drop policy if exists finance_import_rows_admin_select on public.finance_import_rows;
create policy finance_import_rows_admin_select
on public.finance_import_rows
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

-- -----------------------------------------------------------------------------
-- 3. 수금계획: 관리자 전체 / 직원은 담당 고객 계약만 조회
-- -----------------------------------------------------------------------------

drop policy if exists collection_schedules_select_scope on public.collection_schedules;
create policy collection_schedules_select_scope
on public.collection_schedules
for select to authenticated
using (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.contracts c
    where c.id = contract_id
      and c.company_id = public.current_company_id()
      and (
        public.current_company_role() in ('owner', 'director', 'admin')
        or public.can_access_customer(c.customer_id)
      )
  )
);

drop policy if exists collection_receipt_allocations_select_scope on public.collection_receipt_allocations;
create policy collection_receipt_allocations_select_scope
on public.collection_receipt_allocations
for select to authenticated
using (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.collection_receipts r
    where r.id = receipt_id
      and r.company_id = public.current_company_id()
      and (
        public.current_company_role() in ('owner', 'director', 'admin')
        or public.can_access_customer(r.customer_id)
      )
  )
);

drop policy if exists collection_opening_balances_select_scope on public.collection_opening_balances;
create policy collection_opening_balances_select_scope
on public.collection_opening_balances
for select to authenticated
using (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.contracts c
    where c.id = contract_id
      and c.company_id = public.current_company_id()
      and (
        public.current_company_role() in ('owner', 'director', 'admin')
        or public.can_access_customer(c.customer_id)
      )
  )
);

-- 수금계획/배분/기초잔액 쓰기는 RPC로만 수행

-- -----------------------------------------------------------------------------
-- 4. 직원 정산규칙: 관리자만 직접 조회
--    일반 직원 화면은 서버에서 계산된 본인 Preview/확정 Snapshot만 조회
-- -----------------------------------------------------------------------------

drop policy if exists employee_settlement_rules_admin_select on public.employee_settlement_rules;
create policy employee_settlement_rules_admin_select
on public.employee_settlement_rules
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

-- 예상 정산: 관리자 전체 / 직원 본인만

drop policy if exists employee_settlement_previews_select_private on public.employee_settlement_previews;
create policy employee_settlement_previews_select_private
on public.employee_settlement_previews
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_company_role() in ('owner', 'director', 'admin')
    or employee_id = public.current_employee_id()
  )
);

-- 확정 Snapshot: 관리자 전체 / 직원 본인만

drop policy if exists employee_settlement_snapshots_select_private on public.employee_settlement_snapshots;
create policy employee_settlement_snapshots_select_private
on public.employee_settlement_snapshots
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_company_role() in ('owner', 'director', 'admin')
    or employee_id = public.current_employee_id()
  )
);

-- 정산 승인 이벤트: 관리자 전체 / 직원 본인 이벤트만

drop policy if exists employee_settlement_approval_events_select_private on public.employee_settlement_approval_events;
create policy employee_settlement_approval_events_select_private
on public.employee_settlement_approval_events
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_company_role() in ('owner', 'director', 'admin')
    or employee_id = public.current_employee_id()
  )
);

-- 정산 Preview/Snapshot/승인이력 쓰기는 관리자 RPC 전용

-- -----------------------------------------------------------------------------
-- 5. 회사 목표변경/월마감/공통비 재분류: 관리자 전용
-- -----------------------------------------------------------------------------

drop policy if exists company_sales_target_revisions_admin_select on public.company_sales_target_revisions;
create policy company_sales_target_revisions_admin_select
on public.company_sales_target_revisions
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

drop policy if exists finance_month_closings_admin_select on public.finance_month_closings;
create policy finance_month_closings_admin_select
on public.finance_month_closings
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

drop policy if exists pnl_classification_adjustments_admin_select on public.pnl_classification_adjustments;
create policy pnl_classification_adjustments_admin_select
on public.pnl_classification_adjustments
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

-- -----------------------------------------------------------------------------
-- 6. 최소권한
-- -----------------------------------------------------------------------------

revoke all on table
  public.expense_classification_events,
  public.expense_approval_events,
  public.expense_payment_events,
  public.finance_import_batches,
  public.finance_import_rows,
  public.collection_schedules,
  public.collection_receipt_allocations,
  public.collection_opening_balances,
  public.employee_settlement_rules,
  public.employee_settlement_previews,
  public.employee_settlement_snapshots,
  public.employee_settlement_approval_events,
  public.company_sales_target_revisions,
  public.finance_month_closings,
  public.pnl_classification_adjustments
from anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.expense_classification_events,
  public.expense_approval_events,
  public.expense_payment_events,
  public.finance_import_batches,
  public.finance_import_rows,
  public.collection_schedules,
  public.collection_receipt_allocations,
  public.collection_opening_balances,
  public.employee_settlement_rules,
  public.employee_settlement_previews,
  public.employee_settlement_snapshots,
  public.employee_settlement_approval_events,
  public.company_sales_target_revisions,
  public.finance_month_closings,
  public.pnl_classification_adjustments
from authenticated;

grant select on table
  public.expense_classification_events,
  public.expense_approval_events,
  public.expense_payment_events,
  public.collection_schedules,
  public.collection_receipt_allocations,
  public.collection_opening_balances,
  public.employee_settlement_previews,
  public.employee_settlement_snapshots,
  public.employee_settlement_approval_events
 to authenticated;

grant select on table
  public.finance_import_batches,
  public.finance_import_rows,
  public.employee_settlement_rules,
  public.company_sales_target_revisions,
  public.finance_month_closings,
  public.pnl_classification_adjustments
 to authenticated;

-- RLS가 실제 행 접근을 제한하며 authenticated에는 직접 쓰기권한을 주지 않는다.
-- 관리자 쓰기 또한 전용 RPC를 통해 역할/감사로그를 강제한다.

rollback;
