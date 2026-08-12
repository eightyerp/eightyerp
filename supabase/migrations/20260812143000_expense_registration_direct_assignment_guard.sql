-- Eighty ERP — 직원 지출등록은 본인 담당 고객 현장으로 제한
-- 관리자(owner/director/admin)는 전체 현장 등록 가능

create or replace function public.register_expense_request_v2(
  p_expense_scope text,
  p_project_id uuid,
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
  p_memo text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  v_status text;
begin
  if v_uid is null or not public.is_erp_user() or v_company is null then
    raise exception '권한이 없습니다.';
  end if;
  if p_expense_scope not in ('project','operating') then
    raise exception '지출 구분이 올바르지 않습니다.';
  end if;
  if p_work_trade not in ('windows','demolition','carpentry','electrical_lighting','plumbing','tile','bathroom','film','wallpaper','flooring','painting','furniture','kitchen','aircon','doors','glass_metal','lifting_freight','cleaning','site_common','other') then
    raise exception '공종이 올바르지 않습니다.';
  end if;
  if p_category not in ('materials','subcontract','labor','demolition','lifting','freight','site','advertising','sga','misc') then
    raise exception '지출 분류가 올바르지 않습니다.';
  end if;
  if p_payment_method not in ('bank_transfer','company_card','personal_card','cash','other') then
    raise exception '결제수단이 올바르지 않습니다.';
  end if;
  if p_supply_amount < 0 or p_vat_amount < 0 or p_total_amount <= 0 or p_total_amount <> p_supply_amount + p_vat_amount then
    raise exception '공급가·부가세·합계 금액을 확인해 주세요.';
  end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then
    raise exception '지출 내용을 입력해 주세요.';
  end if;
  if v_role not in ('owner','director','admin') and v_employee is null then
    raise exception '연결된 직원 정보가 없습니다.';
  end if;

  if p_expense_scope='project' then
    select * into v_project
    from public.projects
    where id=p_project_id and company_id=v_company and deleted_at is null;
    if not found then raise exception '현장을 찾을 수 없습니다.'; end if;

    select c.assigned_employee_id
      into v_customer_assigned_employee
    from public.customers c
    where c.id=v_project.customer_id
      and c.company_id=v_company
      and c.deleted_at is null;

    if v_role not in ('owner','director','admin')
       and v_customer_assigned_employee is distinct from v_employee then
      raise exception '본인 담당 고객의 현장에만 지출요청을 등록할 수 있습니다.';
    end if;

    v_customer := v_project.customer_id;
    select id into v_contract
    from public.contracts
    where company_id=v_company
      and project_id=v_project.id
      and contract_kind='original'
      and status not in ('draft','cancelled','terminated')
    order by contract_date desc, created_at desc
    limit 1;
  else
    if p_project_id is not null then
      raise exception '운영비는 현장을 지정할 수 없습니다.';
    end if;
    v_customer := null;
    v_contract := null;
  end if;

  if p_vendor_id is not null then
    select * into v_vendor
    from public.vendors
    where id=p_vendor_id and company_id=v_company and review_status <> 'inactive';
    if not found then raise exception '거래처를 찾을 수 없습니다.'; end if;
  end if;

  v_status := case when v_role in ('owner','director','admin') then 'approved' else 'pending' end;

  insert into public.expense_requests(
    company_id,expense_scope,project_id,customer_id,contract_id,work_trade,category,vendor_id,vendor_name_snapshot,
    description,supply_amount,vat_amount,total_amount,expense_date,payment_due_date,payment_method,status,
    requested_by_user_id,requested_by_employee_id,approved_by,approved_at,memo
  ) values(
    v_company,p_expense_scope,case when p_expense_scope='project' then p_project_id else null end,v_customer,v_contract,p_work_trade,p_category,p_vendor_id,
    coalesce(v_vendor.name,nullif(btrim(coalesce(p_vendor_name,'')),'')),btrim(p_description),p_supply_amount,p_vat_amount,p_total_amount,
    coalesce(p_expense_date,(current_timestamp at time zone 'Asia/Seoul')::date),p_payment_due_date,p_payment_method,v_status,v_uid,v_employee,
    case when v_status='approved' then v_uid else null end,case when v_status='approved' then now() else null end,nullif(btrim(coalesce(p_memo,'')),''))
  returning * into v_row;

  return jsonb_build_object(
    'expense_id',v_row.id,
    'status',v_row.status,
    'project_id',v_row.project_id,
    'customer_id',v_row.customer_id,
    'requester_employee_id',v_row.requested_by_employee_id,
    'amount',v_row.total_amount,
    'work_trade',v_row.work_trade
  );
end;
$$;

revoke all on function public.register_expense_request_v2(text,uuid,text,text,uuid,text,text,bigint,bigint,bigint,date,date,text,text) from public, anon;
grant execute on function public.register_expense_request_v2(text,uuid,text,text,uuid,text,text,bigint,bigint,bigint,date,date,text,text) to authenticated;
