-- =============================================================================
-- Eighty ERP — Finance Workflow V2 (GATE 2 DRAFT ONLY)
-- 파일: supabase/migration-drafts/20260815060000_finance_workflow_v2_draft.sql
--
-- 중요:
--   1) 이 파일은 설계 검토용 초안이며 supabase/migrations 경로가 아닙니다.
--   2) 운영 DB에 적용하지 않습니다.
--   3) 기존 데이터 삭제, TRUNCATE, 확정 정산 덮어쓰기를 하지 않습니다.
--   4) Gate 3 Preview 검증 후 승인된 SQL만 실제 migration으로 이동합니다.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. 프로젝트 사업부
-- -----------------------------------------------------------------------------

alter table public.projects
  add column if not exists business_unit text not null default 'unclassified';

alter table public.projects
  drop constraint if exists projects_business_unit_check;

alter table public.projects
  add constraint projects_business_unit_check
  check (business_unit in ('window', 'interior', 'mixed', 'unclassified')) not valid;

comment on column public.projects.business_unit is
  '현장 기본 사업부. mixed는 혼합현장, unclassified는 관리자 검토 필요.';

-- Gate 3에서 최신 견적/계약/담당팀을 이용한 안전한 추천 backfill을 별도 검증 후 실행합니다.

-- -----------------------------------------------------------------------------
-- 2. 지출 워크플로 상태 분리
-- -----------------------------------------------------------------------------

alter table public.expense_requests
  add column if not exists business_unit text not null default 'unclassified',
  add column if not exists cost_nature text not null default 'other',
  add column if not exists classification_status text not null default 'unclassified',
  add column if not exists approval_status text not null default 'pending',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists evidence_status text not null default 'missing',
  add column if not exists accounting_status text not null default 'unclassified',
  add column if not exists recognized_at timestamptz,
  add column if not exists source_type text not null default 'erp',
  add column if not exists version integer not null default 1;

alter table public.expense_requests
  drop constraint if exists expense_requests_business_unit_check,
  drop constraint if exists expense_requests_cost_nature_check,
  drop constraint if exists expense_requests_classification_status_check,
  drop constraint if exists expense_requests_approval_status_check,
  drop constraint if exists expense_requests_payment_status_check,
  drop constraint if exists expense_requests_evidence_status_check,
  drop constraint if exists expense_requests_accounting_status_check,
  drop constraint if exists expense_requests_source_type_check;

alter table public.expense_requests
  add constraint expense_requests_business_unit_check
    check (business_unit in ('window', 'interior', 'common', 'unclassified')) not valid,
  add constraint expense_requests_cost_nature_check
    check (cost_nature in ('direct_cost', 'sga', 'non_operating', 'asset', 'tax_finance', 'other')) not valid,
  add constraint expense_requests_classification_status_check
    check (classification_status in ('unclassified', 'review_required', 'ready', 'posted', 'closed')) not valid,
  add constraint expense_requests_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected', 'cancelled')) not valid,
  add constraint expense_requests_payment_status_check
    check (payment_status in ('unpaid', 'paid', 'partially_refunded', 'refunded')) not valid,
  add constraint expense_requests_evidence_status_check
    check (evidence_status in ('missing', 'attached', 'tax_reviewed', 'complete')) not valid,
  add constraint expense_requests_accounting_status_check
    check (accounting_status in ('unclassified', 'review_required', 'ready', 'posted', 'closed')) not valid,
  add constraint expense_requests_source_type_check
    check (source_type in ('erp', 'manual', 'excel_import', 'opening_balance')) not valid;

-- 기존 status를 신규 상태로 비파괴 backfill합니다.
update public.expense_requests
set
  approval_status = case status
    when 'pending' then 'pending'
    when 'approved' then 'approved'
    when 'paid' then 'approved'
    when 'rejected' then 'rejected'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end,
  payment_status = case
    when status = 'paid' or payment_method in ('company_card', 'personal_card', 'cash') then 'paid'
    else 'unpaid'
  end,
  evidence_status = case
    when exists (
      select 1
      from public.expense_documents d
      where d.expense_request_id = expense_requests.id
    ) then 'attached'
    else 'missing'
  end,
  classification_status = case
    when business_unit = 'unclassified' then 'unclassified'
    else 'review_required'
  end,
  accounting_status = 'review_required',
  version = greatest(coalesce(version, 1), 1)
where true;

-- 현행 scope 제약은 operating 지출을 막고 있으므로 안전한 OR 조건으로 교체합니다.
alter table public.expense_requests
  drop constraint if exists expense_requests_scope_project_check;

alter table public.expense_requests
  add constraint expense_requests_scope_project_check
  check (
    (expense_scope = 'project' and project_id is not null)
    or
    (expense_scope = 'operating' and project_id is null)
  ) not valid;

create index if not exists expense_requests_finance_work_queue_idx
  on public.expense_requests (
    company_id,
    approval_status,
    payment_status,
    classification_status,
    evidence_status,
    created_at desc
  );

create index if not exists expense_requests_business_month_idx
  on public.expense_requests (company_id, business_unit, cost_nature, expense_date)
  where approval_status = 'approved' and accounting_status in ('ready', 'posted', 'closed');

-- 기존 status는 Gate 3 호환기간 동안 유지합니다.
comment on column public.expense_requests.status is
  'Legacy compatibility status. 신규 화면은 approval/payment/evidence/accounting 상태를 우선 사용.';

-- -----------------------------------------------------------------------------
-- 3. 지출 감사 이벤트
-- -----------------------------------------------------------------------------

create table if not exists public.expense_classification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  expense_request_id uuid not null references public.expense_requests(id) on delete cascade,
  previous_business_unit text,
  next_business_unit text not null,
  previous_cost_nature text,
  next_cost_nature text not null,
  previous_classification_status text,
  next_classification_status text not null,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists public.expense_approval_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  expense_request_id uuid not null references public.expense_requests(id) on delete cascade,
  event_type text not null check (event_type in ('requested', 'approved', 'rejected', 'supplement_requested', 'cancelled')),
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_payment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  expense_request_id uuid not null references public.expense_requests(id) on delete cascade,
  event_type text not null check (event_type in ('paid', 'partially_refunded', 'refunded', 'payment_corrected')),
  amount bigint not null check (amount >= 0),
  payment_method text,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists expense_classification_events_expense_idx
  on public.expense_classification_events (expense_request_id, changed_at desc);
create index if not exists expense_approval_events_expense_idx
  on public.expense_approval_events (expense_request_id, created_at desc);
create index if not exists expense_payment_events_expense_idx
  on public.expense_payment_events (expense_request_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- 4. 재무 Excel/기초잔액 이관 배치
-- -----------------------------------------------------------------------------

create table if not exists public.finance_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  import_type text not null check (import_type in ('contracts_opening', 'collections_opening', 'expenses_opening', 'settlements_opening')),
  source_name text not null,
  source_cutoff_date date,
  file_hash text,
  status text not null default 'analyzed'
    check (status in ('analyzed', 'review_required', 'approved', 'applied', 'rolled_back')),
  row_count integer not null default 0 check (row_count >= 0),
  total_amount numeric(18,2) not null default 0,
  analysis_summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.finance_import_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  batch_id uuid not null references public.finance_import_batches(id) on delete cascade,
  row_number integer not null,
  source_payload jsonb not null default '{}'::jsonb,
  mapped_customer_id uuid references public.customers(id) on delete set null,
  mapped_project_id uuid references public.projects(id) on delete set null,
  mapped_employee_id uuid references public.employees(id) on delete set null,
  mapped_business_unit text,
  duplicate_status text not null default 'unchecked'
    check (duplicate_status in ('unchecked', 'unique', 'duplicate', 'conflict')),
  validation_status text not null default 'review_required'
    check (validation_status in ('valid', 'warning', 'error', 'review_required')),
  validation_messages jsonb not null default '[]'::jsonb,
  applied_target_table text,
  applied_target_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists finance_import_batches_file_uq
  on public.finance_import_batches (company_id, import_type, file_hash)
  where file_hash is not null and status <> 'rolled_back';

create unique index if not exists finance_import_rows_batch_row_uq
  on public.finance_import_rows (batch_id, row_number);

-- -----------------------------------------------------------------------------
-- 5. 수금계획·기초잔액
-- -----------------------------------------------------------------------------

create table if not exists public.collection_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  schedule_type text not null
    check (schedule_type in ('deposit', 'interim_1', 'interim_2', 'balance', 'other')),
  sequence_no integer not null default 1 check (sequence_no > 0),
  planned_date date,
  planned_amount bigint not null check (planned_amount > 0),
  status text not null default 'planned'
    check (status in ('planned', 'partial', 'received', 'overdue', 'cancelled')),
  memo text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  receipt_id uuid not null references public.collection_receipts(id) on delete cascade,
  schedule_id uuid not null references public.collection_schedules(id) on delete cascade,
  allocated_amount bigint not null check (allocated_amount > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (receipt_id, schedule_id)
);

create table if not exists public.collection_opening_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  as_of_date date not null,
  opening_received_amount bigint not null default 0 check (opening_received_amount >= 0),
  opening_outstanding_amount bigint not null default 0 check (opening_outstanding_amount >= 0),
  source_type text not null default 'excel_import'
    check (source_type in ('manual', 'excel_import', 'opening_balance')),
  source_name text,
  import_batch_id uuid references public.finance_import_batches(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists collection_schedules_contract_seq_uq
  on public.collection_schedules (contract_id, sequence_no)
  where status <> 'cancelled';

create unique index if not exists collection_opening_balances_active_uq
  on public.collection_opening_balances (company_id, contract_id, as_of_date)
  where is_active;

create index if not exists collection_schedules_due_idx
  on public.collection_schedules (company_id, status, planned_date);

-- -----------------------------------------------------------------------------
-- 6. 직원 정산규칙·예상값·확정 스냅샷
-- -----------------------------------------------------------------------------

create table if not exists public.employee_settlement_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  employee_id uuid references public.employees(id) on delete set null,
  business_unit text not null check (business_unit in ('window', 'interior')),
  basis_type text not null check (basis_type in ('contribution_margin', 'contract_amount', 'manual')),
  rate numeric(9,6) not null check (rate >= 0 and rate <= 1),
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists employee_settlement_rules_default_active_uq
  on public.employee_settlement_rules (company_id, business_unit)
  where employee_id is null and is_active;

create unique index if not exists employee_settlement_rules_employee_active_uq
  on public.employee_settlement_rules (company_id, employee_id)
  where employee_id is not null and is_active;

create table if not exists public.employee_settlement_previews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  settlement_year integer not null,
  settlement_month integer not null check (settlement_month between 1 and 12),
  business_unit text not null check (business_unit in ('window', 'interior')),
  basis_type text not null check (basis_type in ('contribution_margin', 'contract_amount', 'sales_performance_proxy', 'manual')),
  basis_amount numeric(18,2) not null default 0,
  rate numeric(9,6) not null default 0,
  base_preview_amount bigint not null default 0,
  additional_incentive_amount bigint not null default 0,
  deduction_amount bigint not null default 0,
  paid_amount bigint not null default 0,
  expected_payable_amount bigint not null default 0,
  calculation_source text not null,
  calculation_status text not null default 'provisional'
    check (calculation_status in ('provisional', 'review_required', 'ready')),
  source_cutoff_date date,
  data_quality_status text not null default 'incomplete'
    check (data_quality_status in ('high', 'medium', 'low', 'incomplete', 'review_required')),
  calculation_snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  is_active boolean not null default true,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_settlement_previews_active_uq
  on public.employee_settlement_previews (company_id, employee_id, settlement_year, settlement_month)
  where is_active;

create table if not exists public.employee_settlement_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  settlement_batch_id uuid references public.employee_settlement_batches(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  settlement_year integer not null,
  settlement_month integer not null check (settlement_month between 1 and 12),
  revenue_amount numeric(18,2) not null default 0,
  cost_amount numeric(18,2) not null default 0,
  margin_amount numeric(18,2) not null default 0,
  basis_type text not null,
  rate numeric(9,6) not null default 0,
  base_settlement_amount bigint not null default 0,
  additional_incentive_amount bigint not null default 0,
  deduction_amount bigint not null default 0,
  paid_amount bigint not null default 0,
  cost_confirmation_rate numeric(7,4),
  pending_expense_count integer not null default 0,
  missing_evidence_count integer not null default 0,
  post_settlement_expense_count integer not null default 0,
  source_cutoff_date date,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_settlement_approval_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  employee_id uuid not null references public.employees(id) on delete restrict,
  settlement_batch_id uuid references public.employee_settlement_batches(id) on delete cascade,
  event_type text not null
    check (event_type in ('review_requested', 'supplement_requested', 'confirmed', 'paid', 'adjusted', 'cancelled')),
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 사업부 기본 정산규칙은 Gate 3 Preview DB에서 검증 후 적용합니다.
-- insert into public.employee_settlement_rules (... interior, contribution_margin, 0.5 ...)
-- insert into public.employee_settlement_rules (... window, contract_amount, 0.02 ...)

-- -----------------------------------------------------------------------------
-- 7. 목표 변경이력 및 월마감
-- -----------------------------------------------------------------------------

create table if not exists public.company_sales_target_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  target_year integer not null,
  previous_amount bigint,
  next_amount bigint not null check (next_amount > 0),
  reason text not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'active', 'superseded', 'cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  activated_at timestamptz
);

create table if not exists public.finance_month_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  close_year integer not null,
  close_month integer not null check (close_month between 1 and 12),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'closed', 'reopened', 'approved')),
  sales_status text not null default 'draft',
  collections_status text not null default 'draft',
  expenses_status text not null default 'draft',
  settlements_status text not null default 'draft',
  validation_result jsonb not null default '{}'::jsonb,
  closed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, close_year, close_month)
);

-- 운영 목표 50억 → 100억 변경 DML은 별도 대표 승인 후 실제 migration에 포함합니다.
-- update public.company_sales_targets
-- set target_amount = 10000000000, updated_at = now(), updated_by = auth.uid()
-- where company_id = '<EIGHTY_COMPANY_ID>' and target_year = 2026;

-- -----------------------------------------------------------------------------
-- 8. RLS 초안
-- -----------------------------------------------------------------------------

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

-- 관리자 공통 helper 조건은 현행 owner/director/admin 규칙을 사용합니다.

create policy finance_import_batches_admin_all
on public.finance_import_batches
for all to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
)
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

create policy finance_import_rows_admin_all
on public.finance_import_rows
for all to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
)
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

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

create policy employee_settlement_previews_admin_write
on public.employee_settlement_previews
for all to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
)
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

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

create policy employee_settlement_snapshots_admin_write
on public.employee_settlement_snapshots
for all to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
)
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

-- 나머지 신규 테이블은 Gate 3에서 계약 담당자·지출 요청자 join 정책을 검증 후 확정합니다.

-- -----------------------------------------------------------------------------
-- 9. 최소권한 초안
-- -----------------------------------------------------------------------------

revoke truncate, references, trigger
on table public.collection_receipts,
         public.expense_requests,
         public.employee_settlement_batches,
         public.employee_settlement_lines,
         public.company_monthly_pnl,
         public.company_sales_targets,
         public.sales_performance_monthly,
         public.sales_performance_period_totals
from authenticated;

-- -----------------------------------------------------------------------------
-- 10. 검증 전에는 constraint validate 및 commit을 수행하지 않습니다.
-- -----------------------------------------------------------------------------

rollback;
