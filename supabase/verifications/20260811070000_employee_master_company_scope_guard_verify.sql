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
    'public.list_employee_merge_states()'
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
      'public.list_employee_merge_states()'::regprocedure
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
  'public.list_employee_merge_states()'::regprocedure
)
order by function_name::text;
