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
      and (
        not function_row.prosecdef
        or function_row.proconfig is distinct from array['search_path=""']::text[]
      )
  ) then
    raise exception 'SECURITY DEFINER/search_path 계약을 충족하지 않는 Employee Master RPC가 있습니다.';
  end if;
end;
$$;

do $$
declare
  v_contact_definition text := pg_get_functiondef(
    'public.update_employee_contact_profile(uuid,text,text,text,text,boolean,boolean)'::regprocedure
  );
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

  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename in ('employees', 'teams')
      and policy_row.policyname in (
        'employees_select_erp',
        'employees_insert_admin',
        'employees_update_admin',
        'employees_delete_admin',
        'teams_write_admin',
        'teams_select_erp'
      )
      and (
        coalesce(policy_row.qual, '') ilike '%is_admin%'
        or coalesce(policy_row.with_check, '') ilike '%is_admin%'
        or (
          coalesce(policy_row.qual, '') not ilike '%current_company_id%'
          and coalesce(policy_row.with_check, '') not ilike '%current_company_id%'
        )
      )
  ) then
    raise exception '직원·팀 직접 쓰기 정책에 전역 관리자 우회 또는 회사 역할 누락이 있습니다.';
  end if;

  if (
    select count(*)
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and (
        (policy_row.tablename = 'employees' and policy_row.policyname in (
          'employees_select_erp',
          'employees_insert_admin',
          'employees_update_admin',
          'employees_delete_admin'
        ))
        or (
          policy_row.tablename = 'teams'
          and policy_row.policyname in ('teams_write_admin', 'teams_select_erp')
        )
      )
  ) <> 6 then
    raise exception '필수 직원·팀 직접 쓰기 정책이 누락되었습니다.';
  end if;

  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.policyname in (
        'employees_insert_admin',
        'employees_update_admin',
        'employees_delete_admin',
        'teams_write_admin'
      )
      and (
        coalesce(policy_row.qual, '') not ilike '%current_company_role%'
        and coalesce(policy_row.with_check, '') not ilike '%current_company_role%'
      )
  ) then
    raise exception '직원·팀 쓰기 정책에 현재 회사 역할 검증이 누락되었습니다.';
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
