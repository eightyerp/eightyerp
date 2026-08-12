create table if not exists public.employee_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  settlement_year smallint not null check (settlement_year >= 2026),
  settlement_month smallint not null check (settlement_month between 1 and 12),
  source_type text not null default 'erp' check (source_type in ('legacy_2026','erp')),
  status text not null default 'draft' check (status in ('draft','confirmed','paid','cancelled')),
  payout_date date,
  revenue_amount bigint not null default 0 check (revenue_amount >= 0),
  cost_amount bigint not null default 0 check (cost_amount >= 0),
  margin_amount bigint not null default 0,
  base_settlement_amount bigint not null default 0,
  additional_incentive_amount bigint not null default 0 check (additional_incentive_amount >= 0),
  deduction_amount bigint not null default 0 check (deduction_amount >= 0),
  final_payable_amount bigint not null default 0,
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  memo text,
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlement_batches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  project_name_snapshot text,
  line_type text not null check (line_type in (
    'legacy_project','project_settlement','contract_incentive','additional_incentive',
    'post_settlement_adjustment','advance_deduction','manual_adjustment'
  )),
  description text not null,
  revenue_amount bigint not null default 0 check (revenue_amount >= 0),
  cost_amount bigint not null default 0 check (cost_amount >= 0),
  margin_amount bigint not null default 0,
  base_settlement_amount bigint not null default 0,
  adjustment_amount bigint not null default 0,
  line_payable_amount bigint not null default 0,
  source_adjustment_id uuid references public.settlement_adjustments(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_settlement_batches_company_employee_period_idx
  on public.employee_settlement_batches(company_id, employee_id, settlement_year, settlement_month, status);
create index if not exists employee_settlement_batches_payout_date_idx
  on public.employee_settlement_batches(company_id, payout_date desc);
create index if not exists employee_settlement_lines_settlement_idx
  on public.employee_settlement_lines(settlement_id, created_at);
create index if not exists employee_settlement_lines_employee_idx
  on public.employee_settlement_lines(company_id, employee_id, created_at desc);
create unique index if not exists employee_settlement_lines_source_adjustment_uidx
  on public.employee_settlement_lines(source_adjustment_id)
  where source_adjustment_id is not null;

alter table public.employee_settlement_batches enable row level security;
alter table public.employee_settlement_lines enable row level security;

revoke all on public.employee_settlement_batches from anon;
revoke all on public.employee_settlement_lines from anon;
revoke insert, update, delete on public.employee_settlement_batches from authenticated;
revoke insert, update, delete on public.employee_settlement_lines from authenticated;
grant select on public.employee_settlement_batches to authenticated;
grant select on public.employee_settlement_lines to authenticated;

drop policy if exists employee_settlement_batches_select_private on public.employee_settlement_batches;
create policy employee_settlement_batches_select_private
on public.employee_settlement_batches
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.current_company_role() in ('owner','director','admin')
    or employee_id = public.current_employee_id()
  )
);

drop policy if exists employee_settlement_lines_select_private on public.employee_settlement_lines;
create policy employee_settlement_lines_select_private
on public.employee_settlement_lines
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.current_company_role() in ('owner','director','admin')
    or employee_id = public.current_employee_id()
  )
);

create or replace function public.recalculate_employee_settlement_batch(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company uuid;
  v_revenue bigint;
  v_cost bigint;
  v_margin bigint;
  v_base bigint;
  v_additional bigint;
  v_deduction bigint;
  v_final bigint;
begin
  select company_id into v_company
  from public.employee_settlement_batches
  where id = p_settlement_id;
  if v_company is null then return; end if;

  select
    coalesce(sum(revenue_amount),0),
    coalesce(sum(cost_amount),0),
    coalesce(sum(margin_amount),0),
    coalesce(sum(base_settlement_amount),0),
    coalesce(sum(case when line_type in ('contract_incentive','additional_incentive') and adjustment_amount > 0 then adjustment_amount else 0 end),0),
    coalesce(sum(case when adjustment_amount < 0 then -adjustment_amount else 0 end),0),
    coalesce(sum(line_payable_amount),0)
  into v_revenue,v_cost,v_margin,v_base,v_additional,v_deduction,v_final
  from public.employee_settlement_lines
  where settlement_id = p_settlement_id and company_id = v_company;

  update public.employee_settlement_batches
     set revenue_amount = v_revenue,
         cost_amount = v_cost,
         margin_amount = v_margin,
         base_settlement_amount = v_base,
         additional_incentive_amount = v_additional,
         deduction_amount = v_deduction,
         final_payable_amount = v_final,
         updated_at = now()
   where id = p_settlement_id;
end;
$function$;

revoke all on function public.recalculate_employee_settlement_batch(uuid) from public, anon, authenticated;

create or replace function public.employee_settlement_lines_recalc_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_employee_settlement_batch(old.settlement_id);
    return old;
  end if;
  perform public.recalculate_employee_settlement_batch(new.settlement_id);
  if tg_op = 'UPDATE' and old.settlement_id <> new.settlement_id then
    perform public.recalculate_employee_settlement_batch(old.settlement_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.employee_settlement_lines_recalc_trigger() from public, anon, authenticated;

drop trigger if exists employee_settlement_lines_recalc on public.employee_settlement_lines;
create trigger employee_settlement_lines_recalc
after insert or update or delete on public.employee_settlement_lines
for each row execute function public.employee_settlement_lines_recalc_trigger();

create or replace function public.import_legacy_2026_settlement(
  p_employee_id uuid,
  p_payout_date date,
  p_project_id uuid,
  p_project_name text,
  p_revenue_amount bigint,
  p_cost_amount bigint,
  p_base_settlement_amount bigint,
  p_additional_incentive_amount bigint,
  p_deduction_amount bigint,
  p_actual_paid_amount bigint,
  p_memo text
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
  v_employee public.employees%rowtype;
  v_project public.projects%rowtype;
  v_batch public.employee_settlement_batches%rowtype;
  v_margin bigint;
  v_expected bigint;
begin
  if v_uid is null or not public.is_erp_user() or v_company is null then raise exception '권한이 없습니다.'; end if;
  if v_role not in ('owner','director','admin') then raise exception '관리자만 기존 정산자료를 이관할 수 있습니다.'; end if;
  if p_payout_date < date '2026-01-01' or p_payout_date >= date '2027-01-01' then raise exception '2026년에 실제 지급된 정산만 이관할 수 있습니다.'; end if;
  if coalesce(p_revenue_amount,0) < 0 or coalesce(p_cost_amount,0) < 0 or coalesce(p_base_settlement_amount,0) < 0 or coalesce(p_additional_incentive_amount,0) < 0 or coalesce(p_deduction_amount,0) < 0 or coalesce(p_actual_paid_amount,0) < 0 then raise exception '금액을 확인해 주세요.'; end if;

  select * into v_employee from public.employees where id = p_employee_id and company_id = v_company and merged_into_employee_id is null;
  if not found then raise exception '직원 정보를 찾을 수 없습니다.'; end if;

  if p_project_id is not null then
    select * into v_project from public.projects where id = p_project_id and company_id = v_company and deleted_at is null;
    if not found then raise exception '현장 정보를 찾을 수 없습니다.'; end if;
  end if;

  v_margin := coalesce(p_revenue_amount,0) - coalesce(p_cost_amount,0);
  v_expected := coalesce(p_base_settlement_amount,0) + coalesce(p_additional_incentive_amount,0) - coalesce(p_deduction_amount,0);
  if v_expected <> p_actual_paid_amount then raise exception '기본정산 + 추가인센 - 차감 = 실제지급액이 되도록 입력해 주세요.'; end if;

  insert into public.employee_settlement_batches(
    company_id, employee_id, settlement_year, settlement_month, source_type, status,
    payout_date, paid_amount, memo, created_by, confirmed_by, confirmed_at, paid_by, paid_at
  ) values (
    v_company, p_employee_id, 2026, extract(month from p_payout_date)::smallint, 'legacy_2026', 'paid',
    p_payout_date, p_actual_paid_amount, nullif(btrim(coalesce(p_memo,'')),''), v_uid, v_uid, now(), v_uid, now()
  ) returning * into v_batch;

  insert into public.employee_settlement_lines(
    settlement_id, company_id, employee_id, project_id, project_name_snapshot, line_type, description,
    revenue_amount, cost_amount, margin_amount, base_settlement_amount, adjustment_amount, line_payable_amount, created_by
  ) values (
    v_batch.id, v_company, p_employee_id, p_project_id,
    coalesce(v_project.name, nullif(btrim(coalesce(p_project_name,'')),''), '기존 정산'),
    'legacy_project', '2026 기존 정산 이관',
    coalesce(p_revenue_amount,0), coalesce(p_cost_amount,0), v_margin,
    coalesce(p_base_settlement_amount,0), 0, coalesce(p_base_settlement_amount,0), v_uid
  );

  if coalesce(p_additional_incentive_amount,0) > 0 then
    insert into public.employee_settlement_lines(
      settlement_id, company_id, employee_id, project_id, project_name_snapshot, line_type, description,
      adjustment_amount, line_payable_amount, created_by
    ) values (
      v_batch.id, v_company, p_employee_id, p_project_id,
      coalesce(v_project.name, nullif(btrim(coalesce(p_project_name,'')),''), '기존 정산'),
      'additional_incentive', '추가 인센티브', p_additional_incentive_amount, p_additional_incentive_amount, v_uid
    );
  end if;

  if coalesce(p_deduction_amount,0) > 0 then
    insert into public.employee_settlement_lines(
      settlement_id, company_id, employee_id, project_id, project_name_snapshot, line_type, description,
      adjustment_amount, line_payable_amount, created_by
    ) values (
      v_batch.id, v_company, p_employee_id, p_project_id,
      coalesce(v_project.name, nullif(btrim(coalesce(p_project_name,'')),''), '기존 정산'),
      'manual_adjustment', '기존 정산 차감', -p_deduction_amount, -p_deduction_amount, v_uid
    );
  end if;

  perform public.recalculate_employee_settlement_batch(v_batch.id);

  return jsonb_build_object('settlement_id', v_batch.id, 'employee_id', p_employee_id, 'payout_date', p_payout_date, 'actual_paid_amount', p_actual_paid_amount);
end;
$function$;

revoke all on function public.import_legacy_2026_settlement(uuid,date,uuid,text,bigint,bigint,bigint,bigint,bigint,bigint,text) from public, anon;
grant execute on function public.import_legacy_2026_settlement(uuid,date,uuid,text,bigint,bigint,bigint,bigint,bigint,bigint,text) to authenticated;

create or replace view public.employee_settlement_summary_2026
with (security_invoker = true)
as
select
  b.id, b.company_id, b.employee_id, b.settlement_year, b.settlement_month,
  b.source_type, b.status, b.payout_date, b.revenue_amount, b.cost_amount,
  b.margin_amount, b.base_settlement_amount, b.additional_incentive_amount,
  b.deduction_amount, b.final_payable_amount, b.paid_amount, b.memo,
  b.created_at, b.updated_at
from public.employee_settlement_batches b
where b.settlement_year = 2026;

grant select on public.employee_settlement_summary_2026 to authenticated;
revoke all on public.employee_settlement_summary_2026 from anon;
