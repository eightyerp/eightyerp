create or replace function public.collection_contract_basis_amount(p_contract_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce(
      case when c.contract_kind = 'original'
        then coalesce(c.cumulative_contract_amount, c.contract_amount)
        else c.contract_amount
      end,
      0
    ),
    0
  )::bigint
  from public.contracts c
  where c.id = p_contract_id;
$$;
revoke all on function public.collection_contract_basis_amount(uuid) from public, anon, authenticated;

create or replace function public.collection_confirmed_total(p_contract_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(r.amount),0)::bigint
  from public.collection_receipts r
  where r.contract_id = p_contract_id and r.status = 'confirmed';
$$;
revoke all on function public.collection_confirmed_total(uuid) from public, anon, authenticated;

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
  v_basis bigint := 0;
  v_confirmed bigint := 0;
begin
  if v_uid is null or not public.is_erp_user() then raise exception '로그인된 ERP 사용자만 수금을 등록할 수 있습니다.'; end if;
  if v_company is null then raise exception '활성 회사를 확인할 수 없습니다.'; end if;
  if p_contract_id is null then raise exception '계약을 선택해 주세요.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '수금액은 0원보다 커야 합니다.'; end if;
  if p_collection_type not in ('deposit','interim','final','other') then raise exception '수금 구분이 올바르지 않습니다.'; end if;
  if p_payment_method not in ('bank_transfer','card','cash','other') then raise exception '결제수단이 올바르지 않습니다.'; end if;

  select * into v_contract from public.contracts
  where id = p_contract_id and company_id = v_company for update;
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
    reported_by_user_id, reported_by_employee_id, confirmed_by, confirmed_at
  ) values (
    v_company, v_contract.id, v_contract.customer_id, v_contract.project_id, v_contract.assigned_employee_id,
    p_collection_type, p_payment_method, p_amount, coalesce(p_received_at, now()), v_status,
    nullif(pg_catalog.btrim(coalesce(p_memo,'')),''), v_uid, v_employee,
    case when v_status='confirmed' then v_uid else null end,
    case when v_status='confirmed' then now() else null end
  ) returning * into v_receipt;

  if v_status = 'confirmed' then v_totals := public.sync_contract_collection_totals(v_contract.id); end if;

  return jsonb_build_object('ok',true,'receipt_id',v_receipt.id,'status',v_receipt.status,'contract_id',v_contract.id,'customer_id',v_contract.customer_id,'project_id',v_contract.project_id,'assigned_employee_id',v_contract.assigned_employee_id,'reported_by_employee_id',v_employee,'amount',v_receipt.amount,'payment_method',v_receipt.payment_method,'collection_type',v_receipt.collection_type,'totals',v_totals);
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
  v_basis bigint := 0;
  v_confirmed bigint := 0;
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

  v_basis := public.collection_contract_basis_amount(v_receipt.contract_id);
  v_confirmed := public.collection_confirmed_total(v_receipt.contract_id);
  if v_confirmed + v_receipt.amount > v_basis then
    raise exception '확정 수금합계가 계약금액을 초과합니다. 대기 수금 금액을 확인해 주세요.';
  end if;

  update public.collection_receipts
  set status='confirmed', confirmed_by=v_uid, confirmed_at=now(), updated_at=now()
  where id=v_receipt.id returning * into v_receipt;

  v_totals := public.sync_contract_collection_totals(v_receipt.contract_id);
  return jsonb_build_object('ok',true,'receipt_id',v_receipt.id,'status',v_receipt.status,'contract_id',v_receipt.contract_id,'customer_id',v_receipt.customer_id,'assigned_employee_id',v_receipt.assigned_employee_id,'reported_by_employee_id',v_receipt.reported_by_employee_id,'amount',v_receipt.amount,'payment_method',v_receipt.payment_method,'collection_type',v_receipt.collection_type,'totals',v_totals);
end;
$$;

revoke all on function public.register_collection_receipt(uuid,text,text,bigint,timestamptz,text) from public, anon;
revoke all on function public.confirm_collection_receipt(uuid) from public, anon;
grant execute on function public.register_collection_receipt(uuid,text,text,bigint,timestamptz,text) to authenticated;
grant execute on function public.confirm_collection_receipt(uuid) to authenticated;
notify pgrst, 'reload schema';