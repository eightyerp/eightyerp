-- =============================================================================
-- Migration 20260816100000
-- 견적→계약 멱등 재시도의 project_id 무결성 보강
--
-- 기존 적용 migration 39는 수정하지 않는다. 같은 RPC OID/signature를
-- CREATE OR REPLACE 하여 일반 재시도와 unique_violation 경쟁 경로 모두에서
-- 다른 현장을 성공으로 오인하지 않도록 fail-closed 처리한다.
-- 테이블/데이터 변경 없음.
-- =============================================================================

begin;

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

  -- 이미 전환됨 → 멱등 반환 (최종 기준: contracts 존재)
  select *
  into v_contract
  from public.contracts c
  where c.quote_id = p_quote_id;

  if found then
    if (v_mode = 'link' and p_project_id is null)
       or (
         p_project_id is not null
         and v_contract.project_id is distinct from p_project_id
       ) then
      raise exception using
        errcode = '23514',
        message = 'contract replay project mismatch';
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
  end if;

  -- Migration 39: 실운영 전환 가능 상태 = 발송완료
  -- 작성중(draft) 거부. '승인'을 전환 전제로 요구하지 않음.
  -- '계약전환'도 전환 전 필수가 아님 (전환 성공 후 표시용으로만 기록).
  if v_quote.status is distinct from '발송완료' then
    raise exception '발송완료 상태의 견적만 전환할 수 있습니다.';
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

      if (v_mode = 'link' and p_project_id is null)
         or (
           p_project_id is not null
           and v_contract.project_id is distinct from p_project_id
         ) then
        raise exception using
          errcode = '23514',
          message = 'contract replay project mismatch';
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

  -- 견적 동기화 (잠금 trigger 우회 중) — 표시용. 전환 완료 기준은 contracts.
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
  'Bundle 1: 견적→계약·현장·실행예산 draft 원자 전환. 허용 status=발송완료. 멱등 재시도는 기존 계약 project_id와 일치해야 한다.';

do $verify$
declare
  v_proc regprocedure := to_regprocedure(
    'public.transition_quote_to_contract(uuid, text, uuid, text, text, uuid, date, text)'
  );
  v_src text;
  v_security_definer boolean;
  v_config text[];
  v_public_execute boolean;
  v_marker_count integer;
begin
  if v_proc is null then
    raise exception 'Migration 20260816100000 verify failed: RPC missing';
  end if;

  select
    pg_get_functiondef(p.oid),
    p.prosecdef,
    p.proconfig,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0
        and a.privilege_type = 'EXECUTE'
    )
  into v_src, v_security_definer, v_config, v_public_execute
  from pg_proc p
  where p.oid = v_proc;

  v_marker_count :=
    (length(v_src) - length(replace(v_src, 'contract replay project mismatch', '')))
    / length('contract replay project mismatch');

  if v_marker_count <> 2 then
    raise exception
      'Migration 20260816100000 verify failed: replay guard count=%',
      v_marker_count;
  end if;

  if not coalesce(v_security_definer, false)
     or not (
       'search_path=public' = any(coalesce(v_config, array[]::text[]))
     ) then
    raise exception
      'Migration 20260816100000 verify failed: SECURITY DEFINER/search_path';
  end if;

  if not has_function_privilege('authenticated', v_proc::oid, 'EXECUTE')
     or has_function_privilege('anon', v_proc::oid, 'EXECUTE')
     or v_public_execute then
    raise exception
      'Migration 20260816100000 verify failed: RPC privileges';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
