-- Eighty ERP — 직원 친화 지출등록 v2 / 공종별 손익 기반

alter table public.expense_requests
  add column if not exists work_trade text not null default 'other';

alter table public.expense_requests drop constraint if exists expense_requests_work_trade_check;
alter table public.expense_requests add constraint expense_requests_work_trade_check
check (work_trade in (
  'windows','demolition','carpentry','electrical_lighting','plumbing','tile','bathroom','film','wallpaper','flooring','painting','furniture','kitchen','aircon','doors','glass_metal','lifting_freight','cleaning','site_common','other'
));

alter table public.vendors
  add column if not exists default_work_trade text,
  add column if not exists default_expense_category text;

alter table public.vendors drop constraint if exists vendors_default_work_trade_check;
alter table public.vendors add constraint vendors_default_work_trade_check
check (default_work_trade is null or default_work_trade in (
  'windows','demolition','carpentry','electrical_lighting','plumbing','tile','bathroom','film','wallpaper','flooring','painting','furniture','kitchen','aircon','doors','glass_metal','lifting_freight','cleaning','site_common','other'
));

alter table public.vendors drop constraint if exists vendors_default_expense_category_check;
alter table public.vendors add constraint vendors_default_expense_category_check
check (default_expense_category is null or default_expense_category in ('materials','subcontract','labor','site','misc'));

update public.expense_requests
set work_trade = case
  when category='demolition' then 'demolition'
  when category in ('lifting','freight') then 'lifting_freight'
  when category='site' then 'site_common'
  else coalesce(work_trade,'other')
end
where work_trade='other';

create index if not exists expense_requests_project_trade_status_idx
  on public.expense_requests(company_id, project_id, work_trade, status, created_at desc);

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
  v_contract uuid;
  v_vendor public.vendors%rowtype;
  v_row public.expense_requests%rowtype;
  v_status text;
begin
  if v_uid is null or not public.is_erp_user() or v_company is null then raise exception '권한이 없습니다.'; end if;
  if p_expense_scope not in ('project','operating') then raise exception '지출 구분이 올바르지 않습니다.'; end if;
  if p_work_trade not in ('windows','demolition','carpentry','electrical_lighting','plumbing','tile','bathroom','film','wallpaper','flooring','painting','furniture','kitchen','aircon','doors','glass_metal','lifting_freight','cleaning','site_common','other') then raise exception '공종이 올바르지 않습니다.'; end if;
  if p_category not in ('materials','subcontract','labor','demolition','lifting','freight','site','advertising','sga','misc') then raise exception '지출 분류가 올바르지 않습니다.'; end if;
  if p_payment_method not in ('bank_transfer','company_card','personal_card','cash','other') then raise exception '결제수단이 올바르지 않습니다.'; end if;
  if p_supply_amount < 0 or p_vat_amount < 0 or p_total_amount <= 0 or p_total_amount <> p_supply_amount + p_vat_amount then raise exception '공급가·부가세·합계 금액을 확인해 주세요.'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception '지출 내용을 입력해 주세요.'; end if;
  if v_role not in ('owner','director','admin') and v_employee is null then raise exception '연결된 직원 정보가 없습니다.'; end if;

  if p_expense_scope='project' then
    select * into v_project from public.projects where id=p_project_id and company_id=v_company and deleted_at is null;
    if not found then raise exception '현장을 찾을 수 없습니다.'; end if;
    if v_role not in ('owner','director','admin') and not public.can_access_customer(v_project.customer_id) then raise exception '해당 현장에 지출요청을 등록할 권한이 없습니다.'; end if;
    v_customer := v_project.customer_id;
    select id into v_contract from public.contracts where company_id=v_company and project_id=v_project.id and contract_kind='original' and status not in ('draft','cancelled','terminated') order by contract_date desc, created_at desc limit 1;
  else
    if p_project_id is not null then raise exception '운영비는 현장을 지정할 수 없습니다.'; end if;
    v_customer := null; v_contract := null;
  end if;

  if p_vendor_id is not null then
    select * into v_vendor from public.vendors where id=p_vendor_id and company_id=v_company and review_status <> 'inactive';
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
    'expense_id',v_row.id,'status',v_row.status,'project_id',v_row.project_id,'customer_id',v_row.customer_id,
    'requester_employee_id',v_row.requested_by_employee_id,'amount',v_row.total_amount,'work_trade',v_row.work_trade
  );
end;
$$;

revoke all on function public.register_expense_request_v2(text,uuid,text,text,uuid,text,text,bigint,bigint,bigint,date,date,text,text) from public, anon;
grant execute on function public.register_expense_request_v2(text,uuid,text,text,uuid,text,text,bigint,bigint,bigint,date,date,text,text) to authenticated;

create or replace view public.project_trade_expense_summary with (security_invoker = true) as
select
  e.company_id,
  e.project_id,
  e.customer_id,
  e.work_trade,
  coalesce(sum(e.cost_basis_amount) filter (where e.status='paid'),0)::bigint as actual_cost_amount,
  coalesce(sum(e.total_amount) filter (where e.status='paid'),0)::bigint as actual_cash_amount,
  coalesce(sum(e.vat_credit_amount) filter (where e.status='paid'),0)::bigint as vat_credit_amount,
  coalesce(sum(e.cost_basis_amount) filter (where e.status='approved'),0)::bigint as approved_unpaid_cost_amount,
  count(*) filter (where e.status not in ('cancelled','rejected'))::int as expense_count
from public.expense_requests e
group by e.company_id,e.project_id,e.customer_id,e.work_trade;

revoke all on public.project_trade_expense_summary from anon, authenticated;
grant select on public.project_trade_expense_summary to authenticated;

notify pgrst, 'reload schema';
