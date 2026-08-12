-- Eighty ERP — 정산완료 현장 사후지출 / 다음 정산 조정 기반

create table if not exists public.project_finance_states (
  project_id uuid primary key references public.projects(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  customer_id uuid not null references public.customers(id),
  settlement_status text not null default 'open' check (settlement_status in ('open','settled')),
  settled_at timestamptz,
  settled_by uuid references auth.users(id) on delete set null,
  settled_snapshot jsonb not null default '{}'::jsonb,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_finance_states_company_status_idx
  on public.project_finance_states(company_id, settlement_status, updated_at desc);

insert into public.project_finance_states(project_id, company_id, customer_id)
select p.id, coalesce(p.company_id, c.company_id), p.customer_id
from public.projects p
join public.customers c on c.id = p.customer_id
where p.deleted_at is null
  and coalesce(p.company_id, c.company_id) is not null
on conflict (project_id) do nothing;

alter table public.project_finance_states enable row level security;
revoke all on public.project_finance_states from anon, authenticated;
grant select on public.project_finance_states to authenticated;

drop policy if exists project_finance_states_select_erp on public.project_finance_states;
create policy project_finance_states_select_erp on public.project_finance_states
for select to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.current_company_role() in ('owner','director','admin')
    or public.can_access_customer(customer_id)
  )
);

create or replace function public.ensure_project_finance_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_company uuid;
begin
  if new.deleted_at is not null then return new; end if;
  select coalesce(new.company_id, c.company_id)
    into v_company
  from public.customers c
  where c.id = new.customer_id;
  if v_company is null then return new; end if;
  insert into public.project_finance_states(project_id, company_id, customer_id)
  values(new.id, v_company, new.customer_id)
  on conflict (project_id) do update
    set company_id = excluded.company_id,
        customer_id = excluded.customer_id,
        updated_at = now();
  return new;
end;
$$;
revoke all on function public.ensure_project_finance_state() from public, anon, authenticated;

drop trigger if exists projects_ensure_finance_state on public.projects;
create trigger projects_ensure_finance_state
after insert or update of company_id, customer_id, deleted_at on public.projects
for each row execute function public.ensure_project_finance_state();

create or replace function public.set_project_settlement_status(
  p_project_id uuid,
  p_status text,
  p_snapshot jsonb default '{}'::jsonb,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_state public.project_finance_states%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then
    raise exception '관리자만 현장 정산상태를 변경할 수 있습니다.';
  end if;
  if p_status not in ('open','settled') then raise exception '정산상태가 올바르지 않습니다.'; end if;

  select * into v_state
  from public.project_finance_states
  where project_id = p_project_id and company_id = v_company
  for update;
  if not found then raise exception '현장 재무상태를 찾을 수 없습니다.'; end if;

  if p_status = 'settled' then
    update public.project_finance_states
       set settlement_status='settled', settled_at=now(), settled_by=v_uid,
           settled_snapshot=coalesce(p_snapshot,'{}'::jsonb),
           reopened_at=null, reopened_by=null, reopen_reason=null, updated_at=now()
     where project_id=p_project_id returning * into v_state;
  else
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception '정산 재오픈 사유를 입력해 주세요.'; end if;
    update public.project_finance_states
       set settlement_status='open', reopened_at=now(), reopened_by=v_uid,
           reopen_reason=btrim(p_reason), updated_at=now()
     where project_id=p_project_id returning * into v_state;
  end if;

  return jsonb_build_object('project_id',v_state.project_id,'settlement_status',v_state.settlement_status,'settled_at',v_state.settled_at,'reopened_at',v_state.reopened_at);
end;
$$;
revoke all on function public.set_project_settlement_status(uuid,text,jsonb,text) from public, anon;
grant execute on function public.set_project_settlement_status(uuid,text,jsonb,text) to authenticated;

alter table public.expense_requests
  add column if not exists is_post_settlement boolean not null default false,
  add column if not exists post_settlement_reason text,
  add column if not exists post_settlement_treatment text,
  add column if not exists adjustment_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists settlement_adjustment_amount bigint not null default 0,
  add column if not exists recovery_expected_amount bigint not null default 0,
  add column if not exists post_settlement_note text;

alter table public.expense_requests drop constraint if exists expense_requests_post_settlement_reason_check;
alter table public.expense_requests add constraint expense_requests_post_settlement_reason_check
check (post_settlement_reason is null or post_settlement_reason in ('as_repair','omitted_invoice','additional_material','additional_labor','late_vendor_invoice','other'));

alter table public.expense_requests drop constraint if exists expense_requests_post_settlement_treatment_check;
alter table public.expense_requests add constraint expense_requests_post_settlement_treatment_check
check (post_settlement_treatment is null or post_settlement_treatment in ('company_absorb','next_settlement_deduction','vendor_recovery','customer_rebill','other'));

alter table public.expense_requests drop constraint if exists expense_requests_settlement_adjustment_amount_check;
alter table public.expense_requests add constraint expense_requests_settlement_adjustment_amount_check
check (settlement_adjustment_amount >= 0 and settlement_adjustment_amount <= total_amount);

alter table public.expense_requests drop constraint if exists expense_requests_recovery_expected_amount_check;
alter table public.expense_requests add constraint expense_requests_recovery_expected_amount_check
check (recovery_expected_amount >= 0 and recovery_expected_amount <= total_amount);

create index if not exists expense_requests_post_settlement_idx
  on public.expense_requests(company_id, is_post_settlement, status, created_at desc);

create or replace function public.expense_auto_post_settlement_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_status text;
begin
  select settlement_status into v_status
  from public.project_finance_states
  where project_id = new.project_id and company_id = new.company_id;
  new.is_post_settlement := coalesce(v_status = 'settled', false);
  if not new.is_post_settlement then
    new.post_settlement_reason := null;
    new.post_settlement_treatment := null;
    new.adjustment_employee_id := null;
    new.settlement_adjustment_amount := 0;
    new.recovery_expected_amount := 0;
    new.post_settlement_note := null;
  end if;
  return new;
end;
$$;
revoke all on function public.expense_auto_post_settlement_flag() from public, anon, authenticated;

drop trigger if exists expense_requests_auto_post_settlement on public.expense_requests;
create trigger expense_requests_auto_post_settlement
before insert or update of project_id on public.expense_requests
for each row execute function public.expense_auto_post_settlement_flag();

create or replace function public.set_expense_post_settlement_resolution(
  p_expense_id uuid,
  p_reason text,
  p_treatment text,
  p_adjustment_employee_id uuid default null,
  p_adjustment_amount bigint default 0,
  p_recovery_expected_amount bigint default 0,
  p_note text default null
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
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then raise exception '관리자만 사후지출 처리방법을 지정할 수 있습니다.'; end if;
  if p_reason not in ('as_repair','omitted_invoice','additional_material','additional_labor','late_vendor_invoice','other') then raise exception '사후지출 사유가 올바르지 않습니다.'; end if;
  if p_treatment not in ('company_absorb','next_settlement_deduction','vendor_recovery','customer_rebill','other') then raise exception '사후지출 처리방법이 올바르지 않습니다.'; end if;
  if coalesce(p_adjustment_amount,0) < 0 or coalesce(p_recovery_expected_amount,0) < 0 then raise exception '조정금액은 0 이상이어야 합니다.'; end if;

  select * into v_row from public.expense_requests
  where id=p_expense_id and company_id=v_company and status='pending' for update;
  if not found then raise exception '처리할 지출요청을 찾을 수 없습니다.'; end if;
  if not v_row.is_post_settlement then raise exception '정산완료 현장의 사후지출이 아닙니다.'; end if;
  if coalesce(p_adjustment_amount,0) > v_row.total_amount or coalesce(p_recovery_expected_amount,0) > v_row.total_amount then raise exception '조정금액은 지출금액을 초과할 수 없습니다.'; end if;
  if p_treatment='next_settlement_deduction' and (p_adjustment_employee_id is null or coalesce(p_adjustment_amount,0) <= 0) then raise exception '다음 정산 차감은 대상 직원과 차감액이 필요합니다.'; end if;
  if p_treatment in ('vendor_recovery','customer_rebill') and coalesce(p_recovery_expected_amount,0) <= 0 then raise exception '회수 또는 추가청구 예정금액을 입력해 주세요.'; end if;

  update public.expense_requests
     set post_settlement_reason=p_reason,
         post_settlement_treatment=p_treatment,
         adjustment_employee_id=case when p_treatment='next_settlement_deduction' then p_adjustment_employee_id else null end,
         settlement_adjustment_amount=case when p_treatment='next_settlement_deduction' then p_adjustment_amount else 0 end,
         recovery_expected_amount=case when p_treatment in ('vendor_recovery','customer_rebill') then p_recovery_expected_amount else 0 end,
         post_settlement_note=nullif(btrim(coalesce(p_note,'')),''), updated_at=now()
   where id=p_expense_id returning * into v_row;

  return jsonb_build_object('expense_id',v_row.id,'post_settlement_treatment',v_row.post_settlement_treatment,'adjustment_employee_id',v_row.adjustment_employee_id,'settlement_adjustment_amount',v_row.settlement_adjustment_amount,'recovery_expected_amount',v_row.recovery_expected_amount);
end;
$$;
revoke all on function public.set_expense_post_settlement_resolution(uuid,text,text,uuid,bigint,bigint,text) from public, anon;
grant execute on function public.set_expense_post_settlement_resolution(uuid,text,text,uuid,bigint,bigint,text) to authenticated;

create or replace function public.expense_require_post_settlement_resolution()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status='pending' and new.status='approved' and new.is_post_settlement then
    if new.post_settlement_reason is null or new.post_settlement_treatment is null then raise exception '정산완료 현장의 사후지출은 사유와 처리방법을 먼저 지정해야 합니다.'; end if;
    if new.post_settlement_treatment='next_settlement_deduction' and (new.adjustment_employee_id is null or new.settlement_adjustment_amount <= 0) then raise exception '다음 정산 차감 대상 직원과 차감액이 필요합니다.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.expense_require_post_settlement_resolution() from public, anon, authenticated;

drop trigger if exists expense_requests_require_post_settlement_resolution on public.expense_requests;
create trigger expense_requests_require_post_settlement_resolution
before update of status on public.expense_requests
for each row execute function public.expense_require_post_settlement_resolution();

create table if not exists public.settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  source_project_id uuid not null references public.projects(id),
  source_expense_request_id uuid not null unique references public.expense_requests(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  adjustment_amount bigint not null check (adjustment_amount > 0),
  applied_amount bigint not null default 0 check (applied_amount >= 0),
  remaining_amount bigint not null check (remaining_amount >= 0),
  status text not null default 'pending' check (status in ('pending','partially_applied','applied','cancelled')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (applied_amount + remaining_amount = adjustment_amount)
);

create index if not exists settlement_adjustments_employee_status_idx
  on public.settlement_adjustments(company_id, employee_id, status, created_at desc);

alter table public.settlement_adjustments enable row level security;
revoke all on public.settlement_adjustments from anon, authenticated;
grant select on public.settlement_adjustments to authenticated;

drop policy if exists settlement_adjustments_select_erp on public.settlement_adjustments;
create policy settlement_adjustments_select_erp on public.settlement_adjustments
for select to authenticated
using (
  public.is_erp_user() and company_id = (select public.current_company_id())
  and (public.current_company_role() in ('owner','director','admin') or employee_id = public.current_employee_id())
);

create or replace function public.expense_create_settlement_adjustment_on_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status='approved' and new.status='paid'
     and new.is_post_settlement and new.post_settlement_treatment='next_settlement_deduction'
     and new.adjustment_employee_id is not null and new.settlement_adjustment_amount > 0 then
    insert into public.settlement_adjustments(
      company_id, source_project_id, source_expense_request_id, employee_id,
      adjustment_amount, applied_amount, remaining_amount, status, reason, created_by
    ) values (
      new.company_id, new.project_id, new.id, new.adjustment_employee_id,
      new.settlement_adjustment_amount, 0, new.settlement_adjustment_amount, 'pending',
      coalesce(new.post_settlement_note, new.description), new.paid_by
    ) on conflict (source_expense_request_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.expense_create_settlement_adjustment_on_paid() from public, anon, authenticated;

drop trigger if exists expense_requests_create_settlement_adjustment on public.expense_requests;
create trigger expense_requests_create_settlement_adjustment
after update of status on public.expense_requests
for each row execute function public.expense_create_settlement_adjustment_on_paid();

create or replace view public.project_expense_summary with (security_invoker = true) as
select
  e.company_id, e.project_id, e.customer_id,
  coalesce(sum(e.total_amount) filter (where e.status='pending'),0)::bigint as pending_amount,
  coalesce(sum(e.total_amount) filter (where e.status='approved'),0)::bigint as approved_unpaid_amount,
  coalesce(sum(e.total_amount) filter (where e.status='paid'),0)::bigint as actual_paid_expense_amount,
  coalesce(sum(e.total_amount) filter (where e.status='paid' and e.is_post_settlement),0)::bigint as post_settlement_paid_amount,
  coalesce(sum(e.recovery_expected_amount) filter (where e.status in ('approved','paid') and e.is_post_settlement),0)::bigint as recovery_expected_amount,
  count(*) filter (where e.is_post_settlement and e.status <> 'cancelled')::int as post_settlement_expense_count
from public.expense_requests e
group by e.company_id,e.project_id,e.customer_id;

revoke all on public.project_expense_summary from anon, authenticated;
grant select on public.project_expense_summary to authenticated;

notify pgrst, 'reload schema';