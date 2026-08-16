-- =============================================================================
-- 20260816074308_quote_workflow_atomic_integrity 적용 후 검증
--
-- 실행 위치: Supabase SQL Editor
-- 범위: 기존 활성 일반 직원 context를 재사용한 synthetic INSERT/RPC probe
-- 안전: 운영 행 UPDATE/DELETE 없음, 모든 fixture는 BEGIN~ROLLBACK, COMMIT 금지
-- =============================================================================

-- A) 구조·권한
with checks(check_item, ok) as (
  values
    (
      'function:create_quote_with_workflow_context',
      to_regprocedure(
        'public.create_quote_with_workflow_context(jsonb,jsonb,uuid,uuid)'
      ) is not null
    ),
    (
      'trigger:quotes_00_validate_project_identity',
      exists (
        select 1
        from pg_trigger t
        where t.tgrelid = 'public.quotes'::regclass
          and t.tgname = 'quotes_00_validate_project_identity'
          and not t.tgisinternal
      )
    ),
    (
      'trigger:quotes_01_lock_workflow_source',
      exists (
        select 1
        from pg_trigger t
        where t.tgrelid = 'public.quotes'::regclass
          and t.tgname = 'quotes_01_lock_workflow_source'
          and not t.tgisinternal
      )
    ),
    (
      'privilege:authenticated',
      has_function_privilege(
        'authenticated',
        'public.create_quote_with_workflow_context(jsonb,jsonb,uuid,uuid)',
        'EXECUTE'
      )
    ),
    (
      'privilege:anon_denied',
      not has_function_privilege(
        'anon',
        'public.create_quote_with_workflow_context(jsonb,jsonb,uuid,uuid)',
        'EXECUTE'
      )
    ),
    (
      'privilege:public_denied',
      not has_function_privilege(
        'public',
        'public.create_quote_with_workflow_context(jsonb,jsonb,uuid,uuid)',
        'EXECUTE'
      )
    ),
    (
      'security:invoker',
      exists (
        select 1
        from pg_proc p
        where p.oid = to_regprocedure(
          'public.create_quote_with_workflow_context(jsonb,jsonb,uuid,uuid)'
        )
          and not p.prosecdef
          and 'search_path=""' = any(coalesce(p.proconfig, array[]::text[]))
      )
    )
)
select
  'A_structure' as phase,
  check_item,
  ok,
  count(*) filter (where not ok) over () as fail_count
from checks
order by ok, check_item;

-- B) 실제 일반 직원 권한 + synthetic lifecycle (반드시 ROLLBACK)
begin;

do $verify$
declare
  v_marker text := 'WQWF-VERIFY-' || replace(gen_random_uuid()::text, '-', '');
  v_user_id uuid;
  v_employee_id uuid;
  v_company_id uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_project_a uuid;
  v_project_a2 uuid;
  v_project_b uuid;
  v_inspection_1 uuid := gen_random_uuid();
  v_inspection_2 uuid := gen_random_uuid();
  v_consultation_1 uuid;
  v_consultation_2 uuid;
  v_cross_request uuid := gen_random_uuid();
  v_bad_source_request uuid := gen_random_uuid();
  v_valid_request uuid := gen_random_uuid();
  v_quote_id uuid;
  v_item_id uuid;
  v_contract_id uuid;
  v_budget_id uuid;
  v_result jsonb;
  v_header jsonb;
  v_items jsonb;
  v_count integer;
  v_phone_a text;
  v_phone_b text;
begin
  select p.id, m.employee_id, m.company_id
  into v_user_id, v_employee_id, v_company_id
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id
   and m.company_id = p.active_company_id
   and m.status = 'active'
   and m.employee_id = p.employee_id
  join public.employees e
    on e.id = m.employee_id
   and e.company_id = m.company_id
   and e.is_active is true
  join public.companies c
    on c.id = m.company_id
   and c.status = 'active'
  where m.role = 'staff'
    and p.is_active is true
    and p.is_approved is true
    and p.approval_status = 'approved'
    and p.active_company_id is not null
  order by p.id
  limit 1;

  if v_user_id is null
     or v_employee_id is null
     or v_company_id is null then
    raise exception
      '검증 중단: active/approved 일반 직원과 회사 context가 없습니다.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_user_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  if auth.uid() is distinct from v_user_id
     or public.current_company_id() is distinct from v_company_id
     or public.current_employee_id() is distinct from v_employee_id
     or not coalesce(public.is_erp_user(), false)
     or coalesce(public.is_admin(), false) then
    raise exception '검증 중단: 일반 직원 auth/company/employee context 불일치';
  end if;

  v_phone_a := '070' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_phone_b := '071' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.customers(
    company_id,
    name,
    phone,
    status,
    assigned_employee_id
  ) values (
    v_company_id,
    v_marker || '-customer-a',
    v_phone_a,
    '신규',
    v_employee_id
  )
  returning id into v_customer_a;

  insert into public.customers(
    company_id,
    name,
    phone,
    status,
    assigned_employee_id
  ) values (
    v_company_id,
    v_marker || '-customer-b',
    v_phone_b,
    '신규',
    v_employee_id
  )
  returning id into v_customer_b;

  insert into public.projects(
    customer_id,
    name,
    address,
    status,
    assigned_employee_id,
    company_id,
    created_by,
    updated_by
  ) values (
    v_customer_a,
    v_marker || '-project-a',
    'rollback-only',
    '준비',
    v_employee_id,
    v_company_id,
    v_user_id,
    v_user_id
  )
  returning id into v_project_a;

  insert into public.projects(
    customer_id,
    name,
    address,
    status,
    assigned_employee_id,
    company_id,
    created_by,
    updated_by
  ) values (
    v_customer_a,
    v_marker || '-project-a2',
    'rollback-only',
    '준비',
    v_employee_id,
    v_company_id,
    v_user_id,
    v_user_id
  )
  returning id into v_project_a2;

  insert into public.projects(
    customer_id,
    name,
    address,
    status,
    assigned_employee_id,
    company_id,
    created_by,
    updated_by
  ) values (
    v_customer_b,
    v_marker || '-project-b',
    'rollback-only',
    '준비',
    v_employee_id,
    v_company_id,
    v_user_id,
    v_user_id
  )
  returning id into v_project_b;

  insert into public.window_inspections(
    id,
    company_id,
    customer_id,
    project_id,
    performed_by_user_id,
    performed_by_employee_id,
    inspection_status,
    report_status,
    report_reference,
    client_request_id
  ) values (
    v_inspection_1,
    v_company_id,
    v_customer_a,
    v_project_a,
    v_user_id,
    v_employee_id,
    'completed',
    'approved',
    v_marker || '-inspection-1',
    gen_random_uuid()
  );

  insert into public.window_inspections(
    id,
    company_id,
    customer_id,
    project_id,
    performed_by_user_id,
    performed_by_employee_id,
    inspection_status,
    report_status,
    report_reference,
    client_request_id
  ) values (
    v_inspection_2,
    v_company_id,
    v_customer_a,
    v_project_a,
    v_user_id,
    v_employee_id,
    'completed',
    'approved',
    v_marker || '-inspection-2',
    gen_random_uuid()
  );

  insert into public.customer_consult_logs(
    company_id,
    customer_id,
    consult_type,
    consult_content,
    created_by,
    source_project_id,
    source_inspection_id
  ) values (
    v_company_id,
    v_customer_a,
    '방문',
    v_marker || '-consultation-1',
    v_user_id,
    v_project_a,
    v_inspection_1
  )
  returning id into v_consultation_1;

  insert into public.customer_consult_logs(
    company_id,
    customer_id,
    consult_type,
    consult_content,
    created_by,
    source_project_id,
    source_inspection_id
  ) values (
    v_company_id,
    v_customer_a,
    '방문',
    v_marker || '-consultation-2',
    v_user_id,
    v_project_a,
    v_inspection_2
  )
  returning id into v_consultation_2;

  v_header := jsonb_build_object(
    'quote_type', '기타',
    'quote_mode', 'simple',
    'title', v_marker || '-quote',
    'status', '작성중',
    'total_amount', 100000,
    'discount_amount', 0,
    'lx_discount_rate', 0,
    'lx_discount_amount', 0,
    'final_amount', 100000,
    'issued_at', current_date,
    'assigned_employee_id', v_employee_id,
    'is_lx_material', false,
    'is_contract_quote', false
  );

  v_items := jsonb_build_array(
    jsonb_build_object(
      'trade_name', '기타',
      'item_name', v_marker || '-item',
      'quantity', 1,
      'unit', '식',
      'unit_price', 100000,
      'amount', 100000,
      'cost_type', '기타',
      'is_lx_material', false,
      'lx_discount_base_amount', 0,
      'lx_discount_type', 'none',
      'lx_discount_value', 0,
      'sort_order', 0
    )
  );

  -- 1) 같은 회사라도 customer A + project B는 base RPC부터 거부.
  begin
    perform public.create_quote_with_items(
      v_header || jsonb_build_object(
        'request_id', v_cross_request,
        'customer_id', v_customer_a,
        'project_id', v_project_b
      ),
      v_items
    );
    raise exception 'cross-customer project unexpectedly allowed';
  exception when sqlstate '23514' then
    null;
  end;

  select count(*)::integer into v_count
  from public.quotes q
  where q.company_id = v_company_id
    and q.created_by = v_user_id
    and q.create_request_id = v_cross_request;
  if v_count <> 0 then
    raise exception 'cross-customer quote residue=%', v_count;
  end if;

  -- 2) consultation 1은 inspection 1을 가리키므로 consultation 1 + inspection 2 거부.
  begin
    perform public.create_quote_with_workflow_context(
      v_header || jsonb_build_object(
        'request_id', v_bad_source_request,
        'customer_id', v_customer_a,
        'project_id', v_project_a
      ),
      v_items,
      v_consultation_1,
      v_inspection_2
    );
    raise exception 'mismatched workflow source unexpectedly allowed';
  exception when sqlstate '23514' then
    null;
  end;

  select count(*)::integer into v_count
  from public.quotes q
  where q.company_id = v_company_id
    and q.created_by = v_user_id
    and q.create_request_id = v_bad_source_request;
  if v_count <> 0 then
    raise exception 'invalid source quote residue=%', v_count;
  end if;

  -- 3) 정상 source 생성 + exact replay.
  v_result := public.create_quote_with_workflow_context(
    v_header || jsonb_build_object(
      'request_id', v_valid_request,
      'customer_id', v_customer_a,
      'project_id', v_project_a
    ),
    v_items,
    v_consultation_1,
    v_inspection_1
  );

  if v_result->>'outcome' <> 'created' then
    raise exception 'valid workflow create outcome=%', v_result;
  end if;
  v_quote_id := (v_result->>'quote_id')::uuid;

  select i.id into v_item_id
  from public.quote_items i
  where i.quote_id = v_quote_id
    and i.deleted_at is null
  order by i.id
  limit 1;

  if v_item_id is null then
    raise exception 'valid workflow quote item missing';
  end if;

  v_result := public.create_quote_with_workflow_context(
    v_header || jsonb_build_object(
      'request_id', v_valid_request,
      'customer_id', v_customer_a,
      'project_id', v_project_a
    ),
    v_items,
    v_consultation_1,
    v_inspection_1
  );

  if v_result->>'outcome' <> 'replayed'
     or (v_result->>'quote_id')::uuid is distinct from v_quote_id then
    raise exception 'exact replay failed=%', v_result;
  end if;

  select count(*)::integer into v_count
  from public.quotes q
  join public.quote_items i
    on i.quote_id = q.id
   and i.deleted_at is null
  where q.id = v_quote_id
    and q.source_consultation_id = v_consultation_1
    and q.source_inspection_id = v_inspection_1;
  if v_count <> 1 then
    raise exception 'valid/replay quote item count=%', v_count;
  end if;

  -- 4) 같은 request ID에 다른 정상 source pair는 거부하고 원래 pair 유지.
  begin
    perform public.create_quote_with_workflow_context(
      v_header || jsonb_build_object(
        'request_id', v_valid_request,
        'customer_id', v_customer_a,
        'project_id', v_project_a
      ),
      v_items,
      v_consultation_2,
      v_inspection_2
    );
    raise exception 'source replay mismatch unexpectedly allowed';
  exception when sqlstate '23514' then
    null;
  end;

  select count(*)::integer into v_count
  from public.quotes q
  join public.quote_items i
    on i.quote_id = q.id
   and i.deleted_at is null
  where q.id = v_quote_id
    and q.source_consultation_id = v_consultation_1
    and q.source_inspection_id = v_inspection_1;
  if v_count <> 1 then
    raise exception 'source replay changed row or duplicated item count=%', v_count;
  end if;

  -- update RPC도 다른 고객 project로 변경할 수 없다.
  begin
    perform public.update_quote_with_items(
      v_quote_id,
      v_header || jsonb_build_object('project_id', v_project_b),
      jsonb_build_array(
        jsonb_build_object(
          'id', v_item_id,
          'trade_name', '기타',
          'item_name', v_marker || '-item',
          'quantity', 1,
          'unit', '식',
          'unit_price', 100000,
          'amount', 100000,
          'cost_type', '기타',
          'is_lx_material', false,
          'lx_discount_base_amount', 0,
          'lx_discount_type', 'none',
          'lx_discount_value', 0,
          'sort_order', 0
        )
      ),
      array[]::uuid[]
    );
    raise exception 'cross-customer update unexpectedly allowed';
  exception when sqlstate '23514' then
    null;
  end;

  -- 유효한 다른 chain이라도 직접 relink는 불변성 trigger가 거부.
  begin
    update public.quotes
    set
      source_consultation_id = v_consultation_2,
      source_inspection_id = v_inspection_2
    where id = v_quote_id;
    raise exception 'direct workflow relink unexpectedly allowed';
  exception when sqlstate '23514' then
    null;
  end;

  -- 5) 견적→계약 최초 전환, exact replay, 다른 현장 replay 무결성.
  -- 기존 quote/source relink 검증을 모두 마친 뒤 실행해야 계약 잠금과 간섭하지 않는다.
  update public.quotes
  set
    status = '발송완료',
    updated_by = v_user_id,
    updated_at = now()
  where id = v_quote_id;

  v_result := public.transition_quote_to_contract(
    v_quote_id,
    'link',
    v_project_a,
    null,
    null,
    v_employee_id,
    current_date,
    left(v_marker, 30) || '-contract'
  );

  if coalesce((v_result->>'already_converted')::boolean, true) then
    raise exception 'first contract transition was reported as replay=%', v_result;
  end if;

  v_contract_id := (v_result->>'contract_id')::uuid;
  v_budget_id := (v_result->>'execution_budget_id')::uuid;

  v_result := public.transition_quote_to_contract(
    v_quote_id,
    'link',
    v_project_a,
    null,
    null,
    v_employee_id,
    current_date,
    left(v_marker, 30) || '-contract'
  );

  if coalesce((v_result->>'already_converted')::boolean, false) is not true
     or (v_result->>'contract_id')::uuid is distinct from v_contract_id
     or (v_result->>'project_id')::uuid is distinct from v_project_a
     or (v_result->>'execution_budget_id')::uuid is distinct from v_budget_id then
    raise exception 'exact contract replay failed=%', v_result;
  end if;

  begin
    perform public.transition_quote_to_contract(
      v_quote_id,
      'link',
      v_project_a2,
      null,
      null,
      v_employee_id,
      current_date,
      left(v_marker, 30) || '-contract'
    );
    raise exception 'different-project contract replay unexpectedly allowed';
  exception when sqlstate '23514' then
    null;
  end;

  select count(*)::integer into v_count
  from public.contracts c
  join public.execution_budgets b
    on b.contract_id = c.id
  where c.id = v_contract_id
    and c.quote_id = v_quote_id
    and c.project_id = v_project_a
    and c.contract_number = left(v_marker, 30) || '-contract'
    and b.id = v_budget_id
    and b.project_id = v_project_a;

  if v_count <> 1
     or exists (
       select 1
       from public.contracts c
       where c.quote_id = v_quote_id
         and c.project_id = v_project_a2
     ) then
    raise exception 'contract replay changed or duplicated the project chain';
  end if;

  perform set_config('app.wqwf_marker', v_marker, true);
  perform set_config('app.wqwf_quote_id', v_quote_id::text, true);
  perform set_config('app.wqwf_ok', 'true', true);

  raise notice 'WQWF_ATOMIC_FLOW_OK marker=% quote=%',
    v_marker,
    v_quote_id;
end;
$verify$;

select
  'B_in_txn' as phase,
  current_setting('app.wqwf_ok', true) as flow_ok,
  current_setting('app.wqwf_marker', true) as marker,
  current_setting('app.wqwf_quote_id', true) as quote_id;

rollback;

-- C) marker residue 0
select
  'C_post_rollback' as phase,
  (select count(*)::integer
   from public.customers
   where name like 'WQWF-VERIFY-%') as customers_remaining,
  (select count(*)::integer
   from public.projects
   where name like 'WQWF-VERIFY-%') as projects_remaining,
  (select count(*)::integer
   from public.window_inspections
   where report_reference like 'WQWF-VERIFY-%') as inspections_remaining,
  (select count(*)::integer
   from public.customer_consult_logs
   where consult_content like 'WQWF-VERIFY-%') as consultations_remaining,
  (select count(*)::integer
   from public.quotes
   where title like 'WQWF-VERIFY-%') as quotes_remaining,
  (select count(*)::integer
   from public.quote_items i
   join public.quotes q on q.id = i.quote_id
   where q.title like 'WQWF-VERIFY-%') as quote_items_remaining,
  (select count(*)::integer
   from public.contracts
   where contract_number like 'WQWF-VERIFY-%') as contracts_remaining,
  (select count(*)::integer
   from public.execution_budgets b
   join public.contracts c on c.id = b.contract_id
   where c.contract_number like 'WQWF-VERIFY-%') as budgets_remaining,
  (
    not exists (
      select 1 from public.customers where name like 'WQWF-VERIFY-%'
    )
    and not exists (
      select 1 from public.projects where name like 'WQWF-VERIFY-%'
    )
    and not exists (
      select 1
      from public.window_inspections
      where report_reference like 'WQWF-VERIFY-%'
    )
    and not exists (
      select 1
      from public.customer_consult_logs
      where consult_content like 'WQWF-VERIFY-%'
    )
    and not exists (
      select 1 from public.quotes where title like 'WQWF-VERIFY-%'
    )
    and not exists (
      select 1
      from public.contracts
      where contract_number like 'WQWF-VERIFY-%'
    )
    and not exists (
      select 1
      from public.execution_budgets b
      join public.contracts c on c.id = b.contract_id
      where c.contract_number like 'WQWF-VERIFY-%'
    )
  ) as residue_clean;
