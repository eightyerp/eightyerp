-- Read-only verification for the Employee Master company-scope guard.

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.list_employee_master()',
    'public.create_employee_master(text,uuid,text,text,text)',
    'public.update_employee_master(uuid,text,uuid,text,text,text,boolean)',
    'public.transfer_employee_assignments(uuid,uuid)',
    'public.unlink_employee_login(uuid)',
    'public.update_employee_login_role(uuid,text)',
    'public.get_employee_merge_impact(uuid,uuid)',
    'public.merge_employees(uuid,uuid,uuid,text)',
    'public.list_employee_merge_states()',
    'public.update_employee_contact_profile(uuid,text,text,text,text,boolean,boolean)'
  ]
  loop
    if to_regprocedure(v_signature) is null then
      raise exception '필수 Employee Master RPC 누락: %', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'authenticated EXECUTE 누락: %', v_signature;
    end if;
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception '비허용 역할에 EXECUTE가 열려 있음: %', v_signature;
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and pg_catalog.lower(
        coalesce(policy_row.qual, '') || ' ' ||
        coalesce(policy_row.with_check, '')
      ) like '%is_admin%'
      and not exists (
        select 1
        from pg_policies guard_policy
        where guard_policy.schemaname = policy_row.schemaname
          and guard_policy.tablename = policy_row.tablename
          and guard_policy.permissive = 'RESTRICTIVE'
          and guard_policy.cmd = 'ALL'
          and guard_policy.roles @> array['authenticated']::name[]
          and pg_catalog.cardinality(guard_policy.roles) = 1
          and pg_catalog.lower(coalesce(guard_policy.qual, ''))
            like '%current_company_id%'
          and pg_catalog.lower(coalesce(guard_policy.with_check, ''))
            like '%current_company_id%'
      )
  ) then
    raise exception 'is_admin 정책 중 RESTRICTIVE 현재회사 guard가 없는 정책이 있습니다.';
  end if;

  if pg_catalog.to_regclass('public.customers') is not null
     and not exists (
       select 1
       from pg_policies policy_row
       where policy_row.schemaname = 'public'
         and policy_row.tablename = 'customers'
         and policy_row.policyname = 'customers_company_guard'
         and policy_row.permissive = 'RESTRICTIVE'
         and pg_catalog.lower(coalesce(policy_row.qual, ''))
           like '%current_company_id%'
         and pg_catalog.lower(coalesce(policy_row.with_check, ''))
           like '%current_company_id%'
     ) then
    raise exception '고객 RESTRICTIVE 현재회사 guard가 누락되었습니다.';
  end if;

  if pg_catalog.to_regclass('public.interior_quote_imports') is not null
     and not exists (
       select 1
       from pg_policies policy_row
       where policy_row.schemaname = 'public'
         and policy_row.tablename = 'interior_quote_imports'
         and policy_row.policyname = 'interior_quote_imports_company_guard'
         and policy_row.permissive = 'RESTRICTIVE'
         and pg_catalog.lower(coalesce(policy_row.qual, ''))
           like '%current_company_id%'
         and pg_catalog.lower(coalesce(policy_row.with_check, ''))
           like '%current_company_id%'
     ) then
    raise exception '실내견적 import RESTRICTIVE 현재회사 guard가 누락되었습니다.';
  end if;

  if exists (
    select 1
    from pg_proc function_row
    where function_row.oid in (
      'public.list_employee_master()'::regprocedure,
      'public.create_employee_master(text,uuid,text,text,text)'::regprocedure,
      'public.update_employee_master(uuid,text,uuid,text,text,text,boolean)'::regprocedure,
      'public.transfer_employee_assignments(uuid,uuid)'::regprocedure,
      'public.unlink_employee_login(uuid)'::regprocedure,
      'public.update_employee_login_role(uuid,text)'::regprocedure,
      'public.get_employee_merge_impact(uuid,uuid)'::regprocedure,
      'public.merge_employees(uuid,uuid,uuid,text)'::regprocedure,
      'public.list_employee_merge_states()'::regprocedure,
      'public.update_employee_contact_profile(uuid,text,text,text,text,boolean,boolean)'::regprocedure,
      'public.can_write_employee_business_card(text)'::regprocedure,
      'public.can_access_project(uuid)'::regprocedure,
      'public.can_access_quote(uuid)'::regprocedure,
      'public.can_access_project_material_object(text)'::regprocedure,
      'public.assert_active_assignment_employee(jsonb,text)'::regprocedure,
      'public.enforce_active_assignment_employee()'::regprocedure,
      'public.assert_customer_access_token_scope(jsonb)'::regprocedure,
      'public.enforce_customer_access_token_scope()'::regprocedure
    )
      and (
        not function_row.prosecdef
        or function_row.proconfig is distinct from array['search_path=""']::text[]
      )
  ) then
    raise exception 'SECURITY DEFINER/search_path 계약을 충족하지 않는 Employee Master RPC가 있습니다.';
  end if;
end;
$$;

do $assignment_guard_verification$
declare
  v_assert_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.assert_active_assignment_employee(jsonb,text)'::regprocedure
  ));
  v_enforce_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.enforce_active_assignment_employee()'::regprocedure
  ));
  v_update_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.update_employee_master(uuid,text,uuid,text,text,text,boolean)'::regprocedure
  ));
  v_transfer_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.transfer_employee_assignments(uuid,uuid)'::regprocedure
  ));
  v_merge_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.merge_employees(uuid,uuid,uuid,text)'::regprocedure
  ));
  v_table record;
  v_preflight_ok boolean;
begin
  if position('for key share' in v_assert_definition) = 0
     or position('employee_row.is_active = true' in v_assert_definition) = 0
     or position(
       'employee_row.merged_into_employee_id is null'
       in v_assert_definition
     ) = 0
     or position('p_row_data ? ''deleted_at''' in v_assert_definition) = 0
     or position('schedule_alert_events' in v_assert_definition) = 0
     or position('status' in v_assert_definition) = 0
     or position('public.customers' in v_assert_definition) = 0
     or position('public.projects' in v_assert_definition) = 0
     or position('public.quotes' in v_assert_definition) = 0 then
    raise exception '담당업무 직원 trigger의 잠금·활성·회사 계약이 올바르지 않습니다.';
  end if;
  if position('public.assert_active_assignment_employee' in v_enforce_definition) = 0
     or position('pg_catalog.to_jsonb(new)' in v_enforce_definition) = 0
     or position('tg_table_name' in v_enforce_definition) = 0 then
    raise exception '담당업무 trigger wrapper가 NEW 행 검증 함수를 호출하지 않습니다.';
  end if;

  if v_update_definition !~
       'from public\.employees employee_row[[:space:]]+where employee_row\.id = p_employee_id[[:space:]]+and employee_row\.company_id = v_company_id[[:space:]]+for update'
     or v_transfer_definition !~
       'from public\.employees employee_row[[:space:]]+where employee_row\.id in \(p_from_employee_id, p_to_employee_id\)[[:space:]]+order by employee_row\.id[[:space:]]+for update'
     or v_merge_definition !~
       'from public\.employees employee_row[[:space:]]+where employee_row\.id in \(p_source_employee_id, p_target_employee_id\)[[:space:]]+order by employee_row\.id[[:space:]]+for update' then
    raise exception '담당업무 trigger와 짝을 이루는 Employee Master FOR UPDATE 잠금이 누락되었습니다.';
  end if;

  if has_function_privilege(
       'anon',
       'public.assert_active_assignment_employee(jsonb,text)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.assert_active_assignment_employee(jsonb,text)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.assert_active_assignment_employee(jsonb,text)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.enforce_active_assignment_employee()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.enforce_active_assignment_employee()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.enforce_active_assignment_employee()'::regprocedure,
       'EXECUTE'
     ) then
    raise exception '담당업무 trigger 내부 함수에 직접 EXECUTE 권한이 열려 있습니다.';
  end if;

  for v_table in
    select class_row.oid as table_oid,
           class_row.relname as table_name,
           assignment_attribute.attnum as assignment_attnum
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    join pg_catalog.pg_attribute assignment_attribute
      on assignment_attribute.attrelid = class_row.oid
     and assignment_attribute.attname = 'assigned_employee_id'
     and assignment_attribute.atttypid = 'uuid'::pg_catalog.regtype
     and assignment_attribute.attnum > 0
     and not assignment_attribute.attisdropped
    where namespace_row.nspname = 'public'
      and class_row.relkind in ('r', 'p')
      and class_row.relname in (
        'customers',
        'quotes',
        'customer_schedules',
        'project_process_schedules',
        'projects',
        'contracts',
        'employee_tasks',
        'customer_quotes',
        'schedule_alert_events'
      )
    order by class_row.relname
  loop
    if v_table.table_name = 'schedule_alert_events'
       and not exists (
         select 1
         from pg_catalog.pg_attribute status_attribute
         where status_attribute.attrelid = v_table.table_oid
           and status_attribute.attname = 'status'
           and status_attribute.atttypid = 'text'::pg_catalog.regtype
           and status_attribute.attnum > 0
           and not status_attribute.attisdropped
           and status_attribute.attnotnull
       ) then
      raise exception 'schedule_alert_events.status 필수 계약이 누락되었습니다.';
    end if;

    if (
      select count(*)
      from pg_catalog.pg_trigger trigger_row
      join pg_catalog.pg_proc trigger_function
        on trigger_function.oid = trigger_row.tgfoid
      where trigger_row.tgrelid = v_table.table_oid
        and trigger_row.tgname = 'assignment_employee_guard'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled in ('O', 'A')
        and trigger_row.tgqual is null
        and trigger_function.oid =
          'public.enforce_active_assignment_employee()'::regprocedure
        and trigger_row.tgtype::integer = 23
        and pg_catalog.pg_get_triggerdef(trigger_row.oid)
          ilike '%assigned_employee_id%'
        and not exists (
          select 1
          from pg_catalog.pg_attribute guarded_attribute
          where guarded_attribute.attrelid = v_table.table_oid
            and (
              guarded_attribute.attname in (
                'assigned_employee_id',
                'company_id',
                'customer_id',
                'project_id',
                'quote_id',
                'deleted_at'
              )
              or (
                v_table.table_name = 'schedule_alert_events'
                and guarded_attribute.attname = 'status'
              )
            )
            and guarded_attribute.attnum > 0
            and not guarded_attribute.attisdropped
            and not (
              guarded_attribute.attnum = any(trigger_row.tgattr)
            )
        )
        and not exists (
          select 1
          from pg_catalog.pg_attribute actual_attribute
          where actual_attribute.attrelid = v_table.table_oid
            and actual_attribute.attnum = any(trigger_row.tgattr)
            and not (
              actual_attribute.attname in (
                'assigned_employee_id',
                'company_id',
                'customer_id',
                'project_id',
                'quote_id',
                'deleted_at'
              )
              or (
                v_table.table_name = 'schedule_alert_events'
                and actual_attribute.attname = 'status'
              )
            )
        )
    ) <> 1 then
      raise exception '담당업무 직원 guard trigger가 누락 또는 비정상입니다: %',
        v_table.table_name;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = v_table.table_oid
        and constraint_row.contype = 'f'
        and constraint_row.convalidated
        and constraint_row.confrelid = 'public.employees'::regclass
        and pg_catalog.cardinality(constraint_row.conkey) = 1
        and pg_catalog.cardinality(constraint_row.confkey) = 1
        and constraint_row.conkey[1] = v_table.assignment_attnum
        and constraint_row.confkey[1] = (
          select employee_id_attribute.attnum
          from pg_catalog.pg_attribute employee_id_attribute
          where employee_id_attribute.attrelid = 'public.employees'::regclass
            and employee_id_attribute.attname = 'id'
            and employee_id_attribute.attnum > 0
            and not employee_id_attribute.attisdropped
        )
    ) then
      raise exception '담당업무 직원 FK가 누락되었습니다: %', v_table.table_name;
    end if;

    execute pg_catalog.format(
      'select coalesce(pg_catalog.bool_and(public.assert_active_assignment_employee(pg_catalog.to_jsonb(row_data), %L)), true) from public.%I row_data where assigned_employee_id is not null',
      v_table.table_name,
      v_table.table_name
    ) into v_preflight_ok;
    if not v_preflight_ok then
      raise exception '담당업무 직원 정합성 verifier가 실패했습니다: %',
        v_table.table_name;
    end if;
  end loop;

  if (
    select count(*)
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    join pg_catalog.pg_attribute assignment_attribute
      on assignment_attribute.attrelid = class_row.oid
     and assignment_attribute.attname = 'assigned_employee_id'
     and assignment_attribute.atttypid = 'uuid'::pg_catalog.regtype
     and assignment_attribute.attnum > 0
     and not assignment_attribute.attisdropped
    where namespace_row.nspname = 'public'
      and class_row.relkind in ('r', 'p')
      and class_row.relname in (
        'customers',
        'quotes',
        'customer_schedules',
        'project_process_schedules',
        'projects',
        'contracts',
        'schedule_alert_events'
      )
  ) <> 7 then
    raise exception '필수 운영 담당업무 테이블 또는 assigned_employee_id가 누락되었습니다.';
  end if;
end;
$assignment_guard_verification$;

do $contract_lifecycle_scope_verification$
declare
  v_contracts_oid regclass := pg_catalog.to_regclass('public.contracts');
  v_function_oid regprocedure := pg_catalog.to_regprocedure(
    'public.confirm_contract_lifecycle_child(uuid,text)'
  );
  v_create_function_oid regprocedure := pg_catalog.to_regprocedure(
    'public.create_contract_lifecycle_child(uuid,jsonb,text)'
  );
  v_original_function_oid regprocedure := pg_catalog.to_regprocedure(
    'public.confirm_contract(uuid)'
  );
  v_definition text;
  v_create_definition text;
  v_original_definition text;
  v_relation record;
  v_table_name text;
  v_child_oid regclass;
  v_parent_oid regclass;
  v_expected_child smallint[];
  v_expected_parent smallint[];
  v_wrapper_signature text;
begin
  if v_contracts_oid is null then
    return;
  end if;

  if v_function_oid is not null then
    select pg_catalog.lower(pg_catalog.pg_get_functiondef(function_row.oid))
    into v_definition
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_function_oid
      and function_row.prosecdef
      and function_row.provolatile = 'v'
      and function_row.proconfig is not distinct from
        array['search_path=""']::text[];

    if v_definition is null
       or position('from public.contracts child_row' in v_definition) = 0
       or position('from public.contracts root_row' in v_definition) = 0
       or position('for update' in v_definition) = 0
       or position(
         'v_root.contract_kind is distinct from ''original'''
         in v_definition
       ) = 0
       or position(
         'v_child.parent_contract_id is distinct from v_root.id'
         in v_definition
       ) = 0
       or position(
         'v_root.company_id is distinct from v_child.company_id'
         in v_definition
       ) = 0
       or position(
         'v_root.customer_id is distinct from v_child.customer_id'
         in v_definition
       ) = 0
       or position(
         'v_root.project_id is distinct from v_child.project_id'
         in v_definition
       ) = 0
       or position(
         'v_root.status is distinct from ('
         in v_definition
       ) = 0
       or position(
         'when p_kind = ''amendment'' then ''amending'''
         in v_definition
       ) = 0
       or position('else ''adding''' in v_definition) = 0
       or position(
         'not public.can_access_customer(v_child.customer_id)'
         in v_definition
       ) = 0 then
      raise exception '계약 확정 RPC의 root tenant 잠금·대조 계약이 올바르지 않습니다.';
    end if;

    if pg_catalog.has_function_privilege(
         'anon', v_function_oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'authenticated', v_function_oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'service_role', v_function_oid, 'EXECUTE'
       ) then
      raise exception '내부 계약 확정 helper에 직접 EXECUTE 권한이 열려 있습니다.';
    end if;

    foreach v_wrapper_signature in array array[
      'public.confirm_contract_amendment(uuid)',
      'public.confirm_contract_addition(uuid)'
    ]
    loop
      if pg_catalog.to_regprocedure(v_wrapper_signature) is null
         or not pg_catalog.has_function_privilege(
           'authenticated', v_wrapper_signature, 'EXECUTE'
         )
         or pg_catalog.has_function_privilege(
           'anon', v_wrapper_signature, 'EXECUTE'
         )
         or pg_catalog.has_function_privilege(
           'service_role', v_wrapper_signature, 'EXECUTE'
         ) then
        raise exception '계약 확정 wrapper ACL이 올바르지 않습니다: %',
          v_wrapper_signature;
      end if;
    end loop;
  end if;

  if v_create_function_oid is not null then
    select pg_catalog.lower(pg_catalog.pg_get_functiondef(function_row.oid))
    into v_create_definition
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_create_function_oid
      and function_row.prosecdef
      and function_row.provolatile = 'v'
      and function_row.proconfig is not distinct from
        array['search_path=""']::text[];

    if v_create_definition is null
       or position('from public.contracts root_row' in v_create_definition) = 0
       or position('for update' in v_create_definition) = 0
       or position(
         'v_root.contract_kind is distinct from ''original'''
         in v_create_definition
       ) = 0
       or position(
         'v_root.status not in (''confirmed'', ''active'')'
         in v_create_definition
       ) = 0
       or position('from public.contracts pending_child' in v_create_definition) = 0
       or position(
         'pending_child.status = ''draft'''
         in v_create_definition
       ) = 0
       or position(
         'not public.can_access_customer(v_root.customer_id)'
         in v_create_definition
       ) = 0
       or pg_catalog.has_function_privilege(
         'anon', v_create_function_oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'authenticated', v_create_function_oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'service_role', v_create_function_oid, 'EXECUTE'
       ) then
      raise exception '계약 변경안 생성 helper의 root 상태·ACL 계약이 올바르지 않습니다.';
    end if;

    foreach v_wrapper_signature in array array[
      'public.create_contract_amendment(uuid,jsonb)',
      'public.create_contract_addition(uuid,jsonb)'
    ]
    loop
      if pg_catalog.to_regprocedure(v_wrapper_signature) is null
         or not pg_catalog.has_function_privilege(
           'authenticated', v_wrapper_signature, 'EXECUTE'
         )
         or pg_catalog.has_function_privilege(
           'anon', v_wrapper_signature, 'EXECUTE'
         )
         or pg_catalog.has_function_privilege(
           'service_role', v_wrapper_signature, 'EXECUTE'
         ) then
        raise exception '계약 변경안 생성 wrapper ACL이 올바르지 않습니다: %',
          v_wrapper_signature;
      end if;
    end loop;
  end if;

  if v_original_function_oid is not null then
    select pg_catalog.lower(pg_catalog.pg_get_functiondef(function_row.oid))
    into v_original_definition
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_original_function_oid
      and function_row.prosecdef
      and function_row.provolatile = 'v'
      and function_row.proconfig is not distinct from
        array['search_path=""']::text[];

    if v_original_definition is null
       or position(
         'from public.contracts contract_row'
         in v_original_definition
       ) = 0
       or position('for update' in v_original_definition) = 0
       or position(
         'v_contract.contract_kind is distinct from ''original'''
         in v_original_definition
       ) = 0
       or position(
         'v_contract.root_contract_id is not null'
         in v_original_definition
       ) = 0
       or position(
         'v_contract.parent_contract_id is not null'
         in v_original_definition
       ) = 0
       or position(
         'not public.can_access_customer(v_contract.customer_id)'
         in v_original_definition
       ) = 0
       or not pg_catalog.has_function_privilege(
         'authenticated', v_original_function_oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'anon', v_original_function_oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'service_role', v_original_function_oid, 'EXECUTE'
       ) then
      raise exception '원계약 확정 RPC의 kind·root·ACL 계약이 올바르지 않습니다.';
    end if;
  end if;

  if pg_catalog.has_table_privilege(
       'anon', v_contracts_oid, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon', v_contracts_oid, 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon', v_contracts_oid, 'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', v_contracts_oid, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', v_contracts_oid, 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', v_contracts_oid, 'DELETE'
     ) then
    raise exception 'contracts 직접 INSERT/UPDATE/DELETE 권한이 열려 있습니다.';
  end if;

  foreach v_table_name in array array[
    'execution_budgets',
    'execution_budget_items'
  ]
  loop
    v_child_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table_name)
    );
    if v_child_oid is not null
       and (
         pg_catalog.has_table_privilege(
           'anon', v_child_oid, 'INSERT'
         )
         or pg_catalog.has_table_privilege(
           'anon', v_child_oid, 'UPDATE'
         )
         or pg_catalog.has_table_privilege(
           'anon', v_child_oid, 'DELETE'
         )
         or pg_catalog.has_table_privilege(
           'authenticated', v_child_oid, 'INSERT'
         )
         or pg_catalog.has_table_privilege(
           'authenticated', v_child_oid, 'UPDATE'
         )
         or pg_catalog.has_table_privilege(
           'authenticated', v_child_oid, 'DELETE'
         )
       ) then
      raise exception '실행예산 직접 DML 권한이 열려 있습니다: %',
        v_table_name;
    end if;
  end loop;

  for v_relation in
    select *
    from (values
      (
        'contracts_root_tenant_scope_fkey'::text,
        'contracts'::text,
        'root_contract_id,company_id,customer_id,project_id'::text,
        'contracts'::text,
        'id,company_id,customer_id,project_id'::text
      ),
      (
        'contracts_parent_tenant_scope_fkey',
        'contracts',
        'parent_contract_id,company_id,customer_id,project_id',
        'contracts',
        'id,company_id,customer_id,project_id'
      ),
      (
        'quotes_customer_company_scope_fkey',
        'quotes',
        'customer_id,company_id',
        'customers',
        'id,company_id'
      ),
      (
        'contracts_customer_company_scope_fkey',
        'contracts',
        'customer_id,company_id',
        'customers',
        'id,company_id'
      ),
      (
        'contracts_project_customer_scope_fkey',
        'contracts',
        'project_id,customer_id',
        'projects',
        'id,customer_id'
      ),
      (
        'contracts_quote_customer_company_scope_fkey',
        'contracts',
        'quote_id,customer_id,company_id',
        'quotes',
        'id,customer_id,company_id'
      ),
      (
        'execution_budgets_contract_scope_fkey',
        'execution_budgets',
        'contract_id,company_id,customer_id,project_id',
        'contracts',
        'id,company_id,customer_id,project_id'
      ),
      (
        'execution_budget_items_budget_company_scope_fkey',
        'execution_budget_items',
        'execution_budget_id,company_id',
        'execution_budgets',
        'id,company_id'
      )
    ) as relation_row(
      constraint_name,
      child_table,
      child_columns,
      parent_table,
      parent_columns
    )
  loop
    v_child_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_relation.child_table)
    );
    v_parent_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_relation.parent_table)
    );

    if v_child_oid is null
       and v_relation.constraint_name in (
         'execution_budgets_contract_scope_fkey',
         'execution_budget_items_budget_company_scope_fkey'
       ) then
      continue;
    end if;
    if v_child_oid is null or v_parent_oid is null then
      raise exception '계약 tenant graph 테이블이 누락되었습니다: % -> %',
        v_relation.child_table,
        v_relation.parent_table;
    end if;

    select pg_catalog.array_agg(
             attribute_row.attnum::smallint
             order by column_row.ordinality
           )
    into v_expected_child
    from pg_catalog.unnest(
      pg_catalog.string_to_array(v_relation.child_columns, ',')
    ) with ordinality column_row(column_name, ordinality)
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = v_child_oid
     and attribute_row.attname = column_row.column_name
     and attribute_row.attnum > 0
     and not attribute_row.attisdropped;

    select pg_catalog.array_agg(
             attribute_row.attnum::smallint
             order by column_row.ordinality
           )
    into v_expected_parent
    from pg_catalog.unnest(
      pg_catalog.string_to_array(v_relation.parent_columns, ',')
    ) with ordinality column_row(column_name, ordinality)
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = v_parent_oid
     and attribute_row.attname = column_row.column_name
     and attribute_row.attnum > 0
     and not attribute_row.attisdropped;

    if v_function_oid is null
       and v_relation.constraint_name in (
         'contracts_root_tenant_scope_fkey',
         'contracts_parent_tenant_scope_fkey'
       )
       and pg_catalog.cardinality(v_expected_child) < 4 then
      continue;
    end if;

    if pg_catalog.cardinality(v_expected_child) <>
         pg_catalog.cardinality(
           pg_catalog.string_to_array(v_relation.child_columns, ',')
         )
       or pg_catalog.cardinality(v_expected_parent) <>
         pg_catalog.cardinality(
           pg_catalog.string_to_array(v_relation.parent_columns, ',')
         )
       or (
         select count(*)
         from pg_catalog.pg_constraint constraint_row
         where constraint_row.conname = v_relation.constraint_name
           and constraint_row.conrelid = v_child_oid
           and constraint_row.confrelid = v_parent_oid
           and constraint_row.contype = 'f'
           and constraint_row.convalidated
           and constraint_row.conkey::smallint[] = v_expected_child
           and constraint_row.confkey::smallint[] = v_expected_parent
       ) <> 1 then
      raise exception '계약 lifecycle tenant FK가 누락 또는 비정상입니다: %',
        v_relation.constraint_name;
    end if;
  end loop;
end;
$contract_lifecycle_scope_verification$;

do $customer_token_scope_verification$
declare
  v_assert_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.assert_customer_access_token_scope(jsonb)'::regprocedure
  ));
  v_enforce_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.enforce_customer_access_token_scope()'::regprocedure
  ));
  v_runtime_oid regprocedure := pg_catalog.to_regprocedure(
    'public._assert_material_token(text)'
  );
  v_runtime_definition text;
  v_table_oid oid := pg_catalog.to_regclass('public.customer_access_tokens');
  v_preflight_ok boolean;
begin
  if position('public.projects' in v_assert_definition) = 0
     or position('project_row.customer_id = $2' in v_assert_definition) = 0
     or position('public.customers' in v_assert_definition) = 0
     or position('public.project_material_sets' in v_assert_definition) = 0
     or position('set_row.project_id = $2' in v_assert_definition) = 0
     or position('set_row.customer_id = $3' in v_assert_definition) = 0
     or position('for share' in v_assert_definition) = 0
     or position('deleted_at is null' in v_assert_definition) = 0 then
    raise exception '고객 포털 토큰의 고객·프로젝트·선택안 잠금 계약이 올바르지 않습니다.';
  end if;
  if position('public.assert_customer_access_token_scope' in v_enforce_definition) = 0
     or position('pg_catalog.to_jsonb(new)' in v_enforce_definition) = 0 then
    raise exception '고객 포털 토큰 trigger wrapper가 NEW 행을 검증하지 않습니다.';
  end if;

  if has_function_privilege(
       'anon',
       'public.assert_customer_access_token_scope(jsonb)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.assert_customer_access_token_scope(jsonb)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.assert_customer_access_token_scope(jsonb)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.enforce_customer_access_token_scope()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.enforce_customer_access_token_scope()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.enforce_customer_access_token_scope()'::regprocedure,
       'EXECUTE'
     ) then
    raise exception '고객 포털 토큰 trigger 내부 함수에 직접 EXECUTE 권한이 열려 있습니다.';
  end if;

  if v_table_oid is not null then
    if (
      select count(*)
      from pg_catalog.pg_attribute attribute_row
      where attribute_row.attrelid = v_table_oid
        and attribute_row.attname in ('customer_id', 'project_id')
        and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
        and attribute_row.attnotnull
    ) <> 2 then
      raise exception 'customer_access_tokens 고객·프로젝트 필수 컬럼 계약이 누락되었습니다.';
    end if;

    if (
      select count(*)
      from pg_catalog.pg_trigger trigger_row
      join pg_catalog.pg_proc trigger_function
        on trigger_function.oid = trigger_row.tgfoid
      where trigger_row.tgrelid = v_table_oid
        and trigger_row.tgname = 'customer_access_token_scope_guard'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled in ('O', 'A')
        and trigger_row.tgqual is null
        and trigger_function.oid =
          'public.enforce_customer_access_token_scope()'::regprocedure
        and trigger_row.tgtype::integer = 23
        and not exists (
          select 1
          from pg_catalog.pg_attribute expected_attribute
          where expected_attribute.attrelid = v_table_oid
            and expected_attribute.attname in (
              'customer_id', 'project_id', 'set_id'
            )
            and expected_attribute.attnum > 0
            and not expected_attribute.attisdropped
            and not (expected_attribute.attnum = any(trigger_row.tgattr))
        )
        and not exists (
          select 1
          from pg_catalog.pg_attribute actual_attribute
          where actual_attribute.attrelid = v_table_oid
            and actual_attribute.attnum = any(trigger_row.tgattr)
            and actual_attribute.attname not in (
              'customer_id', 'project_id', 'set_id'
            )
        )
    ) <> 1 then
      raise exception '고객 포털 토큰 scope guard trigger가 누락 또는 비정상입니다.';
    end if;

    execute '
      select coalesce(
        pg_catalog.bool_and(
          public.assert_customer_access_token_scope(
            pg_catalog.to_jsonb(token_row)
          )
        ),
        true
      )
      from public.customer_access_tokens token_row'
    into v_preflight_ok;
    if not v_preflight_ok then
      raise exception '고객 포털 토큰 scope verifier가 실패했습니다.';
    end if;
  end if;

  if v_runtime_oid is not null then
    select pg_catalog.lower(pg_get_functiondef(function_row.oid))
    into v_runtime_definition
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_runtime_oid
      and function_row.prosecdef
      and function_row.provolatile = 'v'
      and function_row.proconfig is not distinct from
        array['search_path=""']::text[];

    if v_runtime_definition is null
       or position(
         'public.assert_customer_access_token_scope'
         in v_runtime_definition
       ) = 0
       or position('pg_catalog.to_jsonb(v_token)' in v_runtime_definition) = 0
       or position('returning * into v_token' in v_runtime_definition) = 0
       or position('token = p_token' in v_runtime_definition) = 0
       or position(
         'customer_id = v_token.customer_id'
         in v_runtime_definition
       ) = 0
       or position(
         'project_id = v_token.project_id'
         in v_runtime_definition
       ) = 0
       or position(
         'set_id is not distinct from v_token.set_id'
         in v_runtime_definition
       ) = 0
       or has_function_privilege('anon', v_runtime_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_runtime_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_runtime_oid, 'EXECUTE') then
      raise exception '고객 포털 token runtime scope·ACL 계약이 올바르지 않습니다.';
    end if;
  end if;
end;
$customer_token_scope_verification$;

do $material_scope_relation_verification$
declare
  v_contract record;
  v_relation record;
  v_table_oid regclass;
  v_missing_columns text[];
begin
  for v_contract in
    select *
    from (values
      ('customers'::text, 'id,company_id'::text),
      ('projects', 'id,customer_id,company_id'),
      ('project_material_sets', 'id,customer_id,project_id'),
      ('project_materials', 'id,customer_id,project_id,company_id'),
      ('customer_access_tokens', 'id,customer_id,project_id'),
      ('material_approvals', 'id,material_id,customer_id,project_id'),
      ('material_comments', 'id,material_id,customer_id,project_id'),
      ('material_change_requests', 'id,customer_id,project_id'),
      ('material_approval_versions', 'id,set_id,customer_id,project_id')
    ) as contract_row(table_name, required_columns)
  loop
    v_table_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_contract.table_name)
    );
    if v_table_oid is not null then
      select pg_catalog.array_agg(column_name order by column_name)
      into v_missing_columns
      from pg_catalog.unnest(
        pg_catalog.string_to_array(v_contract.required_columns, ',')
      ) column_name
      where not exists (
        select 1
        from pg_catalog.pg_attribute attribute_row
        where attribute_row.attrelid = v_table_oid
          and attribute_row.attname = column_name
          and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
          and attribute_row.attnum > 0
          and not attribute_row.attisdropped
      );
      if v_missing_columns is not null then
        raise exception '자재 tenant 관계 필수 컬럼 verifier 실패: %.%',
          v_contract.table_name,
          v_missing_columns;
      end if;
    end if;
  end loop;

  for v_relation in
    select *
    from (values
      ('projects'::text, 'projects_customer_company_scope_fkey'::text,
       'customer_id,company_id'::text, 'customers'::text,
       'id,company_id'::text),
      ('project_material_sets',
       'project_material_sets_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('project_materials',
       'project_materials_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('project_materials',
       'project_materials_customer_company_scope_fkey',
       'customer_id,company_id', 'customers', 'id,company_id'),
      ('project_materials', 'project_materials_set_scope_fkey',
       'set_id,project_id,customer_id', 'project_material_sets',
       'id,project_id,customer_id'),
      ('customer_access_tokens',
       'customer_access_tokens_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('customer_access_tokens', 'customer_access_tokens_set_scope_fkey',
       'set_id,project_id,customer_id', 'project_material_sets',
       'id,project_id,customer_id'),
      ('material_approvals', 'material_approvals_material_scope_fkey',
       'material_id,project_id,customer_id', 'project_materials',
       'id,project_id,customer_id'),
      ('material_approvals', 'material_approvals_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('material_approvals', 'material_approvals_token_scope_fkey',
       'access_token_id,project_id,customer_id', 'customer_access_tokens',
       'id,project_id,customer_id'),
      ('material_comments', 'material_comments_material_scope_fkey',
       'material_id,project_id,customer_id', 'project_materials',
       'id,project_id,customer_id'),
      ('material_comments', 'material_comments_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('material_comments', 'material_comments_token_scope_fkey',
       'access_token_id,project_id,customer_id', 'customer_access_tokens',
       'id,project_id,customer_id'),
      ('material_change_requests',
       'material_change_requests_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('material_change_requests', 'material_change_requests_set_scope_fkey',
       'set_id,project_id,customer_id', 'project_material_sets',
       'id,project_id,customer_id'),
      ('material_change_requests', 'material_change_requests_token_scope_fkey',
       'access_token_id,project_id,customer_id', 'customer_access_tokens',
       'id,project_id,customer_id'),
      ('material_approval_versions',
       'material_approval_versions_set_scope_fkey',
       'set_id,project_id,customer_id', 'project_material_sets',
       'id,project_id,customer_id'),
      ('material_approval_versions',
       'material_approval_versions_project_customer_scope_fkey',
       'project_id,customer_id', 'projects', 'id,customer_id'),
      ('material_approval_versions',
       'material_approval_versions_token_scope_fkey',
       'access_token_id,project_id,customer_id', 'customer_access_tokens',
       'id,project_id,customer_id')
    ) as relation_row(
      child_table, constraint_name, child_columns,
      parent_table, parent_columns
    )
  loop
    if pg_catalog.to_regclass(
         pg_catalog.format('public.%I', v_relation.child_table)
       ) is not null
       and pg_catalog.to_regclass(
         pg_catalog.format('public.%I', v_relation.parent_table)
       ) is not null
       and not exists (
         select 1
         from pg_catalog.unnest(
           pg_catalog.string_to_array(v_relation.child_columns, ',')
         ) column_name
         where not exists (
           select 1
           from pg_catalog.pg_attribute attribute_row
           where attribute_row.attrelid = pg_catalog.to_regclass(
                   pg_catalog.format('public.%I', v_relation.child_table)
                 )
             and attribute_row.attname = column_name
             and attribute_row.attnum > 0
             and not attribute_row.attisdropped
         )
       ) then
      if (
        select count(*)
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = pg_catalog.to_regclass(
                pg_catalog.format('public.%I', v_relation.child_table)
              )
          and constraint_row.conname = v_relation.constraint_name
          and constraint_row.contype = 'f'
          and constraint_row.convalidated
          and constraint_row.confrelid = pg_catalog.to_regclass(
                pg_catalog.format('public.%I', v_relation.parent_table)
              )
          and (
            select pg_catalog.array_agg(
                     child_attribute.attname::text order by key_row.ordinality
                   )
            from pg_catalog.unnest(constraint_row.conkey)
              with ordinality key_row(attnum, ordinality)
            join pg_catalog.pg_attribute child_attribute
              on child_attribute.attrelid = constraint_row.conrelid
             and child_attribute.attnum = key_row.attnum
          ) = pg_catalog.string_to_array(v_relation.child_columns, ',')
          and (
            select pg_catalog.array_agg(
                     parent_attribute.attname::text order by key_row.ordinality
                   )
            from pg_catalog.unnest(constraint_row.confkey)
              with ordinality key_row(attnum, ordinality)
            join pg_catalog.pg_attribute parent_attribute
              on parent_attribute.attrelid = constraint_row.confrelid
             and parent_attribute.attnum = key_row.attnum
          ) = pg_catalog.string_to_array(v_relation.parent_columns, ',')
      ) <> 1 then
        raise exception '자재 tenant 복합 FK가 누락 또는 비정상입니다: %.%',
          v_relation.child_table,
          v_relation.constraint_name;
      end if;
    end if;
  end loop;
end;
$material_scope_relation_verification$;

do $$
declare
  v_contact_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.update_employee_contact_profile(uuid,text,text,text,text,boolean,boolean)'::regprocedure
  ));
  v_update_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.update_employee_master(uuid,text,uuid,text,text,text,boolean)'::regprocedure
  ));
  v_merge_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.merge_employees(uuid,uuid,uuid,text)'::regprocedure
  ));
  v_storage_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.can_write_employee_business_card(text)'::regprocedure
  ));
  v_transfer_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.transfer_employee_assignments(uuid,uuid)'::regprocedure
  ));
  v_project_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.can_access_project(uuid)'::regprocedure
  ));
  v_quote_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.can_access_quote(uuid)'::regprocedure
  ));
  v_material_object_definition text := pg_catalog.lower(pg_get_functiondef(
    'public.can_access_project_material_object(text)'::regprocedure
  ));
begin
  if v_contact_definition ilike '%public.is_admin(%'
     or position(
       'v_company_role in (''owner'', ''director'', ''admin'')'
       in v_contact_definition
     ) = 0
     or position(
       'v_my_employee_id is distinct from p_employee_id'
       in v_contact_definition
     ) = 0 then
    raise exception '직원 연락처 RPC의 회사 역할·본인 범위 계약이 올바르지 않습니다.';
  end if;
  if position(
       'coalesce(p_clear_business_card, false)'
       in v_contact_definition
     ) = 0 then
    raise exception '명함 삭제 플래그의 explicit NULL 방어가 누락되었습니다.';
  end if;

  if position('p_is_active is null' in v_update_definition) = 0
     or position(
       'membership_row.role in (''owner'', ''director'')'
       in v_update_definition
     ) = 0
     or position(
       'profile_row.role = ''super_admin'''
       in v_update_definition
     ) = 0 then
    raise exception '직원 비활성화 RPC의 NULL·상위계정 보호 계약이 누락되었습니다.';
  end if;

  if position('p_other_login_action is null' in v_merge_definition) = 0 then
    raise exception '직원 병합 로그인 처리의 explicit NULL 방어가 누락되었습니다.';
  end if;
  if position(
       'coalesce(v_source_profile.role, '''') = ''super_admin'''
       in v_merge_definition
     ) = 0
     or position(
       'coalesce(v_target_profile.role, '''') = ''super_admin'''
       in v_merge_definition
     ) = 0
     or position(
       'v_actor_company_role = ''admin'''
       in v_merge_definition
     ) = 0 then
    raise exception '병합의 super_admin·peer-admin 보호 계약이 누락되었습니다.';
  end if;

  if v_storage_definition ilike '%public.is_admin(%'
     or position(
       'v_role in (''owner'', ''director'', ''admin'')'
       in v_storage_definition
     ) = 0 then
    raise exception '명함 Storage 쓰기에 전역 관리자 우회가 남아 있습니다.';
  end if;

  if position('schedule_alert_events' in v_transfer_definition) = 0
     or position('status = ''''pending''''' in v_transfer_definition) = 0
     or position('has_company_id' in v_transfer_definition) = 0 then
    raise exception '담당업무 이전의 pending-alert·legacy tenantless 계약이 누락되었습니다.';
  end if;

  if position(
       'public.can_access_customer(project_row.customer_id)'
       in v_project_definition
     ) = 0
     or v_project_definition ilike '%public.is_admin(%' then
    raise exception '프로젝트 접근 helper의 현재 회사 고객 범위가 누락되었습니다.';
  end if;
  if position(
       'quote_row.company_id = public.current_company_id()'
       in v_quote_definition
     ) = 0 then
    raise exception '견적 접근 helper의 현재 회사 범위가 누락되었습니다.';
  end if;
  if position(
       'material_row.customer_id = v_customer_id'
       in v_material_object_definition
     ) = 0
     or position(
       'public.can_access_customer(v_customer_id)'
       in v_material_object_definition
     ) = 0 then
    raise exception '현장자재 Storage 경로의 고객·자재 결합 검증이 누락되었습니다.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relname in (
        'profiles',
        'employees',
        'teams',
        'employee_master_events',
        'employee_merge_logs'
      )
      and not class_row.relrowsecurity
  ) or (
    select count(*)
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relname in (
        'profiles',
        'employees',
        'teams',
        'employee_master_events',
        'employee_merge_logs'
      )
  ) <> 5 then
    raise exception '필수 Employee Master 테이블의 RLS가 비활성 또는 누락되었습니다.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_proc trigger_function
      on trigger_function.oid = trigger_row.tgfoid
    where trigger_row.tgrelid = 'public.employees'::regclass
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
      and (
        (trigger_row.tgname = 'employees_prevent_delete'
         and trigger_function.proname = 'prevent_employee_delete')
        or
        (trigger_row.tgname = 'employees_prevent_duplicate'
         and trigger_function.proname = 'prevent_employee_duplicate')
      )
  ) <> 2 then
    raise exception '직원 삭제·중복 방지 트리거가 누락 또는 비활성입니다.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class
      on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'public.profiles'::regclass
      and index_class.relname = 'profiles_employee_login_uidx'
      and index_row.indisunique
      and index_row.indisvalid
      and index_row.indisready
      and pg_catalog.pg_get_expr(
        index_row.indpred,
        index_row.indrelid
      ) ilike '%employee_id is not null%'
  ) then
    raise exception '직원별 단일 로그인 고유 인덱스가 누락 또는 비정상입니다.';
  end if;

  if has_table_privilege('authenticated', 'public.employees', 'INSERT')
     or has_table_privilege('authenticated', 'public.employees', 'UPDATE')
     or has_table_privilege('authenticated', 'public.employees', 'DELETE')
     or has_table_privilege('anon', 'public.employees', 'INSERT')
     or has_table_privilege('anon', 'public.employees', 'UPDATE')
     or has_table_privilege('anon', 'public.employees', 'DELETE') then
    raise exception '직원 테이블 직접 쓰기가 열려 있습니다. Employee Master RPC만 허용해야 합니다.';
  end if;

  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'employees'
      and (
        policy_row.policyname <> 'employees_select_erp'
        or policy_row.cmd <> 'SELECT'
        or coalesce(policy_row.qual, '') not ilike '%current_company_id%'
      )
  ) or (
    select count(*)
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'employees'
  ) <> 1 then
    raise exception '직원 정책은 회사 범위 SELECT 하나만 존재해야 합니다.';
  end if;

  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'teams'
      and policy_row.policyname in ('teams_write_admin', 'teams_select_erp')
      and (
        coalesce(policy_row.qual, '') ilike '%is_admin%'
        or coalesce(policy_row.with_check, '') ilike '%is_admin%'
        or (
          coalesce(policy_row.qual, '') not ilike '%current_company_id%'
          and coalesce(policy_row.with_check, '') not ilike '%current_company_id%'
        )
        or (
          policy_row.policyname = 'teams_write_admin'
          and
        coalesce(policy_row.qual, '') not ilike '%current_company_role%'
          and coalesce(policy_row.with_check, '') not ilike '%current_company_role%'
        )
      )
  ) then
    raise exception '팀 정책의 현재 회사 범위·역할 계약이 올바르지 않습니다.';
  end if;

  if (
    select count(*)
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'teams'
      and policy_row.policyname in ('teams_write_admin', 'teams_select_erp')
  ) <> 2 then
    raise exception '필수 팀 정책이 누락되었습니다.';
  end if;

  if exists (
    select 1
    from public.profiles profile_row
    join public.company_memberships membership_row
      on membership_row.user_id = profile_row.id
     and membership_row.company_id = profile_row.active_company_id
    left join public.employees employee_row
      on employee_row.id = profile_row.employee_id
    where profile_row.is_active = true
      and profile_row.is_approved = true
      and profile_row.approval_status = 'approved'
      and membership_row.status = 'active'
      and (
        profile_row.employee_id is distinct from membership_row.employee_id
        or (
          membership_row.employee_id is not null
          and employee_row.company_id is distinct from membership_row.company_id
        )
      )
  ) then
    raise exception '활성 로그인·멤버십·직원 회사 연결 불일치가 있습니다.';
  end if;
end;
$$;

-- is_admin is intentionally finalized in 070, after the tenant-policy cleanup
-- in the same transaction. The 060 verifier must not require this widened
-- company-role definition because a failed 070 must leave the legacy helper
-- untouched.
do $$
declare
  v_is_admin_oid regprocedure := to_regprocedure('public.is_admin()');
  v_definition text;
  v_config text[];
begin
  if v_is_admin_oid is null then
    raise exception '최종 is_admin() helper가 없습니다.';
  end if;

  select pg_catalog.lower(pg_get_functiondef(function_row.oid)),
         function_row.proconfig
  into v_definition, v_config
  from pg_proc function_row
  where function_row.oid = v_is_admin_oid
    and function_row.prosecdef
    and function_row.provolatile = 's';

  if v_definition is null
     or position('public.current_company_role()' in v_definition) = 0
     or v_definition ilike '%from public.profiles%'
     or v_definition ilike '%profile_row.role%'
     or v_config is distinct from array['search_path=""']::text[] then
    raise exception '최종 is_admin()의 현재 회사 역할·SECURITY DEFINER 계약이 올바르지 않습니다.';
  end if;

  if not has_function_privilege('anon', v_is_admin_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_is_admin_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_is_admin_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_proc function_row,
            lateral aclexplode(coalesce(
              function_row.proacl,
              acldefault('f', function_row.proowner)
            )) acl_row
       where function_row.oid = v_is_admin_oid
         and acl_row.grantee = 0
         and acl_row.privilege_type = 'EXECUTE'
     ) then
    raise exception '최종 is_admin() EXECUTE ACL이 올바르지 않습니다.';
  end if;
end;
$$;

-- Exact inventories are deliberate for tenantless tables: PostgreSQL combines
-- permissive policies with OR, so one stale broad policy would bypass the new
-- row-tenant predicate even when every newly-created policy is correct.
do $policy_verification$
declare
  v_names text[];
  v_expected_storage_names text[];
  v_has_mismatch boolean;
  v_policy_table record;
begin
  if exists (
    select 1
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relname in (
        'employee_tasks',
        'customer_quotes',
        'customer_quote_sends',
        'material_approvals',
        'projects',
        'project_materials',
        'material_images',
        'project_material_images',
        'material_comments',
        'customer_access_tokens',
        'material_change_requests',
        'project_material_sets',
        'material_approval_versions',
        'material_favorites'
      )
      and not class_row.relrowsecurity
  ) then
    raise exception 'tenant cleanup 대상 테이블 중 RLS가 비활성화된 테이블이 있습니다.';
  end if;

  if pg_catalog.to_regclass('public.employee_tasks') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'employee_tasks';

    if v_names is distinct from array[
      'staff_employee_tasks_insert',
      'staff_employee_tasks_select',
      'staff_employee_tasks_update'
    ]::text[] or exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'employee_tasks'
        and (
          pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_schedule_assignee%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_customer%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_project%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_quote%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) similar to '%(is_admin|created_by)%'
        )
    ) then
      raise exception '직원 할 일의 정확한 회사 범위 정책 inventory가 올바르지 않습니다.';
    end if;
  end if;

  if pg_catalog.to_regclass('public.customer_quotes') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'customer_quotes';

    if v_names is distinct from array[
      'customer_quotes_delete',
      'customer_quotes_insert',
      'customer_quotes_select',
      'customer_quotes_update'
    ]::text[] or exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'customer_quotes'
        and (
          pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_customer%'
          or (
            policy_row.policyname in ('customer_quotes_insert', 'customer_quotes_update')
            and pg_catalog.lower(coalesce(policy_row.with_check, ''))
              not like '%is_current_company_employee%'
          )
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) like '%is_admin%'
        )
    ) then
      raise exception '레거시 견적의 정확한 고객·직원 회사 정책 inventory가 올바르지 않습니다.';
    end if;

    execute $mismatch$
      select exists (
        select 1
        from public.customer_quotes quote_row
        join public.customers customer_row
          on customer_row.id = quote_row.customer_id
        join public.employees employee_row
          on employee_row.id = quote_row.assigned_employee_id
        where quote_row.assigned_employee_id is not null
          and customer_row.company_id is distinct from employee_row.company_id
      )
    $mismatch$ into v_has_mismatch;
    if v_has_mismatch then
      raise exception '레거시 견적 담당 직원의 회사 불일치가 남아 있습니다.';
    end if;
  end if;

  if pg_catalog.to_regclass('public.customer_quote_sends') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'customer_quote_sends';

    if v_names is distinct from array[
      'customer_quote_sends_delete',
      'customer_quote_sends_insert',
      'customer_quote_sends_select',
      'customer_quote_sends_update'
    ]::text[] or exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'customer_quote_sends'
        and (
          pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_customer%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) like '%is_admin%'
          or (
            policy_row.policyname in (
              'customer_quote_sends_update',
              'customer_quote_sends_delete'
            )
            and pg_catalog.lower(
              coalesce(policy_row.qual, '') || ' ' ||
              coalesce(policy_row.with_check, '')
            ) not like '%current_company_role%'
          )
        )
    ) then
      raise exception '견적 발송의 정확한 고객 회사 정책 inventory가 올바르지 않습니다.';
    end if;
  end if;

  if pg_catalog.to_regclass('public.material_images') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'material_images';

    if v_names is distinct from array[
      'material_images_delete',
      'material_images_insert',
      'material_images_select',
      'material_images_update'
    ]::text[] or exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'material_images'
        and pg_catalog.lower(
          coalesce(policy_row.qual, '') || ' ' ||
          coalesce(policy_row.with_check, '')
        ) not like '%can_access_customer%'
    ) then
      raise exception '자재 이미지의 정확한 고객 회사 정책 inventory가 올바르지 않습니다.';
    end if;
  end if;

  if pg_catalog.to_regclass('public.project_material_images') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'project_material_images';

    if v_names is distinct from array[
      'project_material_images_delete',
      'project_material_images_insert',
      'project_material_images_select',
      'project_material_images_update'
    ]::text[] or exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'project_material_images'
        and pg_catalog.lower(
          coalesce(policy_row.qual, '') || ' ' ||
          coalesce(policy_row.with_check, '')
        ) not like '%can_access_customer%'
    ) then
      raise exception '프로젝트 자재 이미지의 broad 병렬 정책이 남아 있습니다.';
    end if;
  end if;

  for v_policy_table in
    select *
    from (
      values
        (
          'material_approvals'::text,
          array[
            'material_approvals_insert',
            'material_approvals_select'
          ]::text[]
        ),
        (
          'material_comments'::text,
          array[
            'material_comments_insert',
            'material_comments_select'
          ]::text[]
        ),
        (
          'customer_access_tokens'::text,
          array[
            'customer_access_tokens_insert',
            'customer_access_tokens_select',
            'customer_access_tokens_update'
          ]::text[]
        ),
        (
          'material_change_requests'::text,
          array[
            'material_change_requests_staff_select',
            'material_change_requests_staff_update'
          ]::text[]
        ),
        (
          'project_material_sets'::text,
          array[
            'project_material_sets_insert',
            'project_material_sets_select',
            'project_material_sets_update'
          ]::text[]
        ),
        (
          'material_approval_versions'::text,
          array[
            'material_approval_versions_insert',
            'material_approval_versions_select'
          ]::text[]
        )
    ) as expected(table_name, policy_names)
  loop
    if pg_catalog.to_regclass(
         pg_catalog.format('public.%I', v_policy_table.table_name)
       ) is not null then
      select array_agg(policy_row.policyname::text order by policy_row.policyname)
      into v_names
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = v_policy_table.table_name;

      if v_names is distinct from v_policy_table.policy_names or exists (
        select 1
        from pg_policies policy_row
        where policy_row.schemaname = 'public'
          and policy_row.tablename = v_policy_table.table_name
          and pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_customer%'
      ) then
        raise exception '고객 범위 정책 exact inventory가 올바르지 않습니다: % (%)',
          v_policy_table.table_name,
          v_names;
      end if;
    end if;
  end loop;

  if pg_catalog.to_regclass('public.material_favorites') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'material_favorites';

    if v_names is distinct from array[
      'material_favorites_delete',
      'material_favorites_insert',
      'material_favorites_select',
      'material_favorites_update'
    ]::text[] or exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'material_favorites'
        and (
          pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%user_id%auth.uid%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) like '%is_admin%'
        )
    ) then
      raise exception '자재 즐겨찾기의 본인 전용 정책 inventory가 올바르지 않습니다.';
    end if;
  end if;

  if pg_catalog.to_regclass('public.projects') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'projects';

    if v_names is distinct from array[
      'projects_company_guard',
      'projects_delete',
      'projects_insert',
      'projects_select',
      'projects_update'
    ]::text[] or (
      select count(*)
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'projects'
        and policy_row.policyname in (
          'projects_select', 'projects_insert',
          'projects_update', 'projects_delete'
        )
        and pg_catalog.lower(
          coalesce(policy_row.qual, '') || ' ' ||
          coalesce(policy_row.with_check, '')
        ) like '%can_access_customer%'
    ) <> 4 or not exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'projects'
        and policy_row.policyname = 'projects_company_guard'
        and policy_row.permissive = 'RESTRICTIVE'
        and pg_catalog.lower(coalesce(policy_row.qual, ''))
          like '%current_company_id%'
        and pg_catalog.lower(coalesce(policy_row.with_check, ''))
          like '%current_company_id%'
    ) then
      raise exception '프로젝트의 고객 정책·RESTRICTIVE 회사 guard가 올바르지 않습니다.';
    end if;
  end if;

  if pg_catalog.to_regclass('public.project_materials') is not null then
    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'project_materials';

    if v_names is distinct from array[
      'project_materials_company_guard',
      'project_materials_delete',
      'project_materials_insert',
      'project_materials_select',
      'project_materials_update'
    ]::text[] or (
      select count(*)
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'project_materials'
        and policy_row.policyname in (
          'project_materials_select', 'project_materials_insert',
          'project_materials_update', 'project_materials_delete'
        )
        and pg_catalog.lower(
          coalesce(policy_row.qual, '') || ' ' ||
          coalesce(policy_row.with_check, '')
        ) like '%can_access_customer%'
    ) <> 4 or not exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'project_materials'
        and policy_row.policyname = 'project_materials_company_guard'
        and policy_row.permissive = 'RESTRICTIVE'
        and pg_catalog.lower(coalesce(policy_row.qual, ''))
          like '%current_company_id%'
        and pg_catalog.lower(coalesce(policy_row.with_check, ''))
          like '%current_company_id%'
    ) then
      raise exception '프로젝트 자재의 고객 정책·RESTRICTIVE 회사 guard가 올바르지 않습니다.';
    end if;
  end if;

  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename in (
        'employee_tasks',
        'customer_quotes',
        'customer_quote_sends',
        'material_approvals',
        'material_images',
        'project_material_images',
        'material_comments',
        'customer_access_tokens',
        'material_change_requests',
        'project_material_sets',
        'material_approval_versions',
        'material_favorites'
      )
      and (
        not (
          policy_row.roles @> array['authenticated']::name[]
          and pg_catalog.cardinality(policy_row.roles) = 1
        )
        or policy_row.cmd <> case
          when policy_row.policyname like '%_select' then 'SELECT'
          when policy_row.policyname like '%_insert' then 'INSERT'
          when policy_row.policyname like '%_update' then 'UPDATE'
          when policy_row.policyname like '%_delete' then 'DELETE'
        end
      )
  ) then
    raise exception 'tenant cleanup 대상 public 정책의 command/role 계약이 올바르지 않습니다.';
  end if;

  if pg_catalog.to_regclass('storage.objects') is not null then
    v_expected_storage_names := array[
      'employee_business_cards_delete',
      'employee_business_cards_insert',
      'employee_business_cards_select',
      'employee_business_cards_update',
      'quote_files_storage_delete_erp',
      'quote_files_storage_insert_erp',
      'quote_files_storage_select_erp',
      'quote_files_storage_update_erp',
      'staff_material_catalog_storage_delete',
      'staff_material_catalog_storage_insert',
      'staff_material_catalog_storage_select',
      'staff_material_catalog_storage_update'
    ]::text[];
    if pg_catalog.to_regprocedure(
         'public.quote_file_path_is_shared(text)'
       ) is not null then
      v_expected_storage_names := pg_catalog.array_append(
        v_expected_storage_names,
        'quote_files_shared_storage_select'
      );
    end if;
    if pg_catalog.to_regprocedure('public.storage_customer_id(text)')
       is not null then
      v_expected_storage_names := v_expected_storage_names || array[
        'customer_quotes_storage_delete',
        'customer_quotes_storage_insert',
        'customer_quotes_storage_select',
        'customer_quotes_storage_update'
      ]::text[];
    end if;
    if pg_catalog.to_regprocedure(
         'public.project_id_from_storage_path(text)'
       ) is not null then
      v_expected_storage_names := v_expected_storage_names || array[
        'v1_material_storage_delete',
        'v1_material_storage_insert',
        'v1_material_storage_select',
        'v1_material_storage_update'
      ]::text[];
    end if;

    select array_agg(policy_row.policyname::text order by policy_row.policyname)
    into v_names
    from pg_policies policy_row
    where policy_row.schemaname = 'storage'
      and policy_row.tablename = 'objects';

    if exists (
      select 1
      from pg_catalog.unnest(v_expected_storage_names) expected(policy_name)
      where not (expected.policy_name = any(coalesce(v_names, array[]::text[])))
    ) or exists (
      select 1
      from pg_catalog.unnest(coalesce(v_names, array[]::text[])) actual(policy_name)
      where not (actual.policy_name = any(v_expected_storage_names))
    ) then
      raise exception 'Storage 정책의 exact inventory가 올바르지 않습니다: %', v_names;
    end if;

    if exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and policy_row.cmd <> case
          when policy_row.policyname like '%select%' then 'SELECT'
          when policy_row.policyname like '%insert%' then 'INSERT'
          when policy_row.policyname like '%update%' then 'UPDATE'
          when policy_row.policyname like '%delete%' then 'DELETE'
        end
    ) then
      raise exception 'Storage 정책의 command 계약이 올바르지 않습니다.';
    end if;

    if exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and case
          when policy_row.policyname in (
            'employee_business_cards_select',
            'quote_files_shared_storage_select'
          ) then not (
            policy_row.roles @> array['anon', 'authenticated']::name[]
            and pg_catalog.cardinality(policy_row.roles) = 2
          )
          else not (
            policy_row.roles @> array['authenticated']::name[]
            and pg_catalog.cardinality(policy_row.roles) = 1
          )
        end
    ) then
      raise exception 'Storage 정책의 role 계약이 올바르지 않습니다.';
    end if;

    if exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and (
          policy_row.policyname like 'staff_project_materials_storage_%'
          or policy_row.policyname like 'material_images_storage_%'
        )
    ) then
      raise exception 'broad 프로젝트 자재 Storage 병렬 정책이 남아 있습니다.';
    end if;

    if exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and policy_row.policyname like 'customer_quotes_storage_%'
        and (
          pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%storage_customer_id%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_customer%'
        )
    ) then
      raise exception '견적 Storage 고객 경로 검증이 올바르지 않습니다.';
    end if;

    if exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and policy_row.policyname like 'staff_material_catalog_storage_%'
        and pg_catalog.lower(
          coalesce(policy_row.qual, '') || ' ' ||
          coalesce(policy_row.with_check, '')
        ) not like '%can_access_material_catalog%'
    ) then
      raise exception '자재 카탈로그 Storage 회사 경로 검증이 올바르지 않습니다.';
    end if;

    if exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and policy_row.policyname like 'v1_material_storage_%'
        and (
          pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) like '%material-catalog%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_project_material_object%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) not like '%can_access_project%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) like '%project_has_valid_material_token%'
          or pg_catalog.lower(
            coalesce(policy_row.qual, '') || ' ' ||
            coalesce(policy_row.with_check, '')
          ) like '%is_admin%'
          or (
            policy_row.policyname = 'v1_material_storage_update'
            and pg_catalog.lower(
              coalesce(policy_row.qual, '') || ' ' ||
              coalesce(policy_row.with_check, '')
            ) not like '%current_company_role%'
          )
        )
    ) then
      raise exception 'v1 자재 Storage의 bucket별 회사 경로 검증이 올바르지 않습니다.';
    end if;

  end if;
end;
$policy_verification$;

select count(*) as active_profile_membership_employee_mismatch_count
from public.profiles profile_row
join public.company_memberships membership_row
  on membership_row.user_id = profile_row.id
 and membership_row.company_id = profile_row.active_company_id
where profile_row.is_active = true
  and profile_row.is_approved = true
  and profile_row.approval_status = 'approved'
  and membership_row.status = 'active'
  and profile_row.employee_id is distinct from membership_row.employee_id;

select count(*) as linked_employee_company_mismatch_count
from public.profiles profile_row
join public.company_memberships membership_row
  on membership_row.user_id = profile_row.id
 and membership_row.company_id = profile_row.active_company_id
join public.employees employee_row
  on employee_row.id = profile_row.employee_id
where membership_row.status = 'active'
  and employee_row.company_id is distinct from membership_row.company_id;

select function_row.oid::regprocedure as function_name,
       function_row.prosecdef as security_definer,
       function_row.proconfig as function_config,
       has_function_privilege('authenticated', function_row.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('anon', function_row.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('service_role', function_row.oid, 'EXECUTE') as service_role_execute
from pg_proc function_row
where function_row.oid in (
  'public.list_employee_master()'::regprocedure,
  'public.create_employee_master(text,uuid,text,text,text)'::regprocedure,
  'public.update_employee_master(uuid,text,uuid,text,text,text,boolean)'::regprocedure,
  'public.transfer_employee_assignments(uuid,uuid)'::regprocedure,
  'public.unlink_employee_login(uuid)'::regprocedure,
  'public.update_employee_login_role(uuid,text)'::regprocedure,
  'public.get_employee_merge_impact(uuid,uuid)'::regprocedure,
  'public.merge_employees(uuid,uuid,uuid,text)'::regprocedure,
  'public.list_employee_merge_states()'::regprocedure,
  'public.update_employee_contact_profile(uuid,text,text,text,text,boolean,boolean)'::regprocedure
)
order by 1;
