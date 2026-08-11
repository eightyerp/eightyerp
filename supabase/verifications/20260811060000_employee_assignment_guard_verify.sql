-- Run after 20260811060000_employee_assignment_guard.sql.
-- Read-only verification: no business rows are inserted, updated, or deleted.

do $$
declare
  v_approve_oid regprocedure :=
    to_regprocedure('public.approve_staff_signup(uuid,text,uuid,text,text,uuid)');
  v_definition text;
  v_config text[];
begin
  if v_approve_oid is null then
    raise exception 'approve_staff_signup RPC가 없습니다.';
  end if;

  select pg_get_functiondef(v_approve_oid), p.proconfig
  into v_definition, v_config
  from pg_proc p
  where p.oid = v_approve_oid;

  if not exists (
    select 1 from pg_proc p where p.oid = v_approve_oid and p.prosecdef
  ) then
    raise exception 'approve_staff_signup이 SECURITY DEFINER가 아닙니다.';
  end if;

  if not ('search_path=""' = any(coalesce(v_config, array[]::text[]))) then
    raise exception 'approve_staff_signup search_path가 빈 값으로 고정되지 않았습니다.';
  end if;

  if position('p_role not in (''admin'', ''manager'', ''staff'')' in v_definition) = 0
     or position('v_membership.status <> ''pending''' in v_definition) = 0
     or position('other_membership.company_id <> v_company_id' in v_definition) = 0 then
    raise exception '승인 RPC의 역할·pending 멤버십·타회사 차단 계약이 누락되었습니다.';
  end if;

  if not has_function_privilege('authenticated', v_approve_oid, 'EXECUTE')
     or has_function_privilege('anon', v_approve_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_approve_oid, 'EXECUTE') then
    raise exception 'approve_staff_signup EXECUTE ACL이 올바르지 않습니다.';
  end if;

  if to_regprocedure('public.list_pending_company_signups()') is null
     or to_regprocedure('public.list_managed_company_profiles()') is null
     or to_regprocedure('public.reject_staff_signup(uuid,text)') is null
     or to_regprocedure('public.deactivate_staff_user(uuid)') is null then
    raise exception '회사 범위 가입 관리 RPC가 누락되었습니다.';
  end if;

  if has_function_privilege(
       'anon',
       'public.list_pending_company_signups()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.list_pending_company_signups()'::regprocedure,
       'EXECUTE'
     ) then
    raise exception '가입 목록 RPC ACL이 올바르지 않습니다.';
  end if;

  if exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'profiles'
      and (
        coalesce(policy_row.qual, '') ilike '%is_admin%'
        or coalesce(policy_row.with_check, '') ilike '%is_admin%'
      )
  ) then
    raise exception 'profiles 정책에 전역 is_admin 우회가 남아 있습니다.';
  end if;
end;
$$;

select
  count(*) filter (
    where membership_row.employee_id is not null
      and employee_row.company_id is distinct from membership_row.company_id
  ) as active_membership_employee_company_mismatch,
  count(*) filter (
    where profile_row.active_company_id is distinct from membership_row.company_id
      or profile_row.employee_id is distinct from membership_row.employee_id
  ) as active_profile_membership_mismatch
from public.company_memberships membership_row
left join public.profiles profile_row
  on profile_row.id = membership_row.user_id
left join public.employees employee_row
  on employee_row.id = membership_row.employee_id
where membership_row.status = 'active';

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'approve_staff_signup',
    'list_pending_company_signups',
    'list_managed_company_profiles',
    'reject_staff_signup',
    'deactivate_staff_user'
  )
order by p.proname;
