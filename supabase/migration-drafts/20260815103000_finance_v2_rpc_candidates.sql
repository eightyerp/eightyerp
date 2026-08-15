-- =============================================================================
-- Eighty ERP — Finance V2 RPC Candidates (GATE 3 PREVIEW DRAFT ONLY)
--
-- 목적:
--   * 직원은 1분 내 지출/수금 보고
--   * 관리자는 승인/지급/분류를 분리
--   * 개인카드/현금 직원 선지급은 환급 원장으로 분리
--   * 수금 회차 배분과 기초잔액을 트랜잭션으로 보호
--
-- 중요:
--   이 파일은 운영 migration이 아닙니다.
--   supabase/migrations 경로가 아니며 마지막 ROLLBACK을 유지합니다.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. 수금 V2 메타데이터 후보
-- -----------------------------------------------------------------------------

alter table public.collection_receipts
  add column if not exists payer_name text,
  add column if not exists bank_transaction_id text,
  add column if not exists card_approval_no text,
  add column if not exists idempotency_key text,
  add column if not exists requested_schedule_id uuid references public.collection_schedules(id) on delete set null,
  add column if not exists reconciliation_status text not null default 'unmatched',
  add column if not exists source_type text not null default 'erp';

alter table public.collection_receipts
  drop constraint if exists collection_receipts_reconciliation_status_check,
  drop constraint if exists collection_receipts_source_type_check;

alter table public.collection_receipts
  add constraint collection_receipts_reconciliation_status_check
    check (reconciliation_status in ('unmatched', 'matched', 'review_required', 'ignored')) not valid,
  add constraint collection_receipts_source_type_check
    check (source_type in ('erp', 'manual', 'excel_import', 'opening_balance')) not valid;

create unique index if not exists collection_receipts_idempotency_uq
  on public.collection_receipts (company_id, idempotency_key)
  where idempotency_key is not null and status <> 'cancelled';

create index if not exists collection_receipts_reconciliation_idx
  on public.collection_receipts (company_id, reconciliation_status, received_at desc);

-- -----------------------------------------------------------------------------
-- 1. 지출 등록 V3 후보
-- -----------------------------------------------------------------------------

create or replace function public.register_expense_request_v3(
  p_expense_scope text,
  p_project_id uuid,
  p_business_unit text,
  p_cost_nature text,
  p_work_trade text,
  p_category text,
  p_vendor_id uuid,
  p_vendor_name text,
  p_description text,
  p_supply_amount bigint,
  p_vat_amount bigint,
  p_total_amount bigint,
  p_expense_date date,
  p_payment_due_date date,
  p_payment_method text,
  p_paid_by_party text default null,
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_employee uuid := public.current_employee_id();
  v_project public.projects%rowtype;
  v_customer uuid;
  v_customer_assigned_employee uuid;
  v_contract uuid;
  v_vendor public.vendors%rowtype;
  v_row public.expense_requests%rowtype;
  v_legacy_status text;
  v_approval_status text;
  v_payment_status text;
  v_evidence_status text := 'missing';
  v_classification_status text;
  v_accounting_status text;
  v_business_unit text := coalesce(nullif(pg_catalog.btrim(p_business_unit), ''), 'unclassified');
  v_cost_nature text := coalesce(nullif(pg_catalog.btrim(p_cost_nature), ''), 'other');
  v_paid_by text;
  v_reimbursement_status text := 'not_applicable';
  v_reimbursement_employee uuid;
  v_liability_type text := 'none';
  v_team_name text;
  v_quote_type text;
begin
  if v_uid is null or not public.is_erp_user() or v_company is null then
    raise exception '권한이 없습니다.';
  end if;

  if p_expense_scope not in ('project', 'operating') then
    raise exception '지출 구분이 올바르지 않습니다.';
  end if;

  if v_business_unit not in ('window', 'interior', 'common', 'unclassified') then
    raise exception '사업부 구분이 올바르지 않습니다.';
  end if;

  if v_cost_nature not in ('direct_cost', 'sga', 'non_operating', 'asset', 'tax_finance', 'other') then
    raise exception '비용 성격이 올바르지 않습니다.';
  end if;

  if p_payment_method not in ('bank_transfer', 'company_card', 'personal_card', 'cash', 'other') then
    raise exception '결제수단이 올바르지 않습니다.';
  end if;

  if p_supply_amount < 0 or p_vat_amount < 0 or p_total_amount <= 0
     or p_total_amount <> p_supply_amount + p_vat_amount then
    raise exception '공급가·부가세·합계 금액을 확인해 주세요.';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_description, '')), '') is null then
    raise exception '지출 내용을 입력해 주세요.';
  end if;

  if v_role not in ('owner', 'director', 'admin') and v_employee is null then
    raise exception '연결된 직원 정보가 없습니다.';
  end if;

  if p_expense_scope = 'project' then
    if p_project_id is null then
      raise exception '현장비는 현장을 선택해 주세요.';
    end if;

    select * into v_project
    from public.projects
    where id = p_project_id
      and company_id = v_company
      and deleted_at is null;

    if not found then
      raise exception '현장을 찾을 수 없습니다.';
    end if;

    select c.assigned_employee_id
      into v_customer_assigned_employee
    from public.customers c
    where c.id = v_project.customer_id
      and c.company_id = v_company
      and c.deleted_at is null;

    if v_role not in ('owner', 'director', 'admin')
       and v_customer_assigned_employee is distinct from v_employee then
      raise exception '본인 담당 고객의 현장에만 지출요청을 등록할 수 있습니다.';
    end if;

    v_customer := v_project.customer_id;

    select c.id into v_contract
    from public.contracts c
    where c.company_id = v_company
      and c.project_id = v_project.id
      and c.contract_kind = 'original'
      and c.status not in ('draft', 'cancelled', 'terminated')
    order by c.contract_date desc, c.created_at desc
    limit 1;

    -- 명시값이 없을 때만 안전한 순서로 사업부를 추천합니다.
    if v_business_unit = 'unclassified' then
      if v_project.business_unit in ('window', 'interior') then
        v_business_unit := v_project.business_unit;
      else
        select q.quote_type into v_quote_type
        from public.quotes q
        where q.company_id = v_company
          and q.project_id = v_project.id
          and q.deleted_at is null
        order by q.created_at desc
        limit 1;

        if lower(coalesce(v_quote_type, '')) like '%window%'
           or coalesce(v_quote_type, '') like '%창호%' then
          v_business_unit := 'window';
        elsif lower(coalesce(v_quote_type, '')) like '%interior%'
           or coalesce(v_quote_type, '') like '%인테리어%' then
          v_business_unit := 'interior';
        else
          select t.name into v_team_name
          from public.employees e
          left join public.teams t on t.id = e.team_id
          where e.id = v_project.assigned_employee_id
            and e.company_id = v_company;

          if v_team_name = '창호' then
            v_business_unit := 'window';
          elsif v_team_name = '인테리어' then
            v_business_unit := 'interior';
          end if;
        end if;
      end if;
    end if;

    if v_cost_nature = 'other' then
      v_cost_nature := 'direct_cost';
    end if;
  else
    if p_project_id is not null then
      raise exception '운영비는 현장을 지정할 수 없습니다.';
    end if;

    if v_role not in ('owner', 'director', 'admin') then
      raise exception '회사 운영비는 관리자만 등록할 수 있습니다.';
    end if;

    if v_cost_nature = 'other' then
      v_cost_nature := 'sga';
    end if;

    if v_cost_nature = 'direct_cost' then
      raise exception '직접원가는 현장비로 등록해 주세요.';
    end if;

    v_customer := null;
    v_contract := null;
  end if;

  if p_vendor_id is not null then
    select * into v_vendor
    from public.vendors
    where id = p_vendor_id
      and company_id = v_company
      and review_status <> 'inactive';

    if not found then
      raise exception '거래처를 찾을 수 없습니다.';
    end if;
  end if;

  v_approval_status := case
    when v_role in ('owner', 'director', 'admin') then 'approved'
    else 'pending'
  end;
  v_legacy_status := v_approval_status;

  v_paid_by := coalesce(
    nullif(pg_catalog.btrim(coalesce(p_paid_by_party, '')), ''),
    case
      when p_payment_method = 'personal_card' then 'employee'
      when p_payment_method = 'cash' and v_role not in ('owner', 'director', 'admin') then 'employee'
      else 'company'
    end
  );

  if v_paid_by not in ('company', 'employee', 'customer', 'other') then
    raise exception '지급 주체가 올바르지 않습니다.';
  end if;

  if v_paid_by = 'employee' and v_employee is null then
    raise exception '직원 선지급으로 등록하려면 연결된 직원 정보가 필요합니다.';
  end if;

  v_payment_status := case
    when p_payment_method in ('company_card', 'personal_card', 'cash') then 'paid'
    else 'unpaid'
  end;

  if v_paid_by = 'employee' then
    v_reimbursement_status := 'payable';
    v_reimbursement_employee := v_employee;
    v_liability_type := 'employee_reimbursement';
  elsif p_payment_method = 'company_card' then
    v_liability_type := 'corporate_card_payable';
  elsif p_payment_method = 'bank_transfer' and v_payment_status = 'unpaid' then
    v_liability_type := 'vendor_payable';
  end if;

  v_classification_status := case
    when v_business_unit = 'unclassified' then 'unclassified'
    when v_cost_nature = 'other' then 'review_required'
    else 'ready'
  end;

  v_accounting_status := case
    when v_approval_status = 'approved' and v_classification_status = 'ready' then 'ready'
    else 'review_required'
  end;

  insert into public.expense_requests(
    company_id, expense_scope, project_id, customer_id, contract_id,
    work_trade, category, vendor_id, vendor_name_snapshot,
    description, supply_amount, vat_amount, total_amount,
    expense_date, payment_due_date, payment_method, status,
    requested_by_user_id, requested_by_employee_id, approved_by, approved_at, memo,
    business_unit, cost_nature, classification_status,
    approval_status, payment_status, evidence_status, accounting_status,
    paid_by_party, reimbursement_status, reimbursement_employee_id,
    liability_type, source_type
  ) values (
    v_company,
    p_expense_scope,
    case when p_expense_scope = 'project' then p_project_id else null end,
    v_customer,
    v_contract,
    p_work_trade,
    p_category,
    p_vendor_id,
    coalesce(v_vendor.name, nullif(pg_catalog.btrim(coalesce(p_vendor_name, '')), '')),
    pg_catalog.btrim(p_description),
    p_supply_amount,
    p_vat_amount,
    p_total_amount,
    coalesce(p_expense_date, (current_timestamp at time zone 'Asia/Seoul')::date),
    p_payment_due_date,
    p_payment_method,
    v_legacy_status,
    v_uid,
    v_employee,
    case when v_approval_status = 'approved' then v_uid else null end,
    case when v_approval_status = 'approved' then now() else null end,
    nullif(pg_catalog.btrim(coalesce(p_memo, '')), ''),
    v_business_unit,
    v_cost_nature,
    v_classification_status,
    v_approval_status,
    v_payment_status,
    v_evidence_status,
    v_accounting_status,
    v_paid_by,
    v_reimbursement_status,
    v_reimbursement_employee,
    v_liability_type,
    'erp'
  )
  returning * into v_row;

  insert into public.expense_approval_events(
    company_id, expense_request_id, event_type, actor_user_id
  ) values (
    v_company,
    v_row.id,
    case when v_approval_status = 'approved' then 'approved' else 'requested' end,
    v_uid
  );

  if v_payment_status = 'paid' then
    insert into public.expense_payment_events(
      company_id, expense_request_id, event_type, amount,
      payment_method, actor_user_id, occurred_at
    ) values (
      v_company, v_row.id, 'paid', p_total_amount,
      p_payment_method, v_uid, now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'expense_id', v_row.id,
    'legacy_status', v_row.status,
    'approval_status', v_approval_status,
    'payment_status', v_payment_status,
    'business_unit', v_business_unit,
    'cost_nature', v_cost_nature,
    'classification_status', v_classification_status,
    'accounting_status', v_accounting_status,
    'reimbursement_status', v_reimbursement_status,
    'amount', v_row.total_amount
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2. 직원 환급 지급완료 후보
-- -----------------------------------------------------------------------------

create or replace function public.mark_expense_reimbursement_paid_v1(
  p_expense_id uuid,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_row public.expense_requests%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner', 'director', 'admin') then
    raise exception '관리자만 직원 환급을 완료할 수 있습니다.';
  end if;

  update public.expense_requests
  set reimbursement_status = 'paid',
      reimbursed_at = coalesce(p_paid_at, now()),
      liability_type = case
        when liability_type = 'employee_reimbursement' then 'none'
        else liability_type
      end,
      updated_at = now()
  where id = p_expense_id
    and company_id = v_company
    and reimbursement_status in ('payable', 'approved')
  returning * into v_row;

  if not found then
    raise exception '환급대상 지출을 찾을 수 없습니다.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'expense_id', v_row.id,
    'reimbursement_status', v_row.reimbursement_status,
    'reimbursement_employee_id', v_row.reimbursement_employee_id,
    'amount', v_row.total_amount
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 3. 수금 등록 V2 후보
-- -----------------------------------------------------------------------------

create or replace function public.register_collection_receipt_v2(
  p_contract_id uuid,
  p_collection_type text,
  p_payment_method text,
  p_amount bigint,
  p_received_at timestamptz default now(),
  p_schedule_id uuid default null,
  p_payer_name text default null,
  p_bank_transaction_id text default null,
  p_card_approval_no text default null,
  p_idempotency_key text default null,
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_employee uuid := public.current_employee_id();
  v_contract public.contracts%rowtype;
  v_schedule public.collection_schedules%rowtype;
  v_existing public.collection_receipts%rowtype;
  v_receipt public.collection_receipts%rowtype;
  v_status text;
  v_totals jsonb;
  v_basis bigint := 0;
  v_confirmed bigint := 0;
  v_key text := nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '');
begin
  if v_uid is null or not public.is_erp_user() then
    raise exception '로그인된 ERP 사용자만 수금을 등록할 수 있습니다.';
  end if;

  if v_company is null then
    raise exception '활성 회사를 확인할 수 없습니다.';
  end if;

  if p_contract_id is null then
    raise exception '계약을 선택해 주세요.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception '수금액은 0원보다 커야 합니다.';
  end if;

  if p_collection_type not in ('deposit', 'interim', 'final', 'other') then
    raise exception '수금 구분이 올바르지 않습니다.';
  end if;

  if p_payment_method not in ('bank_transfer', 'card', 'cash', 'other') then
    raise exception '결제수단이 올바르지 않습니다.';
  end if;

  if v_key is not null then
    select * into v_existing
    from public.collection_receipts
    where company_id = v_company
      and idempotency_key = v_key
      and status <> 'cancelled'
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'receipt_id', v_existing.id,
        'status', v_existing.status,
        'amount', v_existing.amount
      );
    end if;
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
    and company_id = v_company
  for update;

  if not found then
    raise exception '현재 회사의 계약을 찾을 수 없습니다.';
  end if;

  if v_contract.status in ('draft', 'cancelled', 'terminated') then
    raise exception '확정·진행 중인 계약만 수금을 등록할 수 있습니다.';
  end if;

  if not (
    v_role in ('owner', 'director', 'admin')
    or public.can_access_customer(v_contract.customer_id)
  ) then
    raise exception '이 계약의 수금을 등록할 권한이 없습니다.';
  end if;

  if p_schedule_id is not null then
    select * into v_schedule
    from public.collection_schedules
    where id = p_schedule_id
      and company_id = v_company
      and contract_id = v_contract.id
      and status <> 'cancelled';

    if not found then
      raise exception '선택한 수금 예정회차를 찾을 수 없습니다.';
    end if;
  end if;

  if v_role not in ('owner', 'director', 'admin') then
    if v_employee is null then
      raise exception '연결된 직원 정보가 없습니다.';
    end if;
    if p_payment_method not in ('card', 'cash') then
      raise exception '직원은 카드 또는 현금 수금만 직접 등록할 수 있습니다.';
    end if;
    v_status := 'pending';
  else
    v_status := 'confirmed';
  end if;

  if v_status = 'confirmed' then
    v_basis := public.collection_contract_basis_amount(v_contract.id);
    v_confirmed := public.collection_confirmed_total(v_contract.id);
    if v_confirmed + p_amount > v_basis then
      raise exception '확정 수금합계가 계약금액을 초과합니다. 금액을 확인해 주세요.';
    end if;
  end if;

  insert into public.collection_receipts(
    company_id, contract_id, customer_id, project_id, assigned_employee_id,
    collection_type, payment_method, amount, received_at, status, memo,
    reported_by_user_id, reported_by_employee_id, confirmed_by, confirmed_at,
    payer_name, bank_transaction_id, card_approval_no, idempotency_key,
    requested_schedule_id, reconciliation_status, source_type
  ) values (
    v_company, v_contract.id, v_contract.customer_id, v_contract.project_id,
    v_contract.assigned_employee_id,
    p_collection_type, p_payment_method, p_amount, coalesce(p_received_at, now()),
    v_status, nullif(pg_catalog.btrim(coalesce(p_memo, '')), ''),
    v_uid, v_employee,
    case when v_status = 'confirmed' then v_uid else null end,
    case when v_status = 'confirmed' then now() else null end,
    nullif(pg_catalog.btrim(coalesce(p_payer_name, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_bank_transaction_id, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_card_approval_no, '')), ''),
    v_key,
    p_schedule_id,
    'unmatched',
    'erp'
  ) returning * into v_receipt;

  if v_status = 'confirmed' then
    if p_schedule_id is not null then
      perform public.allocate_collection_receipt_v1(
        v_receipt.id,
        p_schedule_id,
        p_amount
      );
    end if;
    v_totals := public.sync_contract_collection_totals(v_contract.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'receipt_id', v_receipt.id,
    'status', v_receipt.status,
    'contract_id', v_contract.id,
    'customer_id', v_contract.customer_id,
    'project_id', v_contract.project_id,
    'amount', v_receipt.amount,
    'requested_schedule_id', p_schedule_id,
    'totals', v_totals
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. 수금 회차 배분 후보
-- -----------------------------------------------------------------------------

create or replace function public.allocate_collection_receipt_v1(
  p_receipt_id uuid,
  p_schedule_id uuid,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_receipt public.collection_receipts%rowtype;
  v_schedule public.collection_schedules%rowtype;
  v_receipt_allocated bigint := 0;
  v_schedule_allocated bigint := 0;
  v_schedule_status text;
begin
  if v_uid is null or not public.is_erp_user() then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception '배분금액은 0원보다 커야 합니다.';
  end if;

  select * into v_receipt
  from public.collection_receipts
  where id = p_receipt_id
    and company_id = v_company
  for update;

  if not found then
    raise exception '수금내역을 찾을 수 없습니다.';
  end if;

  if v_receipt.status <> 'confirmed' then
    raise exception '확정된 수금만 회차에 배분할 수 있습니다.';
  end if;

  if not (
    v_role in ('owner', 'director', 'admin')
    or public.can_access_customer(v_receipt.customer_id)
  ) then
    raise exception '이 수금을 배분할 권한이 없습니다.';
  end if;

  select * into v_schedule
  from public.collection_schedules
  where id = p_schedule_id
    and company_id = v_company
    and status <> 'cancelled'
  for update;

  if not found then
    raise exception '수금 예정회차를 찾을 수 없습니다.';
  end if;

  if v_schedule.contract_id is distinct from v_receipt.contract_id then
    raise exception '같은 계약의 수금과 예정회차만 연결할 수 있습니다.';
  end if;

  select coalesce(sum(allocated_amount), 0)::bigint
    into v_receipt_allocated
  from public.collection_receipt_allocations
  where receipt_id = v_receipt.id;

  if v_receipt_allocated + p_amount > v_receipt.amount then
    raise exception '수금액보다 많이 배분할 수 없습니다.';
  end if;

  select coalesce(sum(a.allocated_amount), 0)::bigint
    into v_schedule_allocated
  from public.collection_receipt_allocations a
  join public.collection_receipts r on r.id = a.receipt_id
  where a.schedule_id = v_schedule.id
    and r.status = 'confirmed';

  insert into public.collection_receipt_allocations(
    company_id, receipt_id, schedule_id, allocated_amount, created_by
  ) values (
    v_company, v_receipt.id, v_schedule.id, p_amount, v_uid
  )
  on conflict (receipt_id, schedule_id)
  do update set allocated_amount = public.collection_receipt_allocations.allocated_amount + excluded.allocated_amount;

  v_schedule_allocated := v_schedule_allocated + p_amount;
  v_schedule_status := case
    when v_schedule_allocated >= v_schedule.planned_amount then 'received'
    when v_schedule_allocated > 0 then 'partial'
    when v_schedule.planned_date < (current_timestamp at time zone 'Asia/Seoul')::date then 'overdue'
    else 'planned'
  end;

  update public.collection_schedules
  set status = v_schedule_status,
      updated_by = v_uid,
      updated_at = now()
  where id = v_schedule.id;

  return jsonb_build_object(
    'ok', true,
    'receipt_id', v_receipt.id,
    'schedule_id', v_schedule.id,
    'allocated_amount', p_amount,
    'schedule_allocated_total', v_schedule_allocated,
    'schedule_status', v_schedule_status
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 5. 확인대기 수금 확정 V2 후보
-- -----------------------------------------------------------------------------

create or replace function public.confirm_collection_receipt_v2(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_receipt public.collection_receipts%rowtype;
  v_basis bigint := 0;
  v_confirmed bigint := 0;
  v_totals jsonb;
begin
  if v_uid is null or public.current_company_role() not in ('owner', 'director', 'admin') then
    raise exception '관리자만 수금을 확인할 수 있습니다.';
  end if;

  select * into v_receipt
  from public.collection_receipts
  where id = p_receipt_id
    and company_id = v_company
  for update;

  if not found then
    raise exception '수금내역을 찾을 수 없습니다.';
  end if;

  if v_receipt.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already_confirmed', true, 'receipt_id', v_receipt.id);
  end if;

  if v_receipt.status <> 'pending' then
    raise exception '확인대기 수금만 확정할 수 있습니다.';
  end if;

  v_basis := public.collection_contract_basis_amount(v_receipt.contract_id);
  v_confirmed := public.collection_confirmed_total(v_receipt.contract_id);

  if v_confirmed + v_receipt.amount > v_basis then
    raise exception '확정 수금합계가 계약금액을 초과합니다.';
  end if;

  update public.collection_receipts
  set status = 'confirmed',
      confirmed_by = v_uid,
      confirmed_at = now(),
      updated_at = now()
  where id = v_receipt.id
  returning * into v_receipt;

  if v_receipt.requested_schedule_id is not null then
    perform public.allocate_collection_receipt_v1(
      v_receipt.id,
      v_receipt.requested_schedule_id,
      v_receipt.amount
    );
  end if;

  v_totals := public.sync_contract_collection_totals(v_receipt.contract_id);

  return jsonb_build_object(
    'ok', true,
    'receipt_id', v_receipt.id,
    'status', v_receipt.status,
    'amount', v_receipt.amount,
    'totals', v_totals
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 6. 계약 기초 수금잔액 저장 후보
-- -----------------------------------------------------------------------------

create or replace function public.save_collection_opening_balance_v1(
  p_contract_id uuid,
  p_as_of_date date,
  p_opening_received_amount bigint,
  p_source_name text,
  p_import_batch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_contract public.contracts%rowtype;
  v_basis bigint := 0;
  v_outstanding bigint := 0;
  v_row public.collection_opening_balances%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner', 'director', 'admin') then
    raise exception '관리자만 기초 수금잔액을 저장할 수 있습니다.';
  end if;

  if p_contract_id is null then
    raise exception '계약을 선택해 주세요.';
  end if;

  if p_opening_received_amount is null or p_opening_received_amount < 0 then
    raise exception '기초 수금액을 확인해 주세요.';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
    and company_id = v_company
  for update;

  if not found then
    raise exception '현재 회사의 계약을 찾을 수 없습니다.';
  end if;

  v_basis := public.collection_contract_basis_amount(v_contract.id);
  if p_opening_received_amount > v_basis then
    raise exception '기초 수금액이 계약금액을 초과합니다.';
  end if;

  v_outstanding := greatest(v_basis - p_opening_received_amount, 0);

  update public.collection_opening_balances
  set is_active = false,
      updated_by = v_uid,
      updated_at = now()
  where company_id = v_company
    and contract_id = v_contract.id
    and is_active;

  insert into public.collection_opening_balances(
    company_id, contract_id, as_of_date,
    opening_received_amount, opening_outstanding_amount,
    source_type, source_name, import_batch_id,
    is_active, created_by, updated_by
  ) values (
    v_company,
    v_contract.id,
    coalesce(p_as_of_date, (current_timestamp at time zone 'Asia/Seoul')::date),
    p_opening_received_amount,
    v_outstanding,
    'opening_balance',
    nullif(pg_catalog.btrim(coalesce(p_source_name, '')), ''),
    p_import_batch_id,
    true,
    v_uid,
    v_uid
  ) returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'opening_balance_id', v_row.id,
    'contract_id', v_contract.id,
    'contract_basis_amount', v_basis,
    'opening_received_amount', v_row.opening_received_amount,
    'opening_outstanding_amount', v_row.opening_outstanding_amount,
    'as_of_date', v_row.as_of_date
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 7. 함수 실행권한 후보
-- -----------------------------------------------------------------------------

revoke all on function public.register_expense_request_v3(
  text, uuid, text, text, text, text, uuid, text, text,
  bigint, bigint, bigint, date, date, text, text, text
) from public, anon;

grant execute on function public.register_expense_request_v3(
  text, uuid, text, text, text, text, uuid, text, text,
  bigint, bigint, bigint, date, date, text, text, text
) to authenticated, service_role;

revoke all on function public.mark_expense_reimbursement_paid_v1(uuid, timestamptz) from public, anon;
grant execute on function public.mark_expense_reimbursement_paid_v1(uuid, timestamptz) to authenticated, service_role;

revoke all on function public.register_collection_receipt_v2(
  uuid, text, text, bigint, timestamptz, uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.register_collection_receipt_v2(
  uuid, text, text, bigint, timestamptz, uuid, text, text, text, text, text
) to authenticated, service_role;

revoke all on function public.allocate_collection_receipt_v1(uuid, uuid, bigint) from public, anon;
grant execute on function public.allocate_collection_receipt_v1(uuid, uuid, bigint) to authenticated, service_role;

revoke all on function public.confirm_collection_receipt_v2(uuid) from public, anon;
grant execute on function public.confirm_collection_receipt_v2(uuid) to authenticated, service_role;

revoke all on function public.save_collection_opening_balance_v1(uuid, date, bigint, text, uuid) from public, anon;
grant execute on function public.save_collection_opening_balance_v1(uuid, date, bigint, text, uuid) to authenticated, service_role;

-- 운영 적용 금지
rollback;
