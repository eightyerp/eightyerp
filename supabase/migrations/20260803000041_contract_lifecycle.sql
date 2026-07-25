-- =============================================================================
-- Eighty ERP — 계약 변경·추가·해지 라이프사이클
-- 파일: 20260803000041_contract_lifecycle.sql
--
-- 적용 대상: Supabase SQL Editor에 이 파일 전체 1회 붙여넣기
-- 전제: Migration 38·39 이미 적용됨
--
-- 안전:
--   - Migration 38·39 파일/객체 본문 미수정
--   - 기존 계약·견적·품목 금액 백필 UPDATE/DELETE/TRUNCATE 없음
--   - DROP TABLE / DROP COLUMN 없음
--   - additive: 컬럼·테이블·함수·정책 추가 및 CHECK 확장만
--   - 레거시 status active/cancelled 유지 (앱에서 confirmed/terminated 로 매핑)
--   - 재실행: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS 위주
-- =============================================================================

alter table public.contracts alter column quote_id drop not null;
alter table public.contracts drop constraint if exists contracts_quote_id_key;
drop index if exists public.contracts_quote_id_key;
create unique index if not exists contracts_quote_id_not_null_uidx
  on public.contracts (quote_id) where quote_id is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'contracts_status_check'
      and conrelid = 'public.contracts'::regclass
  ) then
    alter table public.contracts drop constraint contracts_status_check;
  end if;
  alter table public.contracts add constraint contracts_status_check check (
    status in (
      'active', 'cancelled',
      'draft', 'confirmed', 'amending', 'adding', 'terminated', 'completed'
    )
  );
end;
$$;

alter table public.contracts
  add column if not exists root_contract_id uuid references public.contracts(id),
  add column if not exists parent_contract_id uuid references public.contracts(id),
  add column if not exists contract_kind text not null default 'original'
    check (contract_kind in ('original', 'amendment', 'addition')),
  add column if not exists revision_seq integer not null default 0 check (revision_seq >= 0),
  add column if not exists title text,
  add column if not exists scope_summary text,
  add column if not exists work_start_date date,
  add column if not exists work_end_date date,
  add column if not exists change_reason text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists previous_contract_amount bigint,
  add column if not exists delta_amount bigint,
  add column if not exists cumulative_contract_amount bigint,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_reason text,
  add column if not exists termination_fault text check (termination_fault in ('customer', 'company', 'mutual', 'other')),
  add column if not exists penalty_amount bigint not null default 0 check (penalty_amount >= 0),
  add column if not exists received_amount bigint not null default 0 check (received_amount >= 0),
  add column if not exists progress_amount bigint not null default 0 check (progress_amount >= 0),
  add column if not exists refund_amount bigint not null default 0 check (refund_amount >= 0),
  add column if not exists outstanding_amount bigint not null default 0 check (outstanding_amount >= 0),
  add column if not exists termination_memo text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id) on delete set null,
  add column if not exists restore_reason text,
  add column if not exists items_snapshot jsonb;

create index if not exists contracts_root_contract_id_idx on public.contracts(root_contract_id);
create index if not exists contracts_parent_contract_id_idx on public.contracts(parent_contract_id);

alter table public.execution_budgets
  add column if not exists halted_at timestamptz,
  add column if not exists halt_reason text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'execution_budgets_status_check'
      and conrelid = 'public.execution_budgets'::regclass
  ) then
    alter table public.execution_budgets drop constraint execution_budgets_status_check;
  end if;
  alter table public.execution_budgets add constraint execution_budgets_status_check
    check (status in ('draft', 'confirmed', 'halted'));
end;
$$;

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  root_contract_id uuid references public.contracts(id) on delete set null,
  event_type text not null check (event_type in (
    'created', 'updated', 'confirmed', 'amendment_created', 'amendment_confirmed',
    'addition_created', 'addition_confirmed', 'terminated', 'restored', 'budget_sync_skipped'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists contract_events_contract_created_idx on public.contract_events(contract_id, created_at desc);
create index if not exists contract_events_root_created_idx on public.contract_events(root_contract_id, created_at desc);

alter table public.contract_events enable row level security;
drop policy if exists contract_events_select_erp on public.contract_events;
create policy contract_events_select_erp on public.contract_events for select to authenticated using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and exists (
    select 1 from public.contracts c
    where c.id = contract_id
      and (public.is_admin() or public.can_access_customer(c.customer_id))
  )
);
drop policy if exists contract_events_company_guard on public.contract_events;
create policy contract_events_company_guard on public.contract_events as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

-- Validates an integer-won JSON field without trusting browser arithmetic.
create or replace function public.contract_lifecycle_amount(
  p_payload jsonb, p_key text, p_default bigint
) returns bigint language plpgsql immutable set search_path = public as $$
declare v_text text; v_amount bigint;
begin
  if not (p_payload ? p_key) then return coalesce(p_default, 0); end if;
  v_text := btrim(coalesce(p_payload ->> p_key, ''));
  if v_text !~ '^[0-9]+$' then
    raise exception '%은(는) 0 이상 정수(원)여야 합니다.', p_key;
  end if;
  v_amount := v_text::bigint;
  return v_amount;
end;
$$;

create or replace function public.confirm_contract(p_contract_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_company uuid; v_contract public.contracts%rowtype; v_before jsonb;
begin
  if v_user is null or not public.is_erp_user() then raise exception '권한이 없습니다.'; end if;
  v_company := public.current_company_id();
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found or v_contract.company_id is distinct from v_company then raise exception '계약을 찾을 수 없습니다.'; end if;
  if not (public.is_admin() or public.can_access_customer(v_contract.customer_id)) then raise exception '계약을 찾을 수 없습니다.'; end if;
  if v_contract.status = 'confirmed' then return jsonb_build_object('ok', true, 'contract_id', v_contract.id, 'already_confirmed', true); end if;
  if v_contract.status <> 'draft' then raise exception '초안 계약만 확정할 수 있습니다.'; end if;
  v_before := to_jsonb(v_contract);
  update public.contracts set status = 'confirmed', confirmed_at = now(), confirmed_by = v_user, updated_by = v_user, updated_at = now()
    where id = v_contract.id returning * into v_contract;
  insert into public.contract_events(company_id, contract_id, root_contract_id, event_type, actor_id, before_data, after_data)
    values (v_company, v_contract.id, coalesce(v_contract.root_contract_id, v_contract.id), 'confirmed', v_user, v_before, to_jsonb(v_contract));
  return jsonb_build_object('ok', true, 'contract_id', v_contract.id);
end;
$$;

create or replace function public.update_contract_draft(p_contract_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_company uuid; v_contract public.contracts%rowtype; v_before jsonb;
  v_supply bigint; v_vat bigint; v_discount bigint; v_amount bigint; v_title text;
begin
  if v_user is null or not public.is_erp_user() then raise exception '권한이 없습니다.'; end if;
  v_company := public.current_company_id();
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found or v_contract.company_id is distinct from v_company or not (public.is_admin() or public.can_access_customer(v_contract.customer_id)) then raise exception '계약을 찾을 수 없습니다.'; end if;
  if v_contract.status <> 'draft' then raise exception '초안 계약만 수정할 수 있습니다.'; end if;
  v_supply := public.contract_lifecycle_amount(p_payload, 'supply_amount', v_contract.supply_amount);
  v_vat := public.contract_lifecycle_amount(p_payload, 'vat_amount', v_contract.vat_amount);
  v_discount := public.contract_lifecycle_amount(p_payload, 'discount_amount', v_contract.discount_amount);
  v_amount := public.contract_lifecycle_amount(p_payload, 'contract_amount', v_supply - v_discount + v_vat);
  if v_supply < v_discount or v_amount <> v_supply - v_discount + v_vat then raise exception '계약금액은 공급가 - 할인 + 부가세와 일치해야 합니다.'; end if;
  v_title := nullif(btrim(coalesce(p_payload ->> 'title', v_contract.title, '')), '');
  v_before := to_jsonb(v_contract);
  update public.contracts set title = v_title, scope_summary = nullif(btrim(coalesce(p_payload ->> 'scope_summary', v_contract.scope_summary, '')), ''),
    work_start_date = coalesce(nullif(p_payload ->> 'work_start_date','')::date, v_contract.work_start_date),
    work_end_date = coalesce(nullif(p_payload ->> 'work_end_date','')::date, v_contract.work_end_date),
    change_reason = nullif(btrim(coalesce(p_payload ->> 'change_reason', v_contract.change_reason, '')), ''),
    supply_amount = v_supply, vat_amount = v_vat, discount_amount = v_discount, contract_amount = v_amount,
    items_snapshot = coalesce(p_payload -> 'items_snapshot', v_contract.items_snapshot), updated_by = v_user, updated_at = now()
    where id = v_contract.id returning * into v_contract;
  insert into public.contract_events(company_id, contract_id, root_contract_id, event_type, actor_id, reason, before_data, after_data)
    values (v_company, v_contract.id, coalesce(v_contract.root_contract_id,v_contract.id), 'updated', v_user, v_contract.change_reason, v_before, to_jsonb(v_contract));
  return jsonb_build_object('ok', true, 'contract_id', v_contract.id);
end;
$$;

create or replace function public.create_contract_lifecycle_child(p_root_contract_id uuid, p_payload jsonb, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_company uuid; v_root public.contracts%rowtype; v_child public.contracts%rowtype;
  v_seq integer; v_supply bigint; v_vat bigint; v_discount bigint; v_amount bigint; v_event text;
begin
  if v_user is null or not public.is_erp_user() then raise exception '권한이 없습니다.'; end if;
  if p_kind not in ('amendment','addition') then raise exception '계약 유형이 올바르지 않습니다.'; end if;
  v_company := public.current_company_id();
  select * into v_root from public.contracts where id = p_root_contract_id for update;
  if not found or v_root.company_id is distinct from v_company or not (public.is_admin() or public.can_access_customer(v_root.customer_id)) then raise exception '계약을 찾을 수 없습니다.'; end if;
  if v_root.contract_kind <> 'original' or v_root.status not in ('confirmed','active','amending','adding') then raise exception '확정된 원계약만 변경 또는 추가할 수 있습니다.'; end if;
  v_supply := public.contract_lifecycle_amount(p_payload, 'supply_amount', v_root.supply_amount);
  v_vat := public.contract_lifecycle_amount(p_payload, 'vat_amount', v_root.vat_amount);
  v_discount := public.contract_lifecycle_amount(p_payload, 'discount_amount', v_root.discount_amount);
  v_amount := public.contract_lifecycle_amount(p_payload, 'contract_amount', v_supply - v_discount + v_vat);
  if v_supply < v_discount or v_amount <> v_supply - v_discount + v_vat then raise exception '계약금액은 공급가 - 할인 + 부가세와 일치해야 합니다.'; end if;
  select coalesce(max(revision_seq), 0) + 1 into v_seq from public.contracts where root_contract_id = v_root.id and contract_kind = p_kind;
  -- amendment: payload 금액 = 변경 후 총액 / addition: payload 금액 = 추가분 금액
  insert into public.contracts(company_id, customer_id, quote_id, project_id, contract_number, contract_date, status, supply_amount, vat_amount, discount_amount, contract_amount, assigned_employee_id, created_by, updated_by, root_contract_id, parent_contract_id, contract_kind, revision_seq, title, scope_summary, work_start_date, work_end_date, change_reason, previous_contract_amount, delta_amount, cumulative_contract_amount, items_snapshot)
  values (
    v_company, v_root.customer_id, null, v_root.project_id, null,
    (current_timestamp at time zone 'Asia/Seoul')::date, 'draft',
    v_supply, v_vat, v_discount, v_amount,
    v_root.assigned_employee_id, v_user, v_user,
    v_root.id, v_root.id, p_kind, v_seq,
    nullif(btrim(coalesce(p_payload->>'title', v_root.title, '')), ''),
    nullif(btrim(coalesce(p_payload->>'scope_summary', v_root.scope_summary, '')), ''),
    coalesce(nullif(p_payload->>'work_start_date','')::date, v_root.work_start_date),
    coalesce(nullif(p_payload->>'work_end_date','')::date, v_root.work_end_date),
    nullif(btrim(coalesce(p_payload->>'change_reason','')), ''),
    coalesce(v_root.cumulative_contract_amount, v_root.contract_amount),
    case
      when p_kind = 'addition' then v_amount
      else v_amount - coalesce(v_root.cumulative_contract_amount, v_root.contract_amount)
    end,
    case
      when p_kind = 'addition'
        then coalesce(v_root.cumulative_contract_amount, v_root.contract_amount) + v_amount
      else v_amount
    end,
    coalesce(p_payload->'items_snapshot', v_root.items_snapshot)
  )
  returning * into v_child;
  update public.contracts set status = case when p_kind = 'amendment' then 'amending' else 'adding' end, updated_by = v_user, updated_at = now() where id = v_root.id;
  v_event := case when p_kind = 'amendment' then 'amendment_created' else 'addition_created' end;
  insert into public.contract_events(company_id,contract_id,root_contract_id,event_type,actor_id,reason,after_data)
    values(v_company,v_child.id,v_root.id,v_event,v_user,v_child.change_reason,to_jsonb(v_child));
  return jsonb_build_object('ok',true,'contract_id',v_child.id,'root_contract_id',v_root.id);
end;
$$;

create or replace function public.create_contract_amendment(p_root_contract_id uuid, p_payload jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.create_contract_lifecycle_child(p_root_contract_id, p_payload, 'amendment');
$$;
create or replace function public.create_contract_addition(p_root_contract_id uuid, p_payload jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.create_contract_lifecycle_child(p_root_contract_id, p_payload, 'addition');
$$;

create or replace function public.confirm_contract_lifecycle_child(p_child_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_company uuid; v_child public.contracts%rowtype; v_root public.contracts%rowtype; v_before jsonb; v_event text;
begin
  if v_user is null or not public.is_erp_user() then raise exception '권한이 없습니다.'; end if;
  v_company := public.current_company_id();
  select * into v_child from public.contracts where id=p_child_id for update;
  if not found or v_child.company_id is distinct from v_company or v_child.contract_kind <> p_kind or not (public.is_admin() or public.can_access_customer(v_child.customer_id)) then raise exception '계약을 찾을 수 없습니다.'; end if;
  if v_child.status = 'confirmed' then return jsonb_build_object('ok',true,'contract_id',v_child.id,'already_confirmed',true); end if;
  if v_child.status <> 'draft' then raise exception '초안 계약만 확정할 수 있습니다.'; end if;
  select * into v_root from public.contracts where id=v_child.root_contract_id for update;
  if not found then raise exception '원계약을 찾을 수 없습니다.'; end if;
  v_before := to_jsonb(v_child);
  update public.contracts
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = v_user,
      updated_by = v_user,
      updated_at = now()
  where id = v_child.id
  returning * into v_child;
  -- 원계약 누적금액 갱신 (변경=새 총액, 추가=누적+추가분)
  update public.contracts
  set status = 'confirmed',
      cumulative_contract_amount = coalesce(v_child.cumulative_contract_amount, v_child.contract_amount),
      -- 변경계약 확정 시 원계약 표시 금액도 새 총액으로 맞춤 (원본 quote 스냅샷은 별도 보존)
      contract_amount = case
        when p_kind = 'amendment' then v_child.contract_amount
        else contract_amount
      end,
      updated_by = v_user,
      updated_at = now()
  where id = v_root.id;
  v_event := case when p_kind='amendment' then 'amendment_confirmed' else 'addition_confirmed' end;
  insert into public.contract_events(company_id,contract_id,root_contract_id,event_type,actor_id,reason,before_data,after_data) values(v_company,v_child.id,v_root.id,v_event,v_user,v_child.change_reason,v_before,to_jsonb(v_child));
  insert into public.contract_events(company_id,contract_id,root_contract_id,event_type,actor_id,reason) values(v_company,v_child.id,v_root.id,'budget_sync_skipped',v_user,'결제 테이블이 없어 실행예산/수금 동기화를 수행하지 않았습니다.');
  return jsonb_build_object('ok',true,'contract_id',v_child.id,'root_contract_id',v_root.id);
end;
$$;
create or replace function public.confirm_contract_amendment(p_amendment_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public.confirm_contract_lifecycle_child(p_amendment_id,'amendment'); $$;
create or replace function public.confirm_contract_addition(p_addition_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public.confirm_contract_lifecycle_child(p_addition_id,'addition'); $$;

create or replace function public.terminate_contract(p_contract_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); v_company uuid; v_contract public.contracts%rowtype; v_before jsonb; v_reason text;
begin
  if v_user is null or not public.is_erp_user() then raise exception '권한이 없습니다.'; end if;
  v_company := public.current_company_id(); v_reason := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  if v_reason is null then raise exception '해지 사유를 입력해 주세요.'; end if;
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if not found or v_contract.company_id is distinct from v_company or not (public.is_admin() or public.can_access_customer(v_contract.customer_id)) then raise exception '계약을 찾을 수 없습니다.'; end if;
  if v_contract.status in ('terminated','cancelled') then return jsonb_build_object('ok',true,'contract_id',v_contract.id,'already_terminated',true); end if;
  v_before := to_jsonb(v_contract);
  update public.contracts set status='terminated', terminated_at=now(), termination_reason=v_reason, termination_fault=nullif(p_payload->>'fault',''), penalty_amount=public.contract_lifecycle_amount(p_payload,'penalty_amount',0), received_amount=public.contract_lifecycle_amount(p_payload,'received_amount',0), progress_amount=public.contract_lifecycle_amount(p_payload,'progress_amount',0), refund_amount=public.contract_lifecycle_amount(p_payload,'refund_amount',0), outstanding_amount=public.contract_lifecycle_amount(p_payload,'outstanding_amount',0), termination_memo=nullif(btrim(coalesce(p_payload->>'memo','')),''), updated_by=v_user, updated_at=now() where id=v_contract.id returning * into v_contract;
  update public.execution_budgets set status='halted', halted_at=now(), halt_reason=v_reason, updated_by=v_user, updated_at=now() where contract_id=v_contract.id;
  insert into public.contract_events(company_id,contract_id,root_contract_id,event_type,actor_id,reason,before_data,after_data) values(v_company,v_contract.id,coalesce(v_contract.root_contract_id,v_contract.id),'terminated',v_user,v_reason,v_before,to_jsonb(v_contract));
  return jsonb_build_object('ok',true,'contract_id',v_contract.id);
end;
$$;

create or replace function public.restore_terminated_contract(p_contract_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); v_company uuid; v_contract public.contracts%rowtype; v_before jsonb; v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_user is null or not public.is_erp_user() or not public.is_admin() then raise exception '관리자만 계약을 복구할 수 있습니다.'; end if;
  if v_reason is null then raise exception '복구 사유를 입력해 주세요.'; end if;
  v_company := public.current_company_id(); select * into v_contract from public.contracts where id=p_contract_id for update;
  if not found or v_contract.company_id is distinct from v_company or not (public.is_admin() or public.can_access_customer(v_contract.customer_id)) then raise exception '계약을 찾을 수 없습니다.'; end if;
  if v_contract.status = 'confirmed' then return jsonb_build_object('ok',true,'contract_id',v_contract.id,'already_restored',true); end if;
  if v_contract.status not in ('terminated','cancelled') then raise exception '해지된 계약만 복구할 수 있습니다.'; end if;
  v_before := to_jsonb(v_contract);
  update public.contracts set status='confirmed', restored_at=now(), restored_by=v_user, restore_reason=v_reason, updated_by=v_user, updated_at=now() where id=v_contract.id returning * into v_contract;
  update public.execution_budgets set status='confirmed', halted_at=null, halt_reason=null, updated_by=v_user, updated_at=now() where contract_id=v_contract.id and status='halted';
  insert into public.contract_events(company_id,contract_id,root_contract_id,event_type,actor_id,reason,before_data,after_data) values(v_company,v_contract.id,coalesce(v_contract.root_contract_id,v_contract.id),'restored',v_user,v_reason,v_before,to_jsonb(v_contract));
  return jsonb_build_object('ok',true,'contract_id',v_contract.id);
end;
$$;

revoke all on function public.contract_lifecycle_amount(jsonb,text,bigint) from public;
revoke all on function public.contract_lifecycle_amount(jsonb,text,bigint) from anon;
revoke all on function public.create_contract_lifecycle_child(uuid,jsonb,text) from public;
revoke all on function public.create_contract_lifecycle_child(uuid,jsonb,text) from anon;
revoke all on function public.confirm_contract_lifecycle_child(uuid,text) from public;
revoke all on function public.confirm_contract_lifecycle_child(uuid,text) from anon;
revoke all on function public.confirm_contract(uuid) from public;
revoke all on function public.confirm_contract(uuid) from anon;
grant execute on function public.confirm_contract(uuid) to authenticated;
revoke all on function public.update_contract_draft(uuid,jsonb) from public;
revoke all on function public.update_contract_draft(uuid,jsonb) from anon;
grant execute on function public.update_contract_draft(uuid,jsonb) to authenticated;
revoke all on function public.create_contract_amendment(uuid,jsonb) from public;
revoke all on function public.create_contract_amendment(uuid,jsonb) from anon;
grant execute on function public.create_contract_amendment(uuid,jsonb) to authenticated;
revoke all on function public.confirm_contract_amendment(uuid) from public;
revoke all on function public.confirm_contract_amendment(uuid) from anon;
grant execute on function public.confirm_contract_amendment(uuid) to authenticated;
revoke all on function public.create_contract_addition(uuid,jsonb) from public;
revoke all on function public.create_contract_addition(uuid,jsonb) from anon;
grant execute on function public.create_contract_addition(uuid,jsonb) to authenticated;
revoke all on function public.confirm_contract_addition(uuid) from public;
revoke all on function public.confirm_contract_addition(uuid) from anon;
grant execute on function public.confirm_contract_addition(uuid) to authenticated;
revoke all on function public.terminate_contract(uuid,jsonb) from public;
revoke all on function public.terminate_contract(uuid,jsonb) from anon;
grant execute on function public.terminate_contract(uuid,jsonb) to authenticated;
revoke all on function public.restore_terminated_contract(uuid,text) from public;
revoke all on function public.restore_terminated_contract(uuid,text) from anon;
grant execute on function public.restore_terminated_contract(uuid,text) to authenticated;

do $$
begin
  if to_regclass('public.contracts') is null
     or to_regclass('public.contract_events') is null
     or to_regprocedure('public.confirm_contract(uuid)') is null
     or to_regprocedure('public.update_contract_draft(uuid,jsonb)') is null
     or to_regprocedure('public.create_contract_amendment(uuid,jsonb)') is null
     or to_regprocedure('public.create_contract_addition(uuid,jsonb)') is null
     or to_regprocedure('public.confirm_contract_amendment(uuid)') is null
     or to_regprocedure('public.confirm_contract_addition(uuid)') is null
     or to_regprocedure('public.terminate_contract(uuid,jsonb)') is null
     or to_regprocedure('public.restore_terminated_contract(uuid,text)') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'contracts'
         and column_name = 'contract_kind'
     )
     or not exists (
       select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'contracts_quote_id_not_null_uidx'
     ) then
    raise exception 'Contract lifecycle migration verify failed';
  end if;
end;
$$;
