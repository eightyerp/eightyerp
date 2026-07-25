-- =============================================================================
-- Eighty ERP — Bundle 1: 확정 견적 → 계약·현장 → 실행예산 draft
-- 파일: 20260803000038_quote_contract_project_budget_transition.sql
--
-- 포함:
--   - contracts / execution_budgets / execution_budget_items
--   - 원자적 RPC: transition_quote_to_contract(...)
--   - 전환 완료 견적·품목 잠금 trigger (contracts.quote_id 존재 기준)
--   - RLS (admin=회사 전체, staff=can_access_customer)
--
-- 전환 가능 견적 status (기존 값만 사용, 신규 상태 문자열 추가 없음):
--   - 허용: '승인', '계약전환'
--   - 거부: '작성중'(draft), '검토중', '발송완료', '수정요청', '만료', '취소'
--   근거: ErpQuoteStatus / ERP_QUOTE_STATUSES 에 '확정' 없음.
--         '승인'이 승인 확정에 가장 가깝고, '계약전환'은 setContractQuote 로
--         이미 계약 견적으로 표시된 건을 contracts 레코드로 승격하기 위해 허용.
--
-- 전환 완료 기준: public.contracts.quote_id 존재 (is_contract_quote 단독 아님)
-- 레거시 is_contract_quote=true 이고 contracts 없는 행: 백필·자동잠금·데이터 변경 없음
--
-- 안전:
--   - 기존 행 UPDATE/DELETE/TRUNCATE/백필 없음
--   - DROP TABLE / DROP COLUMN 없음
--   - CREATE IF NOT EXISTS / OR REPLACE / DROP POLICY|TRIGGER IF EXISTS
--   - SECURITY DEFINER + set search_path = public
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) 전제 테이블
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quotes') is null
     or to_regclass('public.quote_items') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.projects') is null then
    raise exception
      'Bundle 1 requires quotes, quote_items, customers, projects tables';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) contracts
-- ---------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  customer_id uuid not null references public.customers (id),
  quote_id uuid not null references public.quotes (id),
  project_id uuid not null references public.projects (id),
  contract_number text not null,
  contract_date date not null default ((current_timestamp at time zone 'Asia/Seoul')::date),
  status text not null default 'active'
    check (status in ('active', 'cancelled')),
  supply_amount bigint not null default 0 check (supply_amount >= 0),
  vat_amount bigint not null default 0 check (vat_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  contract_amount bigint not null default 0 check (contract_amount >= 0),
  assigned_employee_id uuid references public.employees (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_quote_id_key unique (quote_id)
);

create unique index if not exists contracts_company_number_uidx
  on public.contracts (company_id, contract_number);

create index if not exists contracts_company_id_idx
  on public.contracts (company_id);

create index if not exists contracts_customer_id_idx
  on public.contracts (customer_id);

create index if not exists contracts_project_id_idx
  on public.contracts (project_id);

comment on table public.contracts is
  'Bundle 1: 견적 전환 계약. quote_id UNIQUE — 견적당 최초 계약 1회.';
comment on column public.contracts.contract_amount is
  '전환 시점 고객 최종금액 스냅샷 (customer_total_amount 우선, 없으면 final_amount)';

-- ---------------------------------------------------------------------------
-- 2) execution_budgets / items
-- ---------------------------------------------------------------------------
create table if not exists public.execution_budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  contract_id uuid not null references public.contracts (id),
  project_id uuid not null references public.projects (id),
  customer_id uuid not null references public.customers (id),
  status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  -- null = 모든 라인 원가 미입력. 0 = 입력된 라인 합이 0.
  estimated_total_cost bigint null check (estimated_total_cost is null or estimated_total_cost >= 0),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint execution_budgets_contract_id_key unique (contract_id)
);

create index if not exists execution_budgets_company_id_idx
  on public.execution_budgets (company_id);

create index if not exists execution_budgets_project_id_idx
  on public.execution_budgets (project_id);

create index if not exists execution_budgets_customer_id_idx
  on public.execution_budgets (customer_id);

comment on table public.execution_budgets is
  'Bundle 1: 계약당 최초 실행예산 헤더 1개 (unique contract_id).';
comment on column public.execution_budgets.estimated_total_cost is
  '원가 미입력 라인은 합산에서 제외. 전부 미입력이면 null (0과 구분).';

create table if not exists public.execution_budget_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  execution_budget_id uuid not null
    references public.execution_budgets (id) on delete cascade,
  source_quote_item_id uuid references public.quote_items (id) on delete set null,
  trade_name text not null,
  item_name text,
  description text,
  quantity numeric,
  unit text,
  -- 확장 가능 원가 구분 (재료비·노무비·외주비·경비·미분류)
  cost_category text not null default '미분류'
    check (cost_category in ('재료비', '노무비', '외주비', '경비', '미분류')),
  -- null = 미입력 (0원 확정과 구분)
  unit_cost bigint null check (unit_cost is null or unit_cost >= 0),
  amount bigint null check (amount is null or amount >= 0),
  supplier_name text,
  payment_due_date date,
  sort_order integer not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists execution_budget_items_budget_id_idx
  on public.execution_budget_items (execution_budget_id);

create index if not exists execution_budget_items_company_id_idx
  on public.execution_budget_items (company_id);

create index if not exists execution_budget_items_source_quote_item_id_idx
  on public.execution_budget_items (source_quote_item_id);

comment on column public.execution_budget_items.unit_cost is
  '예상 원가 단가. null=미입력. 견적 판매단가를 원가로 복사하지 않음.';
comment on column public.execution_budget_items.supplier_name is
  '공급업체 텍스트. vendors 테이블 없음 — FK 없음.';

-- ---------------------------------------------------------------------------
-- 3) 계약번호 자동 부여 (회사·일자별, quote_number 패턴 재사용)
-- ---------------------------------------------------------------------------
create or replace function public.contracts_assign_contract_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  day_key text;
  lock_key bigint;
  next_seq integer;
  prefix text;
begin
  if new.contract_number is not null and btrim(new.contract_number) <> '' then
    return new;
  end if;

  if new.company_id is null then
    raise exception 'contract company_id is required';
  end if;

  day_key := to_char((current_timestamp at time zone 'Asia/Seoul'), 'YYYYMMDD');
  prefix := 'CT-' || day_key || '-';

  lock_key := hashtextextended(
    'eighty_erp_contract_number_' || new.company_id::text || '_' || day_key,
    0
  );
  perform pg_advisory_xact_lock(lock_key);

  select coalesce(max(
    case
      when c.contract_number ~ ('^CT-' || day_key || '-[0-9]{3,}$')
        then substring(c.contract_number from length(prefix) + 1)::integer
      else 0
    end
  ), 0) + 1
  into next_seq
  from public.contracts c
  where c.company_id = new.company_id
    and c.contract_number like prefix || '%';

  new.contract_number := prefix || lpad(next_seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists contracts_assign_contract_number_trg on public.contracts;
create trigger contracts_assign_contract_number_trg
before insert on public.contracts
for each row
execute function public.contracts_assign_contract_number();

revoke all on function public.contracts_assign_contract_number() from public;
revoke all on function public.contracts_assign_contract_number() from anon;

-- ---------------------------------------------------------------------------
-- 4) 전환 완료 견적 잠금 (contracts.quote_id 존재 시)
--    RPC 는 app.quote_contract_transition=1 (transaction-local) 로 우회
-- ---------------------------------------------------------------------------
create or replace function public.quotes_block_update_when_contracted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.quote_contract_transition', true) = '1' then
    return new;
  end if;

  if not exists (
    select 1 from public.contracts c where c.quote_id = old.id
  ) then
    return new;
  end if;

  -- 계약 근거 금액·고객·핵심 식별 변경 금지
  if new.customer_id is distinct from old.customer_id
     or new.total_amount is distinct from old.total_amount
     or new.discount_amount is distinct from old.discount_amount
     or new.final_amount is distinct from old.final_amount
     or new.lx_discount_amount is distinct from old.lx_discount_amount
     or new.lx_discount_rate is distinct from old.lx_discount_rate
     or new.supply_amount is distinct from old.supply_amount
     or new.vat_amount is distinct from old.vat_amount
     or new.customer_total_amount is distinct from old.customer_total_amount
     or new.vat_mode is distinct from old.vat_mode
     or new.vat_rate is distinct from old.vat_rate
     or new.title is distinct from old.title
     or new.quote_number is distinct from old.quote_number
     or new.quote_type is distinct from old.quote_type
     or new.company_id is distinct from old.company_id
  then
    raise exception '계약이 연결된 견적의 금액·고객·주요 내용은 수정할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists quotes_block_update_when_contracted_trg on public.quotes;
create trigger quotes_block_update_when_contracted_trg
before update on public.quotes
for each row
execute function public.quotes_block_update_when_contracted();

create or replace function public.quote_items_block_mutate_when_contracted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
begin
  if current_setting('app.quote_contract_transition', true) = '1' then
    return coalesce(new, old);
  end if;

  v_quote_id := coalesce(new.quote_id, old.quote_id);

  if exists (
    select 1 from public.contracts c where c.quote_id = v_quote_id
  ) then
    raise exception '계약이 연결된 견적의 품목은 수정·삭제할 수 없습니다.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_items_block_ins_when_contracted_trg on public.quote_items;
create trigger quote_items_block_ins_when_contracted_trg
before insert on public.quote_items
for each row
execute function public.quote_items_block_mutate_when_contracted();

drop trigger if exists quote_items_block_upd_when_contracted_trg on public.quote_items;
create trigger quote_items_block_upd_when_contracted_trg
before update on public.quote_items
for each row
execute function public.quote_items_block_mutate_when_contracted();

drop trigger if exists quote_items_block_del_when_contracted_trg on public.quote_items;
create trigger quote_items_block_del_when_contracted_trg
before delete on public.quote_items
for each row
execute function public.quote_items_block_mutate_when_contracted();

revoke all on function public.quotes_block_update_when_contracted() from public;
revoke all on function public.quotes_block_update_when_contracted() from anon;
revoke all on function public.quote_items_block_mutate_when_contracted() from public;
revoke all on function public.quote_items_block_mutate_when_contracted() from anon;

-- ---------------------------------------------------------------------------
-- 5) quote cost_type → budget cost_category 매핑
-- ---------------------------------------------------------------------------
create or replace function public.map_quote_cost_type_to_budget_category(
  p_cost_type text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_cost_type
    when '자재' then '재료비'
    when '시공' then '노무비'
    when '시공+자재' then '미분류'
    when '기타' then '미분류'
    else '미분류'
  end;
$$;

revoke all on function public.map_quote_cost_type_to_budget_category(text) from public;
revoke all on function public.map_quote_cost_type_to_budget_category(text) from anon;

-- ---------------------------------------------------------------------------
-- 6) 원자적 전환 RPC
-- ---------------------------------------------------------------------------
create or replace function public.transition_quote_to_contract(
  p_quote_id uuid,
  p_project_mode text,
  p_project_id uuid default null,
  p_project_name text default null,
  p_project_address text default null,
  p_assigned_employee_id uuid default null,
  p_contract_date date default null,
  p_contract_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_employee_id uuid;
  v_quote public.quotes%rowtype;
  v_customer public.customers%rowtype;
  v_project public.projects%rowtype;
  v_contract public.contracts%rowtype;
  v_budget public.execution_budgets%rowtype;
  v_mode text;
  v_project_name text;
  v_project_address text;
  v_assignee uuid;
  v_supply bigint;
  v_vat bigint;
  v_discount bigint;
  v_contract_amount bigint;
  v_est_total bigint;
  v_item_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_erp_user() then
    raise exception '권한이 없습니다.';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception '권한이 없습니다.';
  end if;

  v_employee_id := public.current_employee_id();
  v_mode := lower(btrim(coalesce(p_project_mode, '')));
  if v_mode not in ('link', 'create') then
    raise exception '현장 연결 방식이 올바르지 않습니다.';
  end if;

  if p_quote_id is null then
    raise exception '전환할 수 없는 견적입니다.';
  end if;

  -- 동시 전환 직렬화
  select *
  into v_quote
  from public.quotes q
  where q.id = p_quote_id
  for update;

  if not found then
    raise exception '전환할 수 없는 견적입니다.';
  end if;

  -- 회사·삭제 검증 (타사 존재 여부 비노출)
  if v_quote.deleted_at is not null
     or v_quote.company_id is distinct from v_company_id then
    raise exception '전환할 수 없는 견적입니다.';
  end if;

  if not public.can_access_customer(v_quote.customer_id) then
    raise exception '권한이 없습니다.';
  end if;

  -- 이미 전환됨 → 멱등 반환
  select *
  into v_contract
  from public.contracts c
  where c.quote_id = p_quote_id;

  if found then
    select * into v_budget
    from public.execution_budgets b
    where b.contract_id = v_contract.id;

    return jsonb_build_object(
      'ok', true,
      'already_converted', true,
      'contract_id', v_contract.id,
      'project_id', v_contract.project_id,
      'execution_budget_id', v_budget.id
    );
  end if;

  -- 상태: 작성중(draft) 등 거부. 승인·계약전환만 허용.
  if v_quote.status not in ('승인', '계약전환') then
    raise exception '승인 또는 계약전환 상태의 견적만 전환할 수 있습니다.';
  end if;

  select *
  into v_customer
  from public.customers c
  where c.id = v_quote.customer_id
  for update;

  if not found
     or v_customer.deleted_at is not null
     or v_customer.company_id is distinct from v_company_id then
    raise exception '전환할 수 없는 견적입니다.';
  end if;

  -- 현장 link / create
  if v_mode = 'link' then
    if p_project_id is null then
      raise exception '연결할 현장을 선택해 주세요.';
    end if;

    select *
    into v_project
    from public.projects p
    where p.id = p_project_id
    for update;

    if not found
       or v_project.deleted_at is not null
       or v_project.company_id is distinct from v_company_id
       or v_project.customer_id is distinct from v_quote.customer_id then
      raise exception '선택한 현장을 연결할 수 없습니다.';
    end if;
  else
    -- create: 기존 현장 자동 연결하지 않음
    v_project_name := nullif(btrim(coalesce(p_project_name, '')), '');
    if v_project_name is null then
      v_project_name := nullif(btrim(coalesce(v_customer.name, '')), '');
    end if;
    if v_project_name is null then
      v_project_name := nullif(btrim(coalesce(v_customer.address, '')), '');
    end if;
    if v_project_name is null then
      v_project_name := '현장';
    end if;

    v_project_address := coalesce(
      nullif(btrim(coalesce(p_project_address, '')), ''),
      v_customer.address
    );

    v_assignee := coalesce(
      p_assigned_employee_id,
      v_customer.assigned_employee_id,
      v_quote.assigned_employee_id,
      v_employee_id
    );

    -- 담당자 지정 시 같은 회사 직원인지 확인
    if v_assignee is not null then
      if not exists (
        select 1
        from public.employees e
        where e.id = v_assignee
          and e.is_active = true
          and (
            e.company_id is null
            or e.company_id = v_company_id
          )
      ) then
        raise exception '담당자를 확인할 수 없습니다.';
      end if;
    end if;

    insert into public.projects (
      customer_id,
      name,
      address,
      status,
      assigned_employee_id,
      company_id,
      created_by,
      updated_by
    ) values (
      v_quote.customer_id,
      v_project_name,
      v_project_address,
      '준비',
      v_assignee,
      v_company_id,
      v_user_id,
      v_user_id
    )
    returning * into v_project;
  end if;

  -- 금액 스냅샷 (판매가). VAT 컬럼 없으면 final_amount 사용.
  v_discount := coalesce(v_quote.discount_amount, 0)
    + coalesce(v_quote.lx_discount_amount, 0);

  if v_quote.customer_total_amount is not null then
    v_contract_amount := greatest(v_quote.customer_total_amount, 0);
    v_supply := coalesce(v_quote.supply_amount, v_quote.final_amount, 0);
    v_vat := coalesce(v_quote.vat_amount, 0);
  else
    v_contract_amount := greatest(coalesce(v_quote.final_amount, 0), 0);
    v_supply := v_contract_amount;
    v_vat := 0;
  end if;

  -- RPC 내부 quote 동기화 허용
  perform set_config('app.quote_contract_transition', '1', true);

  begin
    insert into public.contracts (
      company_id,
      customer_id,
      quote_id,
      project_id,
      contract_number,
      contract_date,
      status,
      supply_amount,
      vat_amount,
      discount_amount,
      contract_amount,
      assigned_employee_id,
      created_by,
      updated_by
    ) values (
      v_company_id,
      v_quote.customer_id,
      v_quote.id,
      v_project.id,
      nullif(btrim(coalesce(p_contract_number, '')), ''),
      coalesce(p_contract_date, (current_timestamp at time zone 'Asia/Seoul')::date),
      'active',
      v_supply,
      v_vat,
      v_discount,
      v_contract_amount,
      coalesce(v_quote.assigned_employee_id, v_customer.assigned_employee_id, v_employee_id),
      v_user_id,
      v_user_id
    )
    returning * into v_contract;
  exception
    when unique_violation then
      -- quote_id 충돌만 멱등 처리. 계약번호 중복 등은 재발생.
      select * into v_contract from public.contracts where quote_id = p_quote_id;
      if not found then
        raise;
      end if;

      -- create 모드에서 방금 만든 현장이 계약에 안 묶였으면 고아 방지
      if v_mode = 'create'
         and v_project.id is not null
         and v_project.id is distinct from v_contract.project_id then
        delete from public.projects p
        where p.id = v_project.id
          and p.created_by = v_user_id
          and not exists (
            select 1 from public.contracts c where c.project_id = p.id
          );
      end if;

      select * into v_budget
      from public.execution_budgets b
      where b.contract_id = v_contract.id;

      return jsonb_build_object(
        'ok', true,
        'already_converted', true,
        'contract_id', v_contract.id,
        'project_id', v_contract.project_id,
        'execution_budget_id', v_budget.id
      );
  end;

  insert into public.execution_budgets (
    company_id,
    contract_id,
    project_id,
    customer_id,
    status,
    estimated_total_cost,
    created_by,
    updated_by
  ) values (
    v_company_id,
    v_contract.id,
    v_project.id,
    v_quote.customer_id,
    'draft',
    null,
    v_user_id,
    v_user_id
  )
  returning * into v_budget;

  insert into public.execution_budget_items (
    company_id,
    execution_budget_id,
    source_quote_item_id,
    trade_name,
    item_name,
    description,
    quantity,
    unit,
    cost_category,
    unit_cost,
    amount,
    supplier_name,
    payment_due_date,
    sort_order,
    memo
  )
  select
    v_company_id,
    v_budget.id,
    qi.id,
    qi.trade_name,
    qi.item_name,
    qi.description,
    qi.quantity,
    qi.unit,
    public.map_quote_cost_type_to_budget_category(qi.cost_type),
    null, -- 원가 미입력 (판매단가 복사 금지)
    null,
    null,
    null,
    qi.sort_order,
    qi.remark
  from public.quote_items qi
  where qi.quote_id = v_quote.id
    and qi.deleted_at is null
  order by qi.sort_order, qi.created_at;

  get diagnostics v_item_count = row_count;

  -- 원가 미입력이면 estimated_total_cost 는 null 유지
  select
    case
      when count(*) filter (where amount is not null) = 0 then null
      else coalesce(sum(amount) filter (where amount is not null), 0)
    end
  into v_est_total
  from public.execution_budget_items
  where execution_budget_id = v_budget.id;

  update public.execution_budgets
  set estimated_total_cost = v_est_total,
      updated_at = now()
  where id = v_budget.id;

  -- 견적 동기화 (잠금 trigger 우회 중)
  update public.quotes
  set
    is_contract_quote = true,
    status = '계약전환',
    project_id = v_project.id,
    updated_by = v_user_id,
    updated_at = now()
  where id = v_quote.id;

  -- 같은 고객의 다른 견적 계약플래그 해제 (setContractQuote 호환, 레거시 백필 아님)
  update public.quotes
  set
    is_contract_quote = false,
    updated_by = v_user_id,
    updated_at = now()
  where customer_id = v_quote.customer_id
    and id <> v_quote.id
    and deleted_at is null
    and is_contract_quote = true
    and not exists (
      select 1 from public.contracts c where c.quote_id = quotes.id
    );

  return jsonb_build_object(
    'ok', true,
    'already_converted', false,
    'contract_id', v_contract.id,
    'project_id', v_project.id,
    'execution_budget_id', v_budget.id,
    'budget_item_count', v_item_count
  );
end;
$$;

revoke all on function public.transition_quote_to_contract(
  uuid, text, uuid, text, text, uuid, date, text
) from public;
grant execute on function public.transition_quote_to_contract(
  uuid, text, uuid, text, text, uuid, date, text
) to authenticated;

comment on function public.transition_quote_to_contract(
  uuid, text, uuid, text, text, uuid, date, text
) is
  'Bundle 1: 견적→계약·현장·실행예산 draft 원자 전환. p_project_mode=link|create.';

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
alter table public.contracts enable row level security;
alter table public.execution_budgets enable row level security;
alter table public.execution_budget_items enable row level security;

-- contracts
drop policy if exists contracts_select_erp on public.contracts;
create policy contracts_select_erp
on public.contracts
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
);

drop policy if exists contracts_insert_erp on public.contracts;
create policy contracts_insert_erp
on public.contracts
for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
);

drop policy if exists contracts_update_erp on public.contracts;
create policy contracts_update_erp
on public.contracts
for update
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
)
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
);

drop policy if exists contracts_delete_admin on public.contracts;
create policy contracts_delete_admin
on public.contracts
for delete
to authenticated
using (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

drop policy if exists contracts_company_guard on public.contracts;
create policy contracts_company_guard
on public.contracts
as restrictive
for all
to authenticated
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

-- execution_budgets
drop policy if exists execution_budgets_select_erp on public.execution_budgets;
create policy execution_budgets_select_erp
on public.execution_budgets
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
);

drop policy if exists execution_budgets_insert_erp on public.execution_budgets;
create policy execution_budgets_insert_erp
on public.execution_budgets
for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
);

drop policy if exists execution_budgets_update_erp on public.execution_budgets;
create policy execution_budgets_update_erp
on public.execution_budgets
for update
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
)
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
);

drop policy if exists execution_budgets_delete_admin on public.execution_budgets;
create policy execution_budgets_delete_admin
on public.execution_budgets
for delete
to authenticated
using (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

drop policy if exists execution_budgets_company_guard on public.execution_budgets;
create policy execution_budgets_company_guard
on public.execution_budgets
as restrictive
for all
to authenticated
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

-- execution_budget_items (부모 budget.customer_id 기준)
drop policy if exists execution_budget_items_select_erp on public.execution_budget_items;
create policy execution_budget_items_select_erp
on public.execution_budget_items
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and exists (
    select 1
    from public.execution_budgets b
    where b.id = execution_budget_id
      and (
        public.is_admin()
        or public.can_access_customer(b.customer_id)
      )
  )
);

drop policy if exists execution_budget_items_insert_erp on public.execution_budget_items;
create policy execution_budget_items_insert_erp
on public.execution_budget_items
for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and exists (
    select 1
    from public.execution_budgets b
    where b.id = execution_budget_id
      and (
        public.is_admin()
        or public.can_access_customer(b.customer_id)
      )
  )
);

drop policy if exists execution_budget_items_update_erp on public.execution_budget_items;
create policy execution_budget_items_update_erp
on public.execution_budget_items
for update
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and exists (
    select 1
    from public.execution_budgets b
    where b.id = execution_budget_id
      and (
        public.is_admin()
        or public.can_access_customer(b.customer_id)
      )
  )
)
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and exists (
    select 1
    from public.execution_budgets b
    where b.id = execution_budget_id
      and (
        public.is_admin()
        or public.can_access_customer(b.customer_id)
      )
  )
);

drop policy if exists execution_budget_items_delete_erp on public.execution_budget_items;
create policy execution_budget_items_delete_erp
on public.execution_budget_items
for delete
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and exists (
    select 1
    from public.execution_budgets b
    where b.id = execution_budget_id
      and (
        public.is_admin()
        or public.can_access_customer(b.customer_id)
      )
  )
);

drop policy if exists execution_budget_items_company_guard on public.execution_budget_items;
create policy execution_budget_items_company_guard
on public.execution_budget_items
as restrictive
for all
to authenticated
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

-- ---------------------------------------------------------------------------
-- 8) 적용 검증 (데이터 변경 없음)
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select
    to_regclass('public.contracts') is not null
    and to_regclass('public.execution_budgets') is not null
    and to_regclass('public.execution_budget_items') is not null
    and exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'transition_quote_to_contract'
    )
  into v_ok;

  if not v_ok then
    raise exception 'Bundle 1 migration verify failed';
  end if;
end;
$$;
