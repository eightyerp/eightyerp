-- Run after 20260811060000_employee_assignment_guard.sql.
-- Read-only verification: no business rows are inserted, updated, or deleted.

do $$
declare
  v_approve_oid regprocedure :=
    to_regprocedure('public.approve_staff_signup(uuid,text,uuid,text,text,uuid)');
  v_definition text;
  v_reject_definition text;
  v_deactivate_definition text;
  v_signup_guard_definition text;
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

  if to_regprocedure('public.enforce_supported_auth_signup_type()') is null then
    raise exception 'Auth 가입 상태 가드가 누락되었습니다.';
  end if;

  select pg_get_functiondef(function_row.oid)
  into v_signup_guard_definition
  from pg_proc function_row
  where function_row.oid =
    'public.enforce_supported_auth_signup_type()'::regprocedure
    and function_row.prosecdef
    and 'search_path=""' = any(
      coalesce(function_row.proconfig, array[]::text[])
    );

  if v_signup_guard_definition is null
     or position(
       'v_signup_type not in (''company_owner'', ''company_invite'')'
       in v_signup_guard_definition
     ) = 0
     or position(
       '지원되지 않는 가입 경로입니다.'
       in v_signup_guard_definition
     ) = 0 then
    raise exception 'Auth 가입 상태 허용 계약이 올바르지 않습니다.';
  end if;

  if has_function_privilege(
       'anon',
       'public.enforce_supported_auth_signup_type()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.enforce_supported_auth_signup_type()'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.enforce_supported_auth_signup_type()'::regprocedure,
       'EXECUTE'
     ) then
    raise exception 'Auth 가입 상태 가드 EXECUTE ACL이 올바르지 않습니다.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname =
      'enforce_supported_auth_signup_type_before_insert'
      and trigger_row.tgrelid = 'auth.users'::regclass
      and trigger_row.tgfoid =
        'public.enforce_supported_auth_signup_type()'::regprocedure
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled in ('O', 'A')
      -- ROW(1) + BEFORE(2) + INSERT(4), with no other event/timing bits.
      and trigger_row.tgtype::integer = 7
  ) then
    raise exception 'auth.users BEFORE INSERT 가입 상태 가드가 비활성화되었거나 누락되었습니다.';
  end if;

  if to_regprocedure('public.list_pending_company_signups()') is null
     or to_regprocedure('public.list_managed_company_profiles()') is null
     or to_regprocedure('public.reject_staff_signup(uuid,text)') is null
     or to_regprocedure('public.deactivate_staff_user(uuid)') is null then
    raise exception '회사 범위 가입 관리 RPC가 누락되었습니다.';
  end if;

  select pg_get_functiondef(
           'public.reject_staff_signup(uuid,text)'::regprocedure
         ),
         pg_get_functiondef(
           'public.deactivate_staff_user(uuid)'::regprocedure
         )
  into v_reject_definition, v_deactivate_definition;

  if position(
       'other_membership.status in (''pending'', ''active'', ''suspended'')'
       in v_reject_definition
     ) = 0
     or position(
       '다른 회사와 비종결 관계가 있는 계정은 현재 회사에서 가입 거절할 수 없습니다.'
       in v_reject_definition
     ) = 0 then
    raise exception '거절 RPC의 타회사 비종결 멤버십 차단 계약이 누락되었습니다.';
  end if;

  if position('v_profile.role = ''super_admin''' in v_deactivate_definition) = 0
     or position(
       'other_membership.status in (''pending'', ''active'', ''suspended'')'
       in v_deactivate_definition
     ) = 0 then
    raise exception '비활성화 RPC의 최고관리자·타회사 보호 계약이 누락되었습니다.';
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

  if exists (
    select 1
    from public.profiles profile_row
    join auth.users auth_user on auth_user.id = profile_row.id
    where profile_row.approval_status = 'pending'
      and coalesce(
        auth_user.raw_app_meta_data->>'onboarding_type',
        ''
      ) <> 'company_owner'
      and not exists (
        select 1
        from public.company_memberships membership_row
        where membership_row.user_id = profile_row.id
          and membership_row.status in ('pending', 'active', 'suspended')
      )
  ) then
    raise exception '회사 멤버십이 없는 직원 승인 대기 프로필이 있습니다. 자동 회사 배정 없이 초대 경로를 확인하세요.';
  end if;

  if exists (
    select 1
    from public.company_memberships membership_row
    left join public.employees employee_row
      on employee_row.id = membership_row.employee_id
    where membership_row.status = 'active'
      and membership_row.employee_id is not null
      and employee_row.company_id is distinct from membership_row.company_id
  ) then
    raise exception '활성 멤버십의 직원 회사 연결 불일치가 있습니다.';
  end if;

  if exists (
    select 1
    from public.profiles profile_row
    join public.company_memberships membership_row
      on membership_row.user_id = profile_row.id
     and membership_row.company_id = profile_row.active_company_id
     and membership_row.status = 'active'
    where profile_row.is_active = true
      and profile_row.is_approved = true
      and profile_row.approval_status = 'approved'
      and profile_row.employee_id is distinct from membership_row.employee_id
  ) then
    raise exception '현재 활성 회사의 프로필·멤버십 직원 연결 불일치가 있습니다.';
  end if;
end;
$$;

select
  (
    select count(*)
    from public.company_memberships membership_row
    left join public.employees employee_row
      on employee_row.id = membership_row.employee_id
    where membership_row.status = 'active'
      and membership_row.employee_id is not null
      and employee_row.company_id is distinct from membership_row.company_id
  ) as active_membership_employee_company_mismatch,
  (
    select count(*)
    from public.profiles profile_row
    join public.company_memberships membership_row
      on membership_row.user_id = profile_row.id
     and membership_row.company_id = profile_row.active_company_id
     and membership_row.status = 'active'
    where profile_row.is_active = true
      and profile_row.is_approved = true
      and profile_row.approval_status = 'approved'
      and profile_row.employee_id is distinct from membership_row.employee_id
  ) as active_profile_membership_mismatch;

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
    'enforce_supported_auth_signup_type',
    'approve_staff_signup',
    'list_pending_company_signups',
    'list_managed_company_profiles',
    'reject_staff_signup',
    'deactivate_staff_user'
  )
order by p.proname;
