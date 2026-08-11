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
  v_manager_definition text;
  v_member_definition text;
  v_schedule_definition text;
  v_switch_definition text;
  v_profile_guard_definition text;
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

  select pg_catalog.lower(pg_get_functiondef('public.is_manager_or_above()'::regprocedure)),
         pg_catalog.lower(pg_get_functiondef('public.is_company_member(uuid)'::regprocedure)),
         pg_catalog.lower(pg_get_functiondef('public.can_access_schedule_assignee(uuid)'::regprocedure)),
         pg_catalog.lower(pg_get_functiondef('public.set_active_company(uuid)'::regprocedure)),
         pg_catalog.lower(pg_get_functiondef('public.profiles_enforce_security()'::regprocedure))
  into v_manager_definition,
       v_member_definition,
       v_schedule_definition,
       v_switch_definition,
       v_profile_guard_definition;

  if position(
       'current_company_role() in (''owner'', ''director'', ''admin'', ''manager'')'
       in v_manager_definition
     ) = 0
     or v_manager_definition ilike '%profile_row.role%'
     or v_manager_definition ilike '%from public.profiles%' then
    raise exception 'manager 권한이 현재 회사 멤버십 역할만 사용하지 않습니다.';
  end if;

  if position(
       'p_company_id = public.current_company_id()'
       in v_member_definition
     ) = 0 then
    raise exception 'is_company_member가 현재 활성 회사만 허용하지 않습니다.';
  end if;

  if position(
       'membership_row.role = ''manager'''
       in v_schedule_definition
     ) = 0
     or position(
       'membership_row.company_id = public.current_company_id()'
       in v_schedule_definition
     ) = 0
     or position(
       'assignee_employee.company_id = membership_row.company_id'
       in v_schedule_definition
     ) = 0
     or v_schedule_definition ilike '%profile_row.role = ''manager''%' then
    raise exception '일정 담당자 접근의 회사별 manager 계약이 올바르지 않습니다.';
  end if;

  if position(
       'employee_id = v_target_employee_id'
       in v_switch_definition
     ) = 0
     or position(
       'membership_row.employee_id is not distinct from new.employee_id'
       in v_profile_guard_definition
     ) = 0 then
    raise exception '회사 전환의 직원 회사 정합성 검증이 누락되었습니다.';
  end if;

  if exists (
    select 1
    from pg_proc function_row
    where function_row.oid in (
      'public.is_manager_or_above()'::regprocedure,
      'public.is_company_member(uuid)'::regprocedure,
      'public.can_access_schedule_assignee(uuid)'::regprocedure,
      'public.set_active_company(uuid)'::regprocedure
    )
      and (
        not function_row.prosecdef
        or function_row.proconfig is distinct from array['search_path=""']::text[]
      )
  ) then
    raise exception '회사 역할 헬퍼의 SECURITY DEFINER/search_path 계약이 올바르지 않습니다.';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.is_company_member(uuid)'::regprocedure,
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.is_company_member(uuid)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.is_company_member(uuid)'::regprocedure,
       'EXECUTE'
     ) then
    raise exception 'is_company_member EXECUTE ACL이 올바르지 않습니다.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.company_memberships'::regclass
      and constraint_row.conname = 'company_memberships_role_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%manager%'
  ) then
    raise exception '회사 멤버십 manager 역할 제약이 누락되었습니다.';
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

-- 060 deliberately leaves the legacy global-profile is_admin definition in
-- place. The company-role widening is installed only at the end of 070, in the
-- same transaction as every tenantless policy cleanup.
-- BEGIN 060 INTERMEDIATE IS_ADMIN GUARD
do $$
declare
  v_intermediate_is_admin text := pg_catalog.lower(pg_get_functiondef(
    'public.is_admin()'::regprocedure
  ));
begin
  if position('public.current_company_role()' in v_intermediate_is_admin) > 0
     or position('from public.profiles' in v_intermediate_is_admin) = 0 then
    raise exception '070 tenant cleanup 전에 is_admin 회사 역할이 확대되었습니다.';
  end if;
end;
$$;
-- END 060 INTERMEDIATE IS_ADMIN GUARD

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
