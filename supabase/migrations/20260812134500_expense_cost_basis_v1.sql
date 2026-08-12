-- Eighty ERP — 지출 현장손익 기준 / 세무증빙 구분
-- 내부 정책:
-- 1) 인건비: 입력 공급가 그대로 현장비용
-- 2) 세금계산서 / 지출증빙용 현금영수증: 공급가만 현장비용, VAT 별도
-- 3) 증빙 미확인/기타: 총액을 임시 현장비용으로 반영

alter table public.expense_requests
  add column if not exists tax_evidence_type text not null default 'unverified',
  add column if not exists cost_basis_amount bigint not null default 0,
  add column if not exists vat_credit_amount bigint not null default 0,
  add column if not exists tax_evidence_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists tax_evidence_updated_at timestamptz;

alter table public.expense_requests drop constraint if exists expense_requests_tax_evidence_type_check;
alter table public.expense_requests add constraint expense_requests_tax_evidence_type_check
check (tax_evidence_type in ('unverified','tax_invoice','cash_receipt','card_receipt','none','other'));

alter table public.expense_requests drop constraint if exists expense_requests_cost_basis_amount_check;
alter table public.expense_requests add constraint expense_requests_cost_basis_amount_check
check (cost_basis_amount >= 0 and cost_basis_amount <= total_amount);

alter table public.expense_requests drop constraint if exists expense_requests_vat_credit_amount_check;
alter table public.expense_requests add constraint expense_requests_vat_credit_amount_check
check (vat_credit_amount >= 0 and vat_credit_amount <= vat_amount);

create or replace function public.expense_calculate_cost_basis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category = 'labor' then
    new.cost_basis_amount := greatest(coalesce(new.supply_amount,0),0);
    new.vat_credit_amount := 0;
  elsif new.tax_evidence_type in ('tax_invoice','cash_receipt') then
    new.cost_basis_amount := greatest(coalesce(new.supply_amount,0),0);
    new.vat_credit_amount := greatest(coalesce(new.vat_amount,0),0);
  else
    new.cost_basis_amount := greatest(coalesce(new.total_amount,0),0);
    new.vat_credit_amount := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.expense_calculate_cost_basis() from public, anon, authenticated;

drop trigger if exists expense_requests_calculate_cost_basis on public.expense_requests;
create trigger expense_requests_calculate_cost_basis
before insert or update of category, supply_amount, vat_amount, total_amount, tax_evidence_type
on public.expense_requests
for each row execute function public.expense_calculate_cost_basis();

update public.expense_requests
set tax_evidence_type = coalesce(tax_evidence_type,'unverified'),
    updated_at = now();

create or replace function public.set_expense_tax_evidence(
  p_expense_id uuid,
  p_tax_evidence_type text,
  p_supply_amount bigint,
  p_vat_amount bigint,
  p_total_amount bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_row public.expense_requests%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then
    raise exception '관리자만 세무증빙 기준을 변경할 수 있습니다.';
  end if;
  if p_tax_evidence_type not in ('unverified','tax_invoice','cash_receipt','card_receipt','none','other') then
    raise exception '세무증빙 유형이 올바르지 않습니다.';
  end if;
  if coalesce(p_supply_amount,0) < 0 or coalesce(p_vat_amount,0) < 0 or coalesce(p_total_amount,0) <= 0 then
    raise exception '금액을 확인해 주세요.';
  end if;
  if coalesce(p_supply_amount,0) + coalesce(p_vat_amount,0) <> p_total_amount then
    raise exception '공급가 + 부가세 = 합계가 되도록 입력해 주세요.';
  end if;

  select * into v_row
  from public.expense_requests
  where id = p_expense_id and company_id = v_company
    and status not in ('cancelled','rejected')
  for update;
  if not found then raise exception '수정할 지출을 찾을 수 없습니다.'; end if;

  update public.expense_requests
     set tax_evidence_type = p_tax_evidence_type,
         supply_amount = p_supply_amount,
         vat_amount = p_vat_amount,
         total_amount = p_total_amount,
         tax_evidence_updated_by = v_uid,
         tax_evidence_updated_at = now(),
         updated_at = now()
   where id = p_expense_id
   returning * into v_row;

  return jsonb_build_object(
    'expense_id', v_row.id,
    'tax_evidence_type', v_row.tax_evidence_type,
    'supply_amount', v_row.supply_amount,
    'vat_amount', v_row.vat_amount,
    'total_amount', v_row.total_amount,
    'cost_basis_amount', v_row.cost_basis_amount,
    'vat_credit_amount', v_row.vat_credit_amount
  );
end;
$$;

revoke all on function public.set_expense_tax_evidence(uuid,text,bigint,bigint,bigint) from public, anon;
grant execute on function public.set_expense_tax_evidence(uuid,text,bigint,bigint,bigint) to authenticated;

create or replace view public.project_expense_summary with (security_invoker = true) as
select
  e.company_id,
  e.project_id,
  e.customer_id,
  coalesce(sum(e.cost_basis_amount) filter (where e.status='pending'),0)::bigint as pending_amount,
  coalesce(sum(e.cost_basis_amount) filter (where e.status='approved'),0)::bigint as approved_unpaid_amount,
  coalesce(sum(e.cost_basis_amount) filter (where e.status='paid'),0)::bigint as actual_paid_expense_amount,
  coalesce(sum(e.cost_basis_amount) filter (where e.status='paid' and e.is_post_settlement),0)::bigint as post_settlement_paid_amount,
  coalesce(sum(e.recovery_expected_amount) filter (where e.status in ('approved','paid') and e.is_post_settlement),0)::bigint as recovery_expected_amount,
  count(*) filter (where e.is_post_settlement and e.status <> 'cancelled')::int as post_settlement_expense_count,
  coalesce(sum(e.total_amount) filter (where e.status='paid'),0)::bigint as actual_paid_cash_amount,
  coalesce(sum(e.vat_credit_amount) filter (where e.status in ('approved','paid')),0)::bigint as vat_credit_amount
from public.expense_requests e
group by e.company_id,e.project_id,e.customer_id;

revoke all on public.project_expense_summary from anon, authenticated;
grant select on public.project_expense_summary to authenticated;

notify pgrst, 'reload schema';
