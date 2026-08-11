-- Employee status-only RPC post-deploy verification (read-only).

do $verify_employee_active_status_rpc$
declare
  v_status_oid regprocedure := pg_catalog.to_regprocedure(
    'public.set_employee_active_status(uuid,boolean)'
  );
  v_guard_oid regprocedure := pg_catalog.to_regprocedure(
    'public.assert_employee_active_status_change(uuid,boolean)'
  );
  v_update_oid regprocedure := pg_catalog.to_regprocedure(
    'public.update_employee_master(uuid,text,uuid,text,text,text,boolean)'
  );
  v_status_definition text;
  v_update_definition text;
begin
  if v_status_oid is null or v_guard_oid is null or v_update_oid is null then
    raise exception 'Employee status-only RPC, guard, or generic update function is missing.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', v_status_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_status_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_status_oid, 'EXECUTE') then
    raise exception 'set_employee_active_status ACL is invalid.';
  end if;

  if pg_catalog.has_function_privilege('anon', v_guard_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_guard_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_guard_oid, 'EXECUTE') then
    raise exception 'Internal employee status guard must not be directly executable.';
  end if;

  select pg_catalog.pg_get_functiondef(v_status_oid::oid)
  into v_status_definition;
  select pg_catalog.pg_get_functiondef(v_update_oid::oid)
  into v_update_definition;

  if pg_catalog.strpos(v_status_definition, 'set is_active = p_is_active') = 0
     or pg_catalog.strpos(v_status_definition, '''status_changed''') = 0
     or pg_catalog.strpos(v_status_definition, 'assert_employee_active_status_change') = 0 then
    raise exception 'Status-only RPC mutation/audit/guard contract is incomplete.';
  end if;

  if pg_catalog.strpos(
       v_update_definition,
       'p_is_active is distinct from v_before.is_active'
     ) = 0
     or pg_catalog.strpos(
       v_update_definition,
       '직원 상태 변경은 전용 보관·복원 절차'
     ) = 0 then
    raise exception 'Generic Employee Master update does not preserve status.';
  end if;
end;
$verify_employee_active_status_rpc$;

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_employee_active_status',
    'assert_employee_active_status_change',
    'update_employee_master'
  )
order by p.proname;
