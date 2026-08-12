-- Eighty ERP collection receipts v1
-- 관리자: 계좌이체/카드/현금 등 직접 등록 시 즉시 확정
-- 직원/매니저: 카드/현금만 확인대기로 등록, 관리자 확인 후 계약 수금합계 반영

create table if not exists public.collection_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  collection_type text not null default 'other' check (collection_type in ('deposit','interim','final','other')),
  payment_method text not null check (payment_method in ('bank_transfer','card','cash','other')),
  amount bigint not null check (amount > 0),
  received_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  memo text,
  reported_by_user_id uuid references auth.users(id) on delete set null,
  reported_by_employee_id uuid references public.employees(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collection_receipts_company_received_idx
  on public.collection_receipts(company_id, received_at desc);
create index if not exists collection_receipts_contract_status_idx
  on public.collection_receipts(contract_id, status, received_at desc);
create index if not exists collection_receipts_pending_idx
  on public.collection_receipts(company_id, status, created_at desc)
  where status = 'pending';
create index if not exists collection_receipts_assignee_idx
  on public.collection_receipts(assigned_employee_id, received_at desc);

alter table public.collection_receipts enable row level security;

drop policy if exists collection_receipts_company_guard on public.collection_receipts;
create policy collection_receipts_company_guard
  on public.collection_receipts
  as restrictive
  for all
  to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

drop policy if exists collection_receipts_select_erp on public.collection_receipts;
create policy collection_receipts_select_erp
  on public.collection_receipts
  for select
  to authenticated
  using (
    public.is_erp_user()
    and (
      public.current_company_role() in ('owner','director','admin')
      or assigned_employee_id = public.current_employee_id()
      or reported_by_employee_id = public.current_employee_id()
      or public.can_access_customer(customer_id)
    )
  );

revoke all on table public.collection_receipts from anon;
revoke insert, update, delete on table public.collection_receipts from authenticated;
grant select on table public.collection_receipts to authenticated;

create or replace function public.sync_contract_collection_totals(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_received bigint := 0;
  v_basis bigint := 0;
begin
  select * into v_contract
  from public.contracts
  where id = p_contract_id
  for update;
  if not found then raise exception '계약을 찾을 수 없습니다.'; end if;

  select coalesce(sum(r.amount), 0)::bigint into v_received
  from public.collection_receipts r
  where r.contract_id = p_contract_id and r.status = 'confirmed';

  v_basis := case
    when v_contract.contract_kind = 'original'
      then coalesce(v_contract.cumulative_contract_amount, v_contract.contract_amount)
    else v_contract.contract_amount
  end;
  v_basis := greatest(coalesce(v_basis, 0), 0);

  update public.contracts c
  set received_amount = v_received,
      outstanding_amount = greatest(v_basis - v_received, 0),
      updated_at = now()
  where c.id = p_contract_id;

  return jsonb_build_object(
    'contract_id', p_contract_id,
    'received_amount', v_received,
    'outstanding_amount', greatest(v_basis - v_received, 0),
    'contract_basis_amount', v_basis
  );
end;
$$;

revoke all on function public.sync_contract_collection_totals(uuid) from public, anon, authenticated;

create or replace function public.register_collection_receipt(
  p_contract_id uuid,
  p_collection_type text,
  p_payment_method text,
  p_amount bigint,
  p_received_at timestamptz default now(),
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_employee uuid := public.current_employee_id();
  v_contract public.contracts%rowtype;
  v_receipt public.collection_receipts%rowtype;
  v_status text;
  v_totals jsonb;
begin
  if v_uid is null or not public.is_erp_user() then raise exception '로그인된 ERP 사용자만 수금을 등록할 수 있습니다.'; end if;
  if v_company is null then raise exception '활성 회사를 확인할 수 없습니다.'; end if;
  if p_contract_id is null then raise exception '계약을 선택해 주세요.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '수금액은 0원보다 커야 합니다.'; end if;
  if p_collection_type not in ('deposit','interim','final','other') then raise exception '수금 구분이 올바르지 않습니다.'; end if;
  if p_payment_method not in ('bank_transfer','card','cash','other') then raise exception '결제수단이 올바르지 않습니다.'; end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id and company_id = v_company
  for update;
  if not found then raise exception '현재 회사의 계약을 찾을 수 없습니다.'; end if;
  if v_contract.status in ('draft','cancelled','terminated') then raise exception '확정·진행 중인 계약만 수금을 등록할 수 있습니다.'; end if;
  if not (v_role in ('owner','director','admin') or public.can_access_customer(v_contract.customer_id)) then raise exception '이 계약의 수금을 등록할 권한이 없습니다.'; end if;

  if v_role not in ('owner','director','admin') then
    if v_employee is null then raise exception '연결된 직원 정보가 없습니다.'; end if;
    if p_payment_method not in ('card','cash') then raise exception '직원은 카드 또는 현금 수금만 등록할 수 있습니다.'; end if;
    v_status := 'pending';
  else
    v_status := 'confirmed';
  end if;

  insert into public.collection_receipts(
    company_id, contract_id, customer_id, project_id, assigned_employee_id,
    collection_type, payment_method, amount, received_at, status, memo,
    reported_by_user_id, reported_by_employee_id, confirmed_by, confirmed_at
  ) values (
    v_company, v_contract.id, v_contract.customer_id, v_contract.project_id, v_contract.assigned_employee_id,
    p_collection_type, p_payment_method, p_amount, coalesce(p_received_at, now()), v_status,
    nullif(pg_catalog.btrim(coalesce(p_memo,'')),''),
    v_uid, v_employee,
    case when v_status='confirmed' then v_uid else null end,
    case when v_status='confirmed' then now() else null end
  ) returning * into v_receipt;

  if v_status = 'confirmed' then v_totals := public.sync_contract_collection_totals(v_contract.id); end if;

  return jsonb_build_object(
    'ok', true, 'receipt_id', v_receipt.id, 'status', v_receipt.status,
    'contract_id', v_contract.id, 'customer_id', v_contract.customer_id,
    'project_id', v_contract.project_id, 'assigned_employee_id', v_contract.assigned_employee_id,
    'reported_by_employee_id', v_employee, 'amount', v_receipt.amount,
    'payment_method', v_receipt.payment_method, 'collection_type', v_receipt.collection_type,
    'totals', v_totals
  );
end;
$$;

create or replace function public.confirm_collection_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_receipt public.collection_receipts%rowtype;
  v_totals jsonb;
begin
  if v_uid is null or not public.is_erp_user() then raise exception '로그인이 필요합니다.'; end if;
  if v_role not in ('owner','director','admin') then raise exception '관리자만 수금을 확인할 수 있습니다.'; end if;

  select * into v_receipt from public.collection_receipts
  where id = p_receipt_id and company_id = v_company for update;
  if not found then raise exception '수금내역을 찾을 수 없습니다.'; end if;
  if v_receipt.status = 'confirmed' then
    v_totals := public.sync_contract_collection_totals(v_receipt.contract_id);
    return jsonb_build_object('ok',true,'already_confirmed',true,'receipt_id',v_receipt.id,'contract_id',v_receipt.contract_id,'customer_id',v_receipt.customer_id,'assigned_employee_id',v_receipt.assigned_employee_id,'reported_by_employee_id',v_receipt.reported_by_employee_id,'amount',v_receipt.amount,'payment_method',v_receipt.payment_method,'collection_type',v_receipt.collection_type,'totals',v_totals);
  end if;
  if v_receipt.status <> 'pending' then raise exception '확인대기 수금만 확정할 수 있습니다.'; end if;

  update public.collection_receipts
  set status='confirmed', confirmed_by=v_uid, confirmed_at=now(), updated_at=now()
  where id=v_receipt.id returning * into v_receipt;

  v_totals := public.sync_contract_collection_totals(v_receipt.contract_id);
  return jsonb_build_object('ok',true,'receipt_id',v_receipt.id,'status',v_receipt.status,'contract_id',v_receipt.contract_id,'customer_id',v_receipt.customer_id,'assigned_employee_id',v_receipt.assigned_employee_id,'reported_by_employee_id',v_receipt.reported_by_employee_id,'amount',v_receipt.amount,'payment_method',v_receipt.payment_method,'collection_type',v_receipt.collection_type,'totals',v_totals);
end;
$$;

create or replace function public.cancel_collection_receipt(p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_receipt public.collection_receipts%rowtype;
  v_was_confirmed boolean := false;
  v_totals jsonb;
begin
  if v_uid is null or not public.is_erp_user() then raise exception '로그인이 필요합니다.'; end if;
  if v_role not in ('owner','director','admin') then raise exception '관리자만 수금을 취소할 수 있습니다.'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason,'')),'') is null then raise exception '취소 사유를 입력해 주세요.'; end if;

  select * into v_receipt from public.collection_receipts where id=p_receipt_id and company_id=v_company for update;
  if not found then raise exception '수금내역을 찾을 수 없습니다.'; end if;
  if v_receipt.status='cancelled' then return jsonb_build_object('ok',true,'already_cancelled',true,'receipt_id',v_receipt.id); end if;
  v_was_confirmed := v_receipt.status='confirmed';

  update public.collection_receipts
  set status='cancelled', cancelled_by=v_uid, cancelled_at=now(), cancel_reason=pg_catalog.btrim(p_reason), updated_at=now()
  where id=v_receipt.id returning * into v_receipt;

  if v_was_confirmed then v_totals := public.sync_contract_collection_totals(v_receipt.contract_id); end if;
  return jsonb_build_object('ok',true,'receipt_id',v_receipt.id,'contract_id',v_receipt.contract_id,'was_confirmed',v_was_confirmed,'totals',v_totals);
end;
$$;

revoke all on function public.register_collection_receipt(uuid,text,text,bigint,timestamptz,text) from public, anon;
revoke all on function public.confirm_collection_receipt(uuid) from public, anon;
revoke all on function public.cancel_collection_receipt(uuid,text) from public, anon;
grant execute on function public.register_collection_receipt(uuid,text,text,bigint,timestamptz,text) to authenticated;
grant execute on function public.confirm_collection_receipt(uuid) to authenticated;
grant execute on function public.cancel_collection_receipt(uuid,text) to authenticated;

alter table public.notification_events drop constraint if exists notification_events_event_type_check;
alter table public.notification_events
  add constraint notification_events_event_type_check check (event_type in (
    'material_approval_request','material_approved','material_change_request','material_reapproval_request','material_all_approved',
    'external_inquiry_registered','customer_assigned','collection_reported','collection_confirmed'
  ));

notify pgrst, 'reload schema';