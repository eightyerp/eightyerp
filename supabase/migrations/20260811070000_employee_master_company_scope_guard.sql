-- Employee Master and merge company-scope guard.
--
-- Removes legacy global-profile-role bypasses, keeps profile and membership
-- state aligned, and reserves super_admin/owner/director for a separate
-- governance workflow.

begin;

-- A legacy customer quote carries tenant ownership through customer_id rather
-- than a local company_id. Refuse to install stronger assumptions over already
-- inconsistent data; operators must repair the exact offending links first.
do $legacy_assignment_preflight$
declare
  v_has_mismatch boolean;
begin
  if pg_catalog.to_regclass('public.customer_quotes') is not null then
    execute '
      select exists (
        select 1
        from public.customer_quotes quote_row
        join public.customers customer_row on customer_row.id = quote_row.customer_id
        join public.employees employee_row on employee_row.id = quote_row.assigned_employee_id
        where quote_row.assigned_employee_id is not null
          and employee_row.company_id is distinct from customer_row.company_id
      )'
    into v_has_mismatch;
    if v_has_mismatch then
      raise exception 'customer_quotes 고객 회사와 담당 직원 회사가 불일치합니다. 먼저 데이터 정합성을 복구하세요.';
    end if;
  end if;
end;
$legacy_assignment_preflight$;

create or replace function public.list_employee_master()
returns table (
  employee_id uuid, company_id uuid, team_id uuid, employee_name text,
  employee_title text, employee_phone text, employee_email text,
  business_card_path text, show_business_card_on_quote boolean,
  employee_is_active boolean, sort_order integer, employee_created_at timestamptz,
  employee_updated_at timestamptz, profile_id uuid, login_email text,
  login_linked boolean, login_active boolean, approval_status text,
  role text, permissions jsonb, last_sign_in_at timestamptz,
  customer_count bigint, quote_count bigint, schedule_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원 Master를 조회할 수 있습니다.';
  end if;

  return query
  select employee_row.id,
         employee_row.company_id,
         employee_row.team_id,
         employee_row.name,
         employee_row.title,
         employee_row.phone,
         employee_row.email,
         employee_row.business_card_path,
         employee_row.show_business_card_on_quote,
         employee_row.is_active,
         employee_row.sort_order,
         employee_row.created_at,
         employee_row.updated_at,
         profile_row.id,
         coalesce(auth_user.email, profile_row.email),
         profile_row.id is not null,
         coalesce(profile_row.is_active, false),
         profile_row.approval_status,
         profile_row.role,
         coalesce(profile_row.permissions, '{}'::jsonb),
         auth_user.last_sign_in_at,
         (
           select count(*)
           from public.customers customer_row
           where customer_row.company_id = v_company_id
             and customer_row.assigned_employee_id = employee_row.id
             and customer_row.deleted_at is null
         ),
         (
           select count(*)
           from public.quotes quote_row
           where quote_row.company_id = v_company_id
             and quote_row.assigned_employee_id = employee_row.id
             and quote_row.deleted_at is null
         ),
         (
           (
             select count(*)
             from public.customer_schedules schedule_row
             where schedule_row.company_id = v_company_id
               and schedule_row.assigned_employee_id = employee_row.id
               and schedule_row.deleted_at is null
           )
           +
           (
             select count(*)
             from public.project_process_schedules process_row
             where process_row.company_id = v_company_id
               and process_row.assigned_employee_id = employee_row.id
               and process_row.deleted_at is null
           )
         )
  from public.employees employee_row
  left join public.profiles profile_row
    on profile_row.employee_id = employee_row.id
  left join auth.users auth_user
    on auth_user.id = profile_row.id
  where employee_row.company_id = v_company_id
  order by employee_row.sort_order, employee_row.name;
end;
$$;

create or replace function public.get_employee_merge_impact(
  p_source_employee_id uuid,
  p_target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
  v_source public.employees;
  v_target public.employees;
  v_ref record;
  v_source_count bigint;
  v_target_count bigint;
  v_references jsonb := '[]'::jsonb;
  v_logins jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원 병합 영향을 조회할 수 있습니다.';
  end if;
  if p_source_employee_id is null
     or p_target_employee_id is null
     or p_source_employee_id = p_target_employee_id then
    raise exception '서로 다른 기준 직원과 중복 직원을 선택해 주세요.';
  end if;

  select employee_row.* into v_source
  from public.employees employee_row
  where employee_row.id = p_source_employee_id
    and employee_row.company_id = v_company_id;

  select employee_row.* into v_target
  from public.employees employee_row
  where employee_row.id = p_target_employee_id
    and employee_row.company_id = v_company_id;

  if v_source.id is null or v_target.id is null then
    raise exception '현재 회사에서 직원을 찾을 수 없습니다.';
  end if;

  for v_ref in
    with employee_refs as (
      select namespace_row.nspname as table_schema,
             class_row.relname as table_name,
             attribute_row.attname as column_name,
             class_row.oid,
             exists (
               select 1
               from pg_catalog.pg_attribute company_attribute
               where company_attribute.attrelid = class_row.oid
                 and company_attribute.attname = 'company_id'
                 and company_attribute.attnum > 0
                 and not company_attribute.attisdropped
                 and company_attribute.atttypid = 'uuid'::pg_catalog.regtype
             ) as has_company_id
      from pg_catalog.pg_constraint foreign_key
      join pg_catalog.pg_class class_row
        on class_row.oid = foreign_key.conrelid
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = class_row.relnamespace
      join pg_catalog.pg_attribute attribute_row
        on attribute_row.attrelid = foreign_key.conrelid
       and attribute_row.attnum = foreign_key.conkey[1]
      where foreign_key.contype = 'f'
        and foreign_key.confrelid = 'public.employees'::pg_catalog.regclass
        and pg_catalog.array_length(foreign_key.conkey, 1) = 1
        and pg_catalog.array_length(foreign_key.confkey, 1) = 1
      union
      select namespace_row.nspname,
             class_row.relname,
             attribute_row.attname,
             class_row.oid,
             exists (
               select 1
               from pg_catalog.pg_attribute company_attribute
               where company_attribute.attrelid = class_row.oid
                 and company_attribute.attname = 'company_id'
                 and company_attribute.attnum > 0
                 and not company_attribute.attisdropped
                 and company_attribute.atttypid = 'uuid'::pg_catalog.regtype
             )
      from pg_catalog.pg_attribute attribute_row
      join pg_catalog.pg_class class_row
        on class_row.oid = attribute_row.attrelid
       and class_row.relkind in ('r', 'p')
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
        and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
        and attribute_row.attname in ('employee_id', 'assigned_employee_id')
    )
    select employee_refs.table_schema,
           employee_refs.table_name,
           employee_refs.column_name,
           employee_refs.has_company_id,
           case
             when employee_refs.oid in (
               'public.employee_merge_logs'::pg_catalog.regclass,
               'public.employee_master_events'::pg_catalog.regclass
             ) or employee_refs.oid = 'public.employees'::pg_catalog.regclass
               then 'history'
             when employee_refs.oid in (
               'public.profiles'::pg_catalog.regclass,
               'public.company_memberships'::pg_catalog.regclass
             ) then 'login'
             else 'business'
           end as reference_kind
    from employee_refs
    order by employee_refs.table_schema,
             employee_refs.table_name,
             employee_refs.column_name
  loop
    if v_ref.has_company_id then
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1 and company_id = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_source_count using p_source_employee_id, v_company_id;
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1 and company_id = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_target_count using p_target_employee_id, v_company_id;
    else
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_source_count using p_source_employee_id;
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_target_count using p_target_employee_id;
    end if;

    v_references := v_references || jsonb_build_array(jsonb_build_object(
      'schema', v_ref.table_schema,
      'table', v_ref.table_name,
      'column', v_ref.column_name,
      'kind', v_ref.reference_kind,
      'source_count', v_source_count,
      'target_count', v_target_count,
      'combined_count', v_source_count + v_target_count
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', profile_row.id,
    'employee_id', profile_row.employee_id,
    'email', coalesce(auth_user.email, profile_row.email),
    'full_name', profile_row.full_name,
    'is_active', profile_row.is_active,
    'role', profile_row.role
  ) order by profile_row.employee_id, profile_row.id), '[]'::jsonb)
  into v_logins
  from public.profiles profile_row
  left join auth.users auth_user
    on auth_user.id = profile_row.id
  where profile_row.employee_id in (
    p_source_employee_id,
    p_target_employee_id
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_source.id,
      'name', v_source.name,
      'is_active', v_source.is_active,
      'merged_into_employee_id', v_source.merged_into_employee_id
    ),
    'target', jsonb_build_object(
      'id', v_target.id,
      'name', v_target.name,
      'is_active', v_target.is_active,
      'merged_into_employee_id', v_target.merged_into_employee_id
    ),
    'references', v_references,
    'logins', v_logins
  );
end;
$$;

create or replace function public.merge_employees(
  p_source_employee_id uuid,
  p_target_employee_id uuid,
  p_keep_profile_id uuid default null,
  p_other_login_action text default 'unlink'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_actor_company_role text := public.current_company_role();
  v_source public.employees;
  v_target public.employees;
  v_ref record;
  v_source_profile public.profiles;
  v_target_profile public.profiles;
  v_source_membership public.company_memberships%rowtype;
  v_target_membership public.company_memberships%rowtype;
  v_other_membership public.company_memberships%rowtype;
  v_keep_profile_id uuid;
  v_other_profile_id uuid;
  v_count bigint;
  v_source_after bigint;
  v_target_after bigint;
  v_before_source bigint;
  v_before_target bigint;
  v_counts jsonb := '{}'::jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_key text;
  v_log_id uuid;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_actor_company_role is null
     or v_actor_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원을 병합할 수 있습니다.';
  end if;
  if p_source_employee_id is null
     or p_target_employee_id is null
     or p_source_employee_id = p_target_employee_id then
    raise exception '서로 다른 기준 직원과 중복 직원을 선택해 주세요.';
  end if;
  if p_other_login_action is null
     or p_other_login_action not in ('unlink', 'deactivate') then
    raise exception '나머지 로그인 계정 처리는 unlink 또는 deactivate만 가능합니다.';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_constraint foreign_key
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.employees'::pg_catalog.regclass
      and (
        pg_catalog.array_length(foreign_key.conkey, 1) <> 1
        or pg_catalog.array_length(foreign_key.confkey, 1) <> 1
      )
  ) then
    raise exception '복합 employees FK가 발견되어 안전을 위해 병합을 중단합니다. 운영 FK 검증 결과를 확인해 주세요.';
  end if;

  perform 1
  from public.employees employee_row
  where employee_row.id in (p_source_employee_id, p_target_employee_id)
  order by employee_row.id
  for update;

  select employee_row.* into v_source
  from public.employees employee_row
  where employee_row.id = p_source_employee_id;

  select employee_row.* into v_target
  from public.employees employee_row
  where employee_row.id = p_target_employee_id;

  if v_source.id is null or v_target.id is null then
    raise exception '직원을 찾을 수 없습니다.';
  end if;
  if v_source.company_id is distinct from v_target.company_id
     or v_source.company_id is distinct from v_company_id then
    raise exception '동일한 현재 회사의 직원끼리만 병합할 수 있습니다.';
  end if;
  if not v_target.is_active then
    raise exception '기준 직원은 활성 상태여야 합니다.';
  end if;
  if v_source.merged_into_employee_id is not null
     or v_target.merged_into_employee_id is not null then
    raise exception '이미 병합된 직원은 다시 병합할 수 없습니다.';
  end if;
  if exists (
    select 1
    from public.profiles actor_profile
    where actor_profile.id = auth.uid()
      and actor_profile.employee_id = p_source_employee_id
  ) then
    raise exception '현재 로그인한 본인 직원 레코드는 중복 직원으로 병합할 수 없습니다.';
  end if;

  select profile_row.* into v_source_profile
  from public.profiles profile_row
  where profile_row.employee_id = p_source_employee_id
  for update;

  select profile_row.* into v_target_profile
  from public.profiles profile_row
  where profile_row.employee_id = p_target_employee_id
  for update;

  if coalesce(v_source_profile.role, '') = 'super_admin'
     or coalesce(v_target_profile.role, '') = 'super_admin' then
    raise exception 'super_admin 로그인 계정이 연결된 직원은 별도 권한 이전 절차로만 병합할 수 있습니다.';
  end if;

  if v_source_profile.id is not null then
    select membership_row.* into v_source_membership
    from public.company_memberships membership_row
    where membership_row.company_id = v_company_id
      and membership_row.user_id = v_source_profile.id
    for update;
    if v_source_membership.id is null
       or v_source_membership.status <> 'active'
       or v_source_membership.employee_id is distinct from p_source_employee_id then
      raise exception '중복 직원의 프로필과 현재 회사 멤버십 연결이 일치하지 않습니다.';
    end if;
    if v_source_membership.role in ('owner', 'director') then
      raise exception '회사 owner·director 계정이 연결된 직원은 중복 직원으로 병합할 수 없습니다.';
    end if;
  end if;

  if v_target_profile.id is not null then
    select membership_row.* into v_target_membership
    from public.company_memberships membership_row
    where membership_row.company_id = v_company_id
      and membership_row.user_id = v_target_profile.id
    for update;
    if v_target_membership.id is null
       or v_target_membership.status <> 'active'
       or v_target_membership.employee_id is distinct from p_target_employee_id then
      raise exception '기준 직원의 프로필과 현재 회사 멤버십 연결이 일치하지 않습니다.';
    end if;
  end if;

  if v_actor_company_role = 'admin'
     and (
       coalesce(v_source_membership.role, '') = 'admin'
       or coalesce(v_target_membership.role, '') = 'admin'
     ) then
    raise exception '관리자 계정이 연결된 직원은 회사 owner·director만 병합할 수 있습니다.';
  end if;

  if exists (
    select 1
    from public.company_memberships other_membership
    where other_membership.user_id in (
      v_source_profile.id,
      v_target_profile.id
    )
      and other_membership.company_id <> v_company_id
      and other_membership.status in ('pending', 'active', 'suspended')
  ) then
    raise exception '다른 회사에서도 사용하는 로그인 계정이 연결된 직원은 병합할 수 없습니다.';
  end if;

  if v_source_profile.id is not null
     and v_target_profile.id is not null then
    if p_keep_profile_id is null
       or p_keep_profile_id not in (
         v_source_profile.id,
         v_target_profile.id
       ) then
      raise exception '두 직원 모두 로그인 계정이 있습니다. 유지할 로그인 계정을 선택해 주세요.';
    end if;
    v_keep_profile_id := p_keep_profile_id;
    v_other_profile_id := case
      when p_keep_profile_id = v_source_profile.id then v_target_profile.id
      else v_source_profile.id
    end;
  else
    v_keep_profile_id := coalesce(v_source_profile.id, v_target_profile.id);
    v_other_profile_id := null;
    if p_keep_profile_id is not null
       and p_keep_profile_id is distinct from v_keep_profile_id then
      raise exception '연결된 로그인 계정과 유지할 계정이 일치하지 않습니다.';
    end if;
  end if;

  if v_target_membership.id is not null
     and v_target_membership.role in ('owner', 'director')
     and v_keep_profile_id is distinct from v_target_profile.id then
    raise exception '기준 직원의 owner·director 로그인 계정은 반드시 유지해야 합니다.';
  end if;

  if v_other_profile_id is not null then
    if v_other_profile_id = auth.uid() then
      raise exception '현재 로그인한 본인 계정은 병합 과정에서 해제하거나 비활성화할 수 없습니다.';
    end if;
    if v_other_profile_id = v_source_profile.id then
      v_other_membership := v_source_membership;
      if v_source_profile.role = 'super_admin' then
        raise exception 'super_admin 로그인 계정은 병합 과정에서 변경할 수 없습니다.';
      end if;
    else
      v_other_membership := v_target_membership;
      if v_target_profile.role = 'super_admin' then
        raise exception 'super_admin 로그인 계정은 병합 과정에서 변경할 수 없습니다.';
      end if;
    end if;
    if v_other_membership.role in ('owner', 'director') then
      raise exception 'owner·director 로그인 계정은 병합 과정에서 해제하거나 비활성화할 수 없습니다.';
    end if;
    if v_other_membership.role = 'admin'
       and v_actor_company_role not in ('owner', 'director') then
      raise exception '관리자 로그인 계정은 회사 owner·director만 정리할 수 있습니다.';
    end if;

    update public.company_memberships membership_row
    set employee_id = null,
        role = 'employee',
        status = case
          when p_other_login_action = 'deactivate' then 'suspended'
          else 'pending'
        end,
        reviewed_by = case
          when p_other_login_action = 'deactivate' then auth.uid()
          else null
        end,
        reviewed_at = case
          when p_other_login_action = 'deactivate' then now()
          else null
        end,
        rejection_reason = null,
        updated_at = now()
    where membership_row.id = v_other_membership.id
      and membership_row.company_id = v_company_id
      and membership_row.user_id = v_other_profile_id;

    if p_other_login_action = 'unlink' then
      update public.profiles profile_row
      set employee_id = null,
          active_company_id = v_company_id,
          role = 'staff',
          is_active = false,
          is_approved = false,
          approval_status = 'pending',
          approved_at = null,
          approved_by = null,
          rejected_at = null,
          rejection_reason = null,
          updated_at = now()
      where profile_row.id = v_other_profile_id;
    else
      update public.profiles profile_row
      set employee_id = null,
          active_company_id = v_company_id,
          role = 'staff',
          is_active = false,
          updated_at = now()
      where profile_row.id = v_other_profile_id;
    end if;
  end if;

  if v_keep_profile_id is not null then
    update public.company_memberships membership_row
    set employee_id = p_target_employee_id,
        updated_at = now()
    where membership_row.company_id = v_company_id
      and membership_row.user_id = v_keep_profile_id
      and membership_row.status = 'active';

    if not found then
      raise exception '유지할 로그인 계정의 활성 회사 멤버십을 갱신하지 못했습니다.';
    end if;

    update public.profiles profile_row
    set employee_id = p_target_employee_id,
        active_company_id = v_company_id,
        updated_at = now()
    where profile_row.id = v_keep_profile_id;
  end if;

  for v_ref in
    with employee_refs as (
      select namespace_row.nspname as table_schema,
             class_row.relname as table_name,
             attribute_row.attname as column_name,
             class_row.oid,
             exists (
               select 1
               from pg_catalog.pg_attribute company_attribute
               where company_attribute.attrelid = class_row.oid
                 and company_attribute.attname = 'company_id'
                 and company_attribute.attnum > 0
                 and not company_attribute.attisdropped
                 and company_attribute.atttypid = 'uuid'::pg_catalog.regtype
             ) as has_company_id
      from pg_catalog.pg_constraint foreign_key
      join pg_catalog.pg_class class_row
        on class_row.oid = foreign_key.conrelid
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = class_row.relnamespace
      join pg_catalog.pg_attribute attribute_row
        on attribute_row.attrelid = foreign_key.conrelid
       and attribute_row.attnum = foreign_key.conkey[1]
      where foreign_key.contype = 'f'
        and foreign_key.confrelid = 'public.employees'::pg_catalog.regclass
        and pg_catalog.array_length(foreign_key.conkey, 1) = 1
        and pg_catalog.array_length(foreign_key.confkey, 1) = 1
      union
      select namespace_row.nspname,
             class_row.relname,
             attribute_row.attname,
             class_row.oid,
             exists (
               select 1
               from pg_catalog.pg_attribute company_attribute
               where company_attribute.attrelid = class_row.oid
                 and company_attribute.attname = 'company_id'
                 and company_attribute.attnum > 0
                 and not company_attribute.attisdropped
                 and company_attribute.atttypid = 'uuid'::pg_catalog.regtype
             )
      from pg_catalog.pg_attribute attribute_row
      join pg_catalog.pg_class class_row
        on class_row.oid = attribute_row.attrelid
       and class_row.relkind in ('r', 'p')
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
        and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
        and attribute_row.attname in ('employee_id', 'assigned_employee_id')
    )
    select employee_refs.table_schema,
           employee_refs.table_name,
           employee_refs.column_name,
           employee_refs.has_company_id
    from employee_refs
    where employee_refs.oid not in (
      'public.employees'::pg_catalog.regclass,
      'public.profiles'::pg_catalog.regclass,
      'public.company_memberships'::pg_catalog.regclass,
      'public.employee_merge_logs'::pg_catalog.regclass,
      'public.employee_master_events'::pg_catalog.regclass
    )
    order by employee_refs.table_schema,
             employee_refs.table_name,
             employee_refs.column_name
  loop
    v_key := v_ref.table_schema || '.' || v_ref.table_name || '.' || v_ref.column_name;

    if v_ref.has_company_id then
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1 and company_id = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_before_source using p_source_employee_id, v_company_id;
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1 and company_id = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_before_target using p_target_employee_id, v_company_id;
      execute pg_catalog.format(
        'update %I.%I set %I = $1 where %I = $2 and company_id = $3',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name,
        v_ref.column_name
      ) using p_target_employee_id, p_source_employee_id, v_company_id;
    else
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_before_source using p_source_employee_id;
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_before_target using p_target_employee_id;
      execute pg_catalog.format(
        'update %I.%I set %I = $1 where %I = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name,
        v_ref.column_name
      ) using p_target_employee_id, p_source_employee_id;
    end if;

    get diagnostics v_count = row_count;

    v_before := v_before || jsonb_build_object(
      v_key,
      v_before_source + v_before_target
    );
    v_counts := v_counts || jsonb_build_object(v_key, v_count);

    if v_ref.has_company_id then
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1 and company_id = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_source_after using p_source_employee_id, v_company_id;
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1 and company_id = $2',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_target_after using p_target_employee_id, v_company_id;
    else
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_source_after using p_source_employee_id;
      execute pg_catalog.format(
        'select count(*) from %I.%I where %I = $1',
        v_ref.table_schema,
        v_ref.table_name,
        v_ref.column_name
      ) into v_target_after using p_target_employee_id;
    end if;

    v_after := v_after || jsonb_build_object(
      v_key,
      v_source_after + v_target_after
    );
    if v_source_after <> 0
       or v_target_after <> v_before_source + v_before_target then
      raise exception '병합 전후 건수 검증 실패: %', v_key;
    end if;
  end loop;

  update public.employees employee_row
  set is_active = false,
      merged_into_employee_id = p_target_employee_id,
      merged_at = now(),
      merged_by = auth.uid(),
      updated_at = now()
  where employee_row.id = p_source_employee_id
    and employee_row.company_id = v_company_id
    and employee_row.merged_into_employee_id is null;

  if not found then
    raise exception '중복 직원을 병합 상태로 변경하지 못했습니다.';
  end if;

  insert into public.employee_merge_logs (
    company_id,
    source_employee_id,
    target_employee_id,
    transferred_counts,
    login_resolution,
    before_totals,
    after_totals,
    executed_by
  ) values (
    v_company_id,
    p_source_employee_id,
    p_target_employee_id,
    v_counts,
    jsonb_build_object(
      'kept_profile_id', v_keep_profile_id,
      'other_profile_id', v_other_profile_id,
      'other_action', p_other_login_action
    ),
    v_before,
    v_after,
    auth.uid()
  ) returning id into v_log_id;

  insert into public.employee_master_events (
    company_id,
    employee_id,
    event_type,
    actor_id,
    detail
  ) values (
    v_company_id,
    p_target_employee_id,
    'employees_merged',
    auth.uid(),
    jsonb_build_object(
      'merge_log_id', v_log_id,
      'source_employee_id', p_source_employee_id,
      'transferred_counts', v_counts
    )
  );

  return jsonb_build_object(
    'merge_log_id', v_log_id,
    'source_employee_id', p_source_employee_id,
    'target_employee_id', p_target_employee_id,
    'transferred_counts', v_counts,
    'before_totals', v_before,
    'after_totals', v_after
  );
end;
$$;

create or replace function public.list_employee_merge_states()
returns table (
  employee_id uuid,
  merged_into_employee_id uuid,
  merged_at timestamptz,
  merged_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원 병합 상태를 조회할 수 있습니다.';
  end if;

  return query
  select employee_row.id,
         employee_row.merged_into_employee_id,
         employee_row.merged_at,
         employee_row.merged_by
  from public.employees employee_row
  where employee_row.company_id = v_company_id;
end;
$$;

drop policy if exists employee_master_events_select_admin
on public.employee_master_events;
create policy employee_master_events_select_admin
on public.employee_master_events
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

drop policy if exists employee_merge_logs_select_admin
on public.employee_merge_logs;
create policy employee_merge_logs_select_admin
on public.employee_merge_logs
for select to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

create or replace function public.create_employee_master(
  p_name text,
  p_team_id uuid,
  p_title text,
  p_phone text,
  p_email text
)
returns public.employees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
  v_employee public.employees;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원을 생성할 수 있습니다.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_name, '')), '') is null then
    raise exception '이름이 필요합니다.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_title, '')), '') is null then
    raise exception '직책이 필요합니다.';
  end if;

  if p_team_id is not null then
    perform 1
    from public.teams team_row
    where team_row.id = p_team_id
      and team_row.company_id = v_company_id
    for key share;
    if not found then
      raise exception '현재 회사에 속하지 않은 팀입니다.';
    end if;
  end if;

  insert into public.employees (
    company_id,
    team_id,
    name,
    title,
    phone,
    email,
    is_active,
    sort_order
  ) values (
    v_company_id,
    p_team_id,
    pg_catalog.btrim(p_name),
    pg_catalog.btrim(p_title),
    nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''),
    nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), ''),
    true,
    100
  )
  returning * into v_employee;

  insert into public.employee_master_events (
    company_id,
    employee_id,
    event_type,
    actor_id,
    after_data
  ) values (
    v_company_id,
    v_employee.id,
    'created',
    auth.uid(),
    to_jsonb(v_employee)
  );

  return v_employee;
end;
$$;

create or replace function public.update_employee_master(
  p_employee_id uuid,
  p_name text,
  p_team_id uuid,
  p_title text,
  p_phone text,
  p_email text,
  p_is_active boolean
)
returns public.employees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
  v_before public.employees;
  v_employee public.employees;
  v_assignment_ref record;
  v_has_assignments boolean;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원 Master를 수정할 수 있습니다.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_name, '')), '') is null then
    raise exception '이름이 필요합니다.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_title, '')), '') is null then
    raise exception '직책이 필요합니다.';
  end if;
  if p_is_active is null then
    raise exception '직원 활성 상태가 필요합니다.';
  end if;

  if p_team_id is not null then
    perform 1
    from public.teams team_row
    where team_row.id = p_team_id
      and team_row.company_id = v_company_id
    for key share;
    if not found then
      raise exception '현재 회사에 속하지 않은 팀입니다.';
    end if;
  end if;

  select employee_row.*
  into v_before
  from public.employees employee_row
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
  for update;

  if v_before.id is null then
    raise exception '직원 Master를 찾을 수 없습니다.';
  end if;
  if v_before.merged_into_employee_id is not null then
    raise exception '이미 병합된 직원은 수정할 수 없습니다.';
  end if;
  if v_before.is_active
     and not p_is_active
     and exists (
       select 1
       from public.profiles profile_row
       join public.company_memberships membership_row
         on membership_row.user_id = profile_row.id
        and membership_row.company_id = v_company_id
        and membership_row.status = 'active'
        and membership_row.employee_id = p_employee_id
       where profile_row.employee_id = p_employee_id
         and (
           profile_row.role = 'super_admin'
           or membership_row.role in ('owner', 'director')
           or (
             membership_row.role = 'admin'
             and v_company_role = 'admin'
           )
         )
     ) then
    raise exception '상위 권한 계정이 연결된 직원은 별도 권한 이전 절차 없이 비활성화할 수 없습니다.';
  end if;
  if v_before.is_active
     and not p_is_active
     and exists (
       select 1
       from public.profiles profile_row
       where profile_row.id = auth.uid()
         and profile_row.employee_id = p_employee_id
     ) then
    raise exception '현재 로그인한 본인 직원은 비활성화할 수 없습니다.';
  end if;
  if not p_is_active then
    for v_assignment_ref in
      select class_row.relname as table_name,
             exists (
               select 1
               from pg_catalog.pg_attribute company_attribute
               where company_attribute.attrelid = class_row.oid
                 and company_attribute.attname = 'company_id'
                 and company_attribute.atttypid = 'uuid'::pg_catalog.regtype
                 and company_attribute.attnum > 0
                 and not company_attribute.attisdropped
             ) as has_company_id,
             exists (
               select 1
               from pg_catalog.pg_attribute deleted_attribute
               where deleted_attribute.attrelid = class_row.oid
                 and deleted_attribute.attname = 'deleted_at'
                 and deleted_attribute.attnum > 0
                 and not deleted_attribute.attisdropped
             ) as has_deleted_at
      from pg_catalog.pg_attribute assignment_attribute
      join pg_catalog.pg_class class_row
        on class_row.oid = assignment_attribute.attrelid
       and class_row.relkind in ('r', 'p')
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'
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
        and assignment_attribute.attname = 'assigned_employee_id'
        and assignment_attribute.atttypid = 'uuid'::pg_catalog.regtype
        and assignment_attribute.attnum > 0
        and not assignment_attribute.attisdropped
      order by class_row.relname
    loop
      if v_assignment_ref.has_company_id then
        execute pg_catalog.format(
          'select exists (select 1 from public.%I where company_id = $1 and assigned_employee_id = $2%s)',
          v_assignment_ref.table_name,
          case
            when v_assignment_ref.has_deleted_at then ' and deleted_at is null'
            else ''
          end || case
            when v_assignment_ref.table_name = 'schedule_alert_events'
              then ' and status = ''pending'''
            else ''
          end
        )
        into v_has_assignments
        using v_company_id, p_employee_id;
      else
        -- assigned_employee_id is globally unique and the source employee was
        -- locked above in the current company, so it is the tenant boundary
        -- for legacy assignment tables that predate company_id.
        execute pg_catalog.format(
          'select exists (select 1 from public.%I where assigned_employee_id = $1%s)',
          v_assignment_ref.table_name,
          case
            when v_assignment_ref.has_deleted_at then ' and deleted_at is null'
            else ''
          end || case
            when v_assignment_ref.table_name = 'schedule_alert_events'
              then ' and status = ''pending'''
            else ''
          end
        )
        into v_has_assignments
        using p_employee_id;
      end if;

      if v_has_assignments then
        raise exception '담당 업무(%)가 남아 있어 비활성화할 수 없습니다. 먼저 일괄 이전하세요.',
          v_assignment_ref.table_name;
      end if;
    end loop;
  end if;

  update public.employees employee_row
  set name = pg_catalog.btrim(p_name),
      team_id = p_team_id,
      title = pg_catalog.btrim(p_title),
      phone = nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''),
      email = nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), ''),
      is_active = p_is_active,
      updated_at = now()
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
  returning employee_row.* into v_employee;

  insert into public.employee_master_events (
    company_id,
    employee_id,
    event_type,
    actor_id,
    before_data,
    after_data
  ) values (
    v_company_id,
    v_employee.id,
    case
      when v_before.is_active is distinct from v_employee.is_active
        then 'status_changed'
      else 'updated'
    end,
    auth.uid(),
    to_jsonb(v_before),
    to_jsonb(v_employee)
  );

  return v_employee;
end;
$$;

create or replace function public.transfer_employee_assignments(
  p_from_employee_id uuid,
  p_to_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
  v_from public.employees;
  v_to public.employees;
  v_assignment_ref record;
  v_count integer;
  v_counts jsonb := '{}'::jsonb;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 담당 업무를 이전할 수 있습니다.';
  end if;
  if p_from_employee_id is null
     or p_to_employee_id is null
     or p_from_employee_id = p_to_employee_id then
    raise exception '서로 다른 원본 직원과 대상 직원을 선택해 주세요.';
  end if;

  perform 1
  from public.employees employee_row
  where employee_row.id in (p_from_employee_id, p_to_employee_id)
  order by employee_row.id
  for update;

  select employee_row.* into v_from
  from public.employees employee_row
  where employee_row.id = p_from_employee_id
    and employee_row.company_id = v_company_id;

  select employee_row.* into v_to
  from public.employees employee_row
  where employee_row.id = p_to_employee_id
    and employee_row.company_id = v_company_id;

  if v_from.id is null then
    raise exception '원본 직원을 찾을 수 없습니다.';
  end if;
  if v_to.id is null
     or not v_to.is_active
     or v_to.merged_into_employee_id is not null then
    raise exception '현재 회사의 활성·미병합 대상 직원을 찾을 수 없습니다.';
  end if;

  for v_assignment_ref in
    select class_row.relname as table_name,
           exists (
             select 1
             from pg_catalog.pg_attribute company_attribute
             where company_attribute.attrelid = class_row.oid
               and company_attribute.attname = 'company_id'
               and company_attribute.atttypid = 'uuid'::pg_catalog.regtype
               and company_attribute.attnum > 0
               and not company_attribute.attisdropped
           ) as has_company_id,
           exists (
             select 1
             from pg_catalog.pg_attribute deleted_attribute
             where deleted_attribute.attrelid = class_row.oid
               and deleted_attribute.attname = 'deleted_at'
               and deleted_attribute.attnum > 0
               and not deleted_attribute.attisdropped
           ) as has_deleted_at,
           exists (
             select 1
             from pg_catalog.pg_attribute updated_attribute
             where updated_attribute.attrelid = class_row.oid
               and updated_attribute.attname = 'updated_at'
               and updated_attribute.attnum > 0
               and not updated_attribute.attisdropped
           ) as has_updated_at
    from pg_catalog.pg_attribute assignment_attribute
    join pg_catalog.pg_class class_row
      on class_row.oid = assignment_attribute.attrelid
     and class_row.relkind in ('r', 'p')
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
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
      and assignment_attribute.attname = 'assigned_employee_id'
      and assignment_attribute.atttypid = 'uuid'::pg_catalog.regtype
      and assignment_attribute.attnum > 0
      and not assignment_attribute.attisdropped
    order by class_row.relname
  loop
    if v_assignment_ref.has_company_id then
      execute pg_catalog.format(
        'update public.%I set assigned_employee_id = $1%s where company_id = $2 and assigned_employee_id = $3%s',
        v_assignment_ref.table_name,
        case
          when v_assignment_ref.has_updated_at then ', updated_at = now()'
          else ''
        end,
        case
          when v_assignment_ref.has_deleted_at then ' and deleted_at is null'
          else ''
        end || case
          when v_assignment_ref.table_name = 'schedule_alert_events'
            then ' and status = ''pending'''
          else ''
        end
      ) using p_to_employee_id, v_company_id, p_from_employee_id;
    else
      execute pg_catalog.format(
        'update public.%I set assigned_employee_id = $1%s where assigned_employee_id = $2%s',
        v_assignment_ref.table_name,
        case
          when v_assignment_ref.has_updated_at then ', updated_at = now()'
          else ''
        end,
        case
          when v_assignment_ref.has_deleted_at then ' and deleted_at is null'
          else ''
        end || case
          when v_assignment_ref.table_name = 'schedule_alert_events'
            then ' and status = ''pending'''
          else ''
        end
      ) using p_to_employee_id, p_from_employee_id;
    end if;
    get diagnostics v_count = row_count;
    v_counts := v_counts || pg_catalog.jsonb_build_object(
      v_assignment_ref.table_name,
      v_count
    );
  end loop;

  insert into public.employee_master_events (
    company_id,
    employee_id,
    event_type,
    actor_id,
    detail
  ) values (
    v_company_id,
    p_from_employee_id,
    'assignments_transferred',
    auth.uid(),
    jsonb_build_object('to_employee_id', p_to_employee_id) || v_counts
  );

  return v_counts;
end;
$$;

create or replace function public.unlink_employee_login(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_actor_company_role text := public.current_company_role();
  v_employee public.employees;
  v_profile public.profiles;
  v_membership public.company_memberships%rowtype;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_actor_company_role is null
     or v_actor_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 계정 연결을 해제할 수 있습니다.';
  end if;

  select employee_row.* into v_employee
  from public.employees employee_row
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
  for update;
  if v_employee.id is null then
    raise exception '현재 회사의 직원을 찾을 수 없습니다.';
  end if;

  select profile_row.* into v_profile
  from public.profiles profile_row
  where profile_row.employee_id = p_employee_id
  for update;
  if v_profile.id is null then
    raise exception '연결된 로그인 계정이 없습니다.';
  end if;
  if v_profile.id = auth.uid() then
    raise exception '현재 로그인한 본인 계정은 연결 해제할 수 없습니다.';
  end if;

  select membership_row.* into v_membership
  from public.company_memberships membership_row
  where membership_row.company_id = v_company_id
    and membership_row.user_id = v_profile.id
  for update;

  if v_membership.id is null
     or v_membership.status <> 'active'
     or v_membership.employee_id is distinct from p_employee_id then
    raise exception '현재 회사의 활성 로그인 멤버십이 직원과 일치하지 않습니다.';
  end if;
  if v_membership.role in ('owner', 'director') then
    raise exception '회사 owner·director 계정은 일반 연결 해제로 변경할 수 없습니다.';
  end if;
  if v_profile.role = 'super_admin' then
    raise exception 'super_admin 계정은 별도 권한 이전 절차로만 변경할 수 있습니다.';
  end if;
  if v_membership.role = 'admin'
     and v_actor_company_role not in ('owner', 'director') then
    raise exception '관리자 계정은 회사 owner·director만 연결 해제할 수 있습니다.';
  end if;
  if exists (
    select 1
    from public.company_memberships other_membership
    where other_membership.user_id = v_profile.id
      and other_membership.company_id <> v_company_id
      and other_membership.status in ('pending', 'active', 'suspended')
  ) then
    raise exception '다른 회사에서도 사용하는 계정은 직원 연결을 해제할 수 없습니다.';
  end if;

  update public.company_memberships membership_row
  set employee_id = null,
      role = 'employee',
      status = 'pending',
      reviewed_by = null,
      reviewed_at = null,
      rejection_reason = null,
      updated_at = now()
  where membership_row.id = v_membership.id
    and membership_row.company_id = v_company_id
    and membership_row.user_id = v_profile.id;

  update public.profiles profile_row
  set employee_id = null,
      active_company_id = v_company_id,
      role = 'staff',
      is_active = false,
      is_approved = false,
      approval_status = 'pending',
      approved_at = null,
      approved_by = null,
      rejected_at = null,
      rejection_reason = null,
      updated_at = now()
  where profile_row.id = v_profile.id;
end;
$$;

create or replace function public.update_employee_login_role(
  p_employee_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_actor_company_role text := public.current_company_role();
  v_employee public.employees;
  v_profile public.profiles;
  v_membership public.company_memberships%rowtype;
  v_membership_role text;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_actor_company_role is null
     or v_actor_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 계정 권한을 변경할 수 있습니다.';
  end if;
  if p_role not in ('admin', 'manager', 'staff') then
    raise exception '유효하지 않은 권한입니다.';
  end if;

  select employee_row.* into v_employee
  from public.employees employee_row
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
    and employee_row.merged_into_employee_id is null
  for update;
  if v_employee.id is null then
    raise exception '현재 회사의 미병합 직원을 찾을 수 없습니다.';
  end if;

  select profile_row.* into v_profile
  from public.profiles profile_row
  where profile_row.employee_id = p_employee_id
  for update;
  if v_profile.id is null
     or not v_profile.is_active
     or not v_profile.is_approved
     or v_profile.approval_status <> 'approved'
     or v_profile.active_company_id <> v_company_id then
    raise exception '현재 회사의 활성 로그인 계정을 찾을 수 없습니다.';
  end if;
  if v_profile.id = auth.uid() then
    raise exception '본인 계정의 역할은 이 화면에서 변경할 수 없습니다.';
  end if;

  select membership_row.* into v_membership
  from public.company_memberships membership_row
  where membership_row.company_id = v_company_id
    and membership_row.user_id = v_profile.id
  for update;

  if v_membership.id is null
     or v_membership.status <> 'active'
     or v_membership.employee_id is distinct from p_employee_id then
    raise exception '현재 회사의 활성 로그인 멤버십이 직원과 일치하지 않습니다.';
  end if;
  if v_membership.role in ('owner', 'director') then
    raise exception '회사 owner·director 역할은 별도 권한 이전 절차로만 변경할 수 있습니다.';
  end if;
  if v_profile.role = 'super_admin' then
    raise exception 'super_admin 역할은 별도 권한 이전 절차로만 변경할 수 있습니다.';
  end if;
  if (v_membership.role = 'admin' or p_role = 'admin')
     and v_actor_company_role not in ('owner', 'director') then
    raise exception '관리자 권한은 회사 owner·director만 변경할 수 있습니다.';
  end if;
  if exists (
    select 1
    from public.company_memberships other_membership
    where other_membership.user_id = v_profile.id
      and other_membership.company_id <> v_company_id
      and other_membership.status in ('pending', 'active', 'suspended')
  ) then
    raise exception '다른 회사에서도 사용하는 계정의 전역 역할은 변경할 수 없습니다.';
  end if;

  v_membership_role := case
    when p_role = 'admin' then 'admin'
    when p_role = 'manager' then 'manager'
    else 'employee'
  end;

  update public.company_memberships membership_row
  set role = v_membership_role,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where membership_row.id = v_membership.id
    and membership_row.company_id = v_company_id
    and membership_row.user_id = v_profile.id;

  update public.profiles profile_row
  set role = p_role,
      updated_at = now()
  where profile_row.id = v_profile.id;
end;
$$;

-- Storage writes use the current-company role only. A global profile role from
-- another company must never grant peer employee-card access here.
create or replace function public.can_write_employee_business_card(
  p_object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.employee_card_storage_company_id(p_object_name);
  v_employee_id uuid := public.employee_card_storage_employee_id(p_object_name);
  v_my_employee_id uuid;
  v_role text := public.current_company_role();
  v_is_manager boolean;
begin
  if auth.uid() is null or not public.is_erp_user() then
    return false;
  end if;
  if v_company_id is null or v_employee_id is null then
    return false;
  end if;
  if v_company_id is distinct from public.current_company_id() then
    return false;
  end if;
  if not exists (
    select 1
    from public.employees employee_row
    where employee_row.id = v_employee_id
      and employee_row.company_id = v_company_id
  ) then
    return false;
  end if;

  select profile_row.employee_id
  into v_my_employee_id
  from public.profiles profile_row
  where profile_row.id = auth.uid()
    and profile_row.active_company_id = v_company_id
    and profile_row.is_active = true
    and profile_row.is_approved = true
    and profile_row.approval_status = 'approved';

  v_is_manager := coalesce(
    v_role in ('owner', 'director', 'admin'),
    false
  );

  return v_is_manager or v_my_employee_id = v_employee_id;
end;
$$;

-- Material rows and object paths identify their tenant through a project.
-- Always resolve that project to a current-company customer; an administrator
-- role alone is not a row-ownership predicate.
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.projects project_row
    where project_row.id = p_project_id
      and project_row.deleted_at is null
      and public.can_access_customer(project_row.customer_id)
  ), false);
$$;

revoke all on function public.can_access_project(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_access_project(uuid)
to anon, authenticated, service_role;

create or replace function public.can_access_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.quotes quote_row
    where quote_row.id = p_quote_id
      and quote_row.company_id = public.current_company_id()
      and quote_row.deleted_at is null
      and (
        public.is_admin()
        or public.can_access_customer(quote_row.customer_id)
        or quote_row.created_by = auth.uid()
        or quote_row.assigned_employee_id = public.current_employee_id()
      )
  ), false);
$$;

revoke all on function public.can_access_quote(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_access_quote(uuid)
to authenticated, service_role;

create or replace function public.is_current_company_employee(
  p_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.employees employee_row
    where employee_row.id = p_employee_id
      and employee_row.company_id = public.current_company_id()
      and employee_row.is_active = true
      and employee_row.merged_into_employee_id is null
  ), false);
$$;

revoke all on function public.is_current_company_employee(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.is_current_company_employee(uuid)
to authenticated, service_role;

-- project-materials paths are {customer_id}/{material_id}/{file}. Validate
-- both identifiers together so a caller cannot place another customer's
-- material ID under a customer folder they can access.
create or replace function public.can_access_project_material_object(
  p_object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_material_id uuid;
begin
  begin
    v_customer_id := nullif(
      pg_catalog.split_part(p_object_name, '/', 1),
      ''
    )::uuid;
    v_material_id := nullif(
      pg_catalog.split_part(p_object_name, '/', 2),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if v_customer_id is null or v_material_id is null then
    return false;
  end if;

  return coalesce(exists (
    select 1
    from public.project_materials material_row
    where material_row.id = v_material_id
      and material_row.customer_id = v_customer_id
      and material_row.deleted_at is null
      and public.can_access_customer(v_customer_id)
  ), false);
end;
$$;

revoke all on function public.can_access_project_material_object(text)
from public, anon, authenticated, service_role;
grant execute on function public.can_access_project_material_object(text)
to authenticated, service_role;

-- Material portal rows repeat customer/project/set identifiers for efficient
-- reads. RLS on only one of those columns is insufficient: a caller could pair
-- an authorized customer with another tenant's project, and parent updates
-- could invalidate an otherwise-safe token after its row trigger ran. Exact
-- composite foreign keys make that graph durable in both directions.
do $material_scope_relations$
declare
  v_contract record;
  v_index record;
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
        raise exception '자재 tenant 관계 필수 컬럼이 누락되었습니다: %.%',
          v_contract.table_name,
          v_missing_columns;
      end if;
    end if;
  end loop;

  for v_index in
    select *
    from (values
      ('customers'::text, 'customers_id_company_scope_uidx'::text,
       'id, company_id'::text),
      ('projects', 'projects_id_customer_scope_uidx',
       'id, customer_id'),
      ('project_material_sets',
       'project_material_sets_id_project_customer_scope_uidx',
       'id, project_id, customer_id'),
      ('project_materials',
       'project_materials_id_project_customer_scope_uidx',
       'id, project_id, customer_id'),
      ('customer_access_tokens',
       'customer_access_tokens_id_project_customer_scope_uidx',
       'id, project_id, customer_id')
    ) as index_row(table_name, index_name, column_list)
  loop
    v_table_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_index.table_name)
    );
    if v_table_oid is not null
       and not exists (
         select 1
         from pg_catalog.unnest(
           pg_catalog.string_to_array(
             pg_catalog.replace(v_index.column_list, ' ', ''),
             ','
           )
         ) column_name
         where not exists (
           select 1
           from pg_catalog.pg_attribute attribute_row
           where attribute_row.attrelid = v_table_oid
             and attribute_row.attname = column_name
             and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
             and attribute_row.attnum > 0
             and not attribute_row.attisdropped
         )
       ) then
      execute pg_catalog.format(
        'create unique index if not exists %I on public.%I (%s)',
        v_index.index_name,
        v_index.table_name,
        v_index.column_list
      );
    end if;
  end loop;

  for v_relation in
    select *
    from (values
      ('projects'::text, 'projects_customer_company_scope_fkey'::text,
       'customer_id, company_id'::text, 'customers'::text,
       'id, company_id'::text),
      ('project_material_sets',
       'project_material_sets_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('project_materials',
       'project_materials_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('project_materials',
       'project_materials_customer_company_scope_fkey',
       'customer_id, company_id', 'customers', 'id, company_id'),
      ('project_materials', 'project_materials_set_scope_fkey',
       'set_id, project_id, customer_id', 'project_material_sets',
       'id, project_id, customer_id'),
      ('customer_access_tokens',
       'customer_access_tokens_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('customer_access_tokens', 'customer_access_tokens_set_scope_fkey',
       'set_id, project_id, customer_id', 'project_material_sets',
       'id, project_id, customer_id'),
      ('material_approvals', 'material_approvals_material_scope_fkey',
       'material_id, project_id, customer_id', 'project_materials',
       'id, project_id, customer_id'),
      ('material_approvals', 'material_approvals_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('material_approvals', 'material_approvals_token_scope_fkey',
       'access_token_id, project_id, customer_id', 'customer_access_tokens',
       'id, project_id, customer_id'),
      ('material_comments', 'material_comments_material_scope_fkey',
       'material_id, project_id, customer_id', 'project_materials',
       'id, project_id, customer_id'),
      ('material_comments', 'material_comments_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('material_comments', 'material_comments_token_scope_fkey',
       'access_token_id, project_id, customer_id', 'customer_access_tokens',
       'id, project_id, customer_id'),
      ('material_change_requests',
       'material_change_requests_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('material_change_requests', 'material_change_requests_set_scope_fkey',
       'set_id, project_id, customer_id', 'project_material_sets',
       'id, project_id, customer_id'),
      ('material_change_requests', 'material_change_requests_token_scope_fkey',
       'access_token_id, project_id, customer_id', 'customer_access_tokens',
       'id, project_id, customer_id'),
      ('material_approval_versions',
       'material_approval_versions_set_scope_fkey',
       'set_id, project_id, customer_id', 'project_material_sets',
       'id, project_id, customer_id'),
      ('material_approval_versions',
       'material_approval_versions_project_customer_scope_fkey',
       'project_id, customer_id', 'projects', 'id, customer_id'),
      ('material_approval_versions',
       'material_approval_versions_token_scope_fkey',
       'access_token_id, project_id, customer_id', 'customer_access_tokens',
       'id, project_id, customer_id')
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
           pg_catalog.string_to_array(
             pg_catalog.replace(v_relation.child_columns, ' ', ''),
             ','
           )
         ) column_name
         where not exists (
           select 1
           from pg_catalog.pg_attribute attribute_row
           where attribute_row.attrelid = pg_catalog.to_regclass(
                   pg_catalog.format('public.%I', v_relation.child_table)
                 )
             and attribute_row.attname = column_name
             and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
             and attribute_row.attnum > 0
             and not attribute_row.attisdropped
         )
       )
       and not exists (
         select 1
         from pg_catalog.unnest(
           pg_catalog.string_to_array(
             pg_catalog.replace(v_relation.parent_columns, ' ', ''),
             ','
           )
         ) column_name
         where not exists (
           select 1
           from pg_catalog.pg_attribute attribute_row
           where attribute_row.attrelid = pg_catalog.to_regclass(
                   pg_catalog.format('public.%I', v_relation.parent_table)
                 )
             and attribute_row.attname = column_name
             and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
             and attribute_row.attnum > 0
             and not attribute_row.attisdropped
         )
       ) then
      execute pg_catalog.format(
        'alter table public.%I drop constraint if exists %I',
        v_relation.child_table,
        v_relation.constraint_name
      );
      execute pg_catalog.format(
        'alter table public.%I add constraint %I foreign key (%s) references public.%I (%s)',
        v_relation.child_table,
        v_relation.constraint_name,
        v_relation.child_columns,
        v_relation.parent_table,
        v_relation.parent_columns
      );
    end if;
  end loop;
end;
$material_scope_relations$;

-- Contract lifecycle children repeat the root contract's tenant identifiers.
-- A single-column root_contract_id FK lets an otherwise-authorized caller
-- attach a current-company child to another company's root and then ask the
-- SECURITY DEFINER confirmation RPC to update that root. Bind both root and
-- parent references to the exact company/customer/project scope, and retain a
-- defensive equality check inside the RPC itself.
do $contract_lifecycle_scope_relations$
declare
  v_contracts_oid regclass := pg_catalog.to_regclass('public.contracts');
  v_table record;
  v_table_oid regclass;
  v_missing_columns text[];
  v_has_lifecycle_scope boolean := false;
begin
  if v_contracts_oid is null then
    return;
  end if;

  for v_table in
    select *
    from (values
      ('customers'::text, 'id,company_id'::text),
      ('quotes', 'id,company_id,customer_id'),
      ('projects', 'id,company_id,customer_id'),
      (
        'contracts',
        'id,company_id,customer_id,project_id,quote_id'
      )
    ) as table_row(table_name, required_columns)
  loop
    v_table_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table.table_name)
    );
    if v_table_oid is null then
      raise exception '계약 tenant graph 필수 테이블이 누락되었습니다: %',
        v_table.table_name;
    end if;

    select pg_catalog.array_agg(column_name order by column_name)
    into v_missing_columns
    from pg_catalog.unnest(
      pg_catalog.string_to_array(v_table.required_columns, ',')
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
      raise exception '계약 tenant graph 필수 컬럼이 누락되었습니다: %.%',
        v_table.table_name,
        v_missing_columns;
    end if;
  end loop;

  -- Execution-budget tables were introduced beside contracts, but tolerate a
  -- genuinely older installation where both are absent. If either table is
  -- present, validate its complete tenant key instead of silently skipping it.
  for v_table in
    select *
    from (values
      (
        'execution_budgets'::text,
        'id,company_id,contract_id,project_id,customer_id'::text
      ),
      (
        'execution_budget_items',
        'id,company_id,execution_budget_id'
      )
    ) as table_row(table_name, required_columns)
  loop
    v_table_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table.table_name)
    );
    if v_table_oid is null then
      continue;
    end if;

    select pg_catalog.array_agg(column_name order by column_name)
    into v_missing_columns
    from pg_catalog.unnest(
      pg_catalog.string_to_array(v_table.required_columns, ',')
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
      raise exception '계약 tenant graph 필수 컬럼이 누락되었습니다: %.%',
        v_table.table_name,
        v_missing_columns;
    end if;
  end loop;

  if pg_catalog.to_regclass('public.execution_budget_items') is not null
     and pg_catalog.to_regclass('public.execution_budgets') is null then
    raise exception 'execution_budget_items가 있지만 부모 execution_budgets가 없습니다.';
  end if;

  select count(*) = 2
  into v_has_lifecycle_scope
  from pg_catalog.pg_attribute attribute_row
  where attribute_row.attrelid = v_contracts_oid
    and attribute_row.attname in ('root_contract_id', 'parent_contract_id')
    and attribute_row.atttypid = 'uuid'::pg_catalog.regtype
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped;

  if (
       pg_catalog.to_regprocedure(
         'public.confirm_contract_lifecycle_child(uuid,text)'
       ) is not null
       or pg_catalog.to_regprocedure(
         'public.create_contract_lifecycle_child(uuid,jsonb,text)'
       ) is not null
     )
     and not v_has_lifecycle_scope then
    raise exception '계약 lifecycle 함수의 root/parent tenant 컬럼이 누락되었습니다.';
  end if;

  create unique index if not exists quotes_id_customer_company_scope_uidx
    on public.quotes (id, customer_id, company_id);

  create unique index if not exists contracts_id_tenant_scope_uidx
    on public.contracts (id, company_id, customer_id, project_id);

  if pg_catalog.to_regclass('public.execution_budgets') is not null then
    create unique index if not exists execution_budgets_id_company_scope_uidx
      on public.execution_budgets (id, company_id);
  end if;

  alter table public.quotes
    drop constraint if exists quotes_customer_company_scope_fkey;
  alter table public.quotes
    add constraint quotes_customer_company_scope_fkey
    foreign key (customer_id, company_id)
    references public.customers (id, company_id);

  alter table public.contracts
    drop constraint if exists contracts_customer_company_scope_fkey;
  alter table public.contracts
    add constraint contracts_customer_company_scope_fkey
    foreign key (customer_id, company_id)
    references public.customers (id, company_id);

  alter table public.contracts
    drop constraint if exists contracts_project_customer_scope_fkey;
  alter table public.contracts
    add constraint contracts_project_customer_scope_fkey
    foreign key (project_id, customer_id)
    references public.projects (id, customer_id);

  alter table public.contracts
    drop constraint if exists contracts_quote_customer_company_scope_fkey;
  alter table public.contracts
    add constraint contracts_quote_customer_company_scope_fkey
    foreign key (quote_id, customer_id, company_id)
    references public.quotes (id, customer_id, company_id);

  if v_has_lifecycle_scope then
    alter table public.contracts
      drop constraint if exists contracts_root_tenant_scope_fkey;
    alter table public.contracts
      add constraint contracts_root_tenant_scope_fkey
      foreign key (
        root_contract_id,
        company_id,
        customer_id,
        project_id
      ) references public.contracts (
        id,
        company_id,
        customer_id,
        project_id
      );

    alter table public.contracts
      drop constraint if exists contracts_parent_tenant_scope_fkey;
    alter table public.contracts
      add constraint contracts_parent_tenant_scope_fkey
      foreign key (
        parent_contract_id,
        company_id,
        customer_id,
        project_id
      ) references public.contracts (
        id,
        company_id,
        customer_id,
        project_id
      );
  end if;

  if pg_catalog.to_regclass('public.execution_budgets') is not null then
    alter table public.execution_budgets
      drop constraint if exists execution_budgets_contract_scope_fkey;
    alter table public.execution_budgets
      add constraint execution_budgets_contract_scope_fkey
      foreign key (contract_id, company_id, customer_id, project_id)
      references public.contracts (
        id,
        company_id,
        customer_id,
        project_id
      );
  end if;

  if pg_catalog.to_regclass('public.execution_budget_items') is not null then
    alter table public.execution_budget_items
      drop constraint if exists execution_budget_items_budget_company_scope_fkey;
    alter table public.execution_budget_items
      add constraint execution_budget_items_budget_company_scope_fkey
      foreign key (execution_budget_id, company_id)
      references public.execution_budgets (id, company_id)
      on delete cascade;
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_contract_lifecycle_child(uuid,jsonb,text)'
     ) is not null then
    execute $replace_contract_child_creation$
      create or replace function public.create_contract_lifecycle_child(
        p_root_contract_id uuid,
        p_payload jsonb,
        p_kind text
      )
      returns jsonb
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $$
      declare
        v_user uuid := auth.uid();
        v_company uuid;
        v_root public.contracts%rowtype;
        v_child public.contracts%rowtype;
        v_seq integer;
        v_supply bigint;
        v_vat bigint;
        v_discount bigint;
        v_amount bigint;
        v_event text;
      begin
        if v_user is null or not public.is_erp_user() then
          raise exception '권한이 없습니다.';
        end if;
        if p_kind is null or p_kind not in ('amendment', 'addition') then
          raise exception '계약 유형이 올바르지 않습니다.';
        end if;

        v_company := public.current_company_id();
        select root_row.*
        into v_root
        from public.contracts root_row
        where root_row.id = p_root_contract_id
        for update;

        if not found
           or v_root.company_id is distinct from v_company
           or not public.can_access_customer(v_root.customer_id) then
          raise exception '계약을 찾을 수 없습니다.';
        end if;
        if v_root.contract_kind is distinct from 'original'
           or v_root.root_contract_id is not null
           or v_root.parent_contract_id is not null
           or v_root.status not in ('confirmed', 'active') then
          raise exception '확정된 원계약만 변경 또는 추가할 수 있습니다.';
        end if;
        if exists (
          select 1
          from public.contracts pending_child
          where pending_child.root_contract_id = v_root.id
            and pending_child.contract_kind in ('amendment', 'addition')
            and pending_child.status = 'draft'
        ) then
          raise exception '대기 중인 변경 또는 추가 계약을 먼저 처리해 주세요.';
        end if;

        v_supply := public.contract_lifecycle_amount(
          p_payload,
          'supply_amount',
          v_root.supply_amount
        );
        v_vat := public.contract_lifecycle_amount(
          p_payload,
          'vat_amount',
          v_root.vat_amount
        );
        v_discount := public.contract_lifecycle_amount(
          p_payload,
          'discount_amount',
          v_root.discount_amount
        );
        v_amount := public.contract_lifecycle_amount(
          p_payload,
          'contract_amount',
          v_supply - v_discount + v_vat
        );
        if v_supply < v_discount
           or v_amount <> v_supply - v_discount + v_vat then
          raise exception '계약금액은 공급가 - 할인 + 부가세와 일치해야 합니다.';
        end if;

        select coalesce(pg_catalog.max(child_row.revision_seq), 0) + 1
        into v_seq
        from public.contracts child_row
        where child_row.root_contract_id = v_root.id
          and child_row.contract_kind = p_kind;

        insert into public.contracts(
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
          updated_by,
          root_contract_id,
          parent_contract_id,
          contract_kind,
          revision_seq,
          title,
          scope_summary,
          work_start_date,
          work_end_date,
          change_reason,
          previous_contract_amount,
          delta_amount,
          cumulative_contract_amount,
          items_snapshot
        ) values (
          v_company,
          v_root.customer_id,
          null,
          v_root.project_id,
          null,
          (current_timestamp at time zone 'Asia/Seoul')::date,
          'draft',
          v_supply,
          v_vat,
          v_discount,
          v_amount,
          v_root.assigned_employee_id,
          v_user,
          v_user,
          v_root.id,
          v_root.id,
          p_kind,
          v_seq,
          nullif(btrim(coalesce(p_payload->>'title', v_root.title, '')), ''),
          nullif(
            btrim(coalesce(p_payload->>'scope_summary', v_root.scope_summary, '')),
            ''
          ),
          coalesce(
            nullif(p_payload->>'work_start_date', '')::date,
            v_root.work_start_date
          ),
          coalesce(
            nullif(p_payload->>'work_end_date', '')::date,
            v_root.work_end_date
          ),
          nullif(btrim(coalesce(p_payload->>'change_reason', '')), ''),
          coalesce(
            v_root.cumulative_contract_amount,
            v_root.contract_amount
          ),
          case
            when p_kind = 'addition' then v_amount
            else v_amount - coalesce(
              v_root.cumulative_contract_amount,
              v_root.contract_amount
            )
          end,
          case
            when p_kind = 'addition' then coalesce(
              v_root.cumulative_contract_amount,
              v_root.contract_amount
            ) + v_amount
            else v_amount
          end,
          coalesce(p_payload->'items_snapshot', v_root.items_snapshot)
        )
        returning * into v_child;

        update public.contracts
        set status = case
              when p_kind = 'amendment' then 'amending'
              else 'adding'
            end,
            updated_by = v_user,
            updated_at = pg_catalog.now()
        where id = v_root.id;

        v_event := case
          when p_kind = 'amendment' then 'amendment_created'
          else 'addition_created'
        end;
        insert into public.contract_events(
          company_id,
          contract_id,
          root_contract_id,
          event_type,
          actor_id,
          reason,
          after_data
        ) values (
          v_company,
          v_child.id,
          v_root.id,
          v_event,
          v_user,
          v_child.change_reason,
          pg_catalog.to_jsonb(v_child)
        );

        return pg_catalog.jsonb_build_object(
          'ok', true,
          'contract_id', v_child.id,
          'root_contract_id', v_root.id
        );
      end;
      $$;
    $replace_contract_child_creation$;

    execute 'revoke all on function public.create_contract_lifecycle_child(uuid,jsonb,text) from public, anon, authenticated, service_role';
  end if;

  if pg_catalog.to_regprocedure(
       'public.confirm_contract_lifecycle_child(uuid,text)'
     ) is not null then
    execute $replace_contract_confirmation$
    create or replace function public.confirm_contract_lifecycle_child(
      p_child_id uuid,
      p_kind text
    )
    returns jsonb
    language plpgsql
    volatile
    security definer
    set search_path = ''
    as $$
    declare
      v_user uuid := auth.uid();
      v_company uuid;
      v_child public.contracts%rowtype;
      v_root public.contracts%rowtype;
      v_before jsonb;
      v_event text;
    begin
      if v_user is null or not public.is_erp_user() then
        raise exception '권한이 없습니다.';
      end if;
      if p_kind is null or p_kind not in ('amendment', 'addition') then
        raise exception '계약 유형이 올바르지 않습니다.';
      end if;

      v_company := public.current_company_id();
      select child_row.*
      into v_child
      from public.contracts child_row
      where child_row.id = p_child_id
      for update;

      if not found
         or v_child.company_id is distinct from v_company
         or v_child.contract_kind is distinct from p_kind
         or not public.can_access_customer(v_child.customer_id) then
        raise exception '계약을 찾을 수 없습니다.';
      end if;
      if v_child.status = 'confirmed' then
        return pg_catalog.jsonb_build_object(
          'ok', true,
          'contract_id', v_child.id,
          'already_confirmed', true
        );
      end if;
      if v_child.status <> 'draft' then
        raise exception '초안 계약만 확정할 수 있습니다.';
      end if;

      select root_row.*
      into v_root
      from public.contracts root_row
      where root_row.id = v_child.root_contract_id
      for update;

      if not found
         or v_root.id = v_child.id
         or v_root.contract_kind is distinct from 'original'
         or v_child.parent_contract_id is distinct from v_root.id
         or v_root.company_id is distinct from v_child.company_id
         or v_root.customer_id is distinct from v_child.customer_id
         or v_root.project_id is distinct from v_child.project_id
         or v_root.status is distinct from (
           case
             when p_kind = 'amendment' then 'amending'
             else 'adding'
           end
         ) then
        raise exception '원계약이 변경계약의 회사·고객·프로젝트와 일치하지 않습니다.';
      end if;

      v_before := pg_catalog.to_jsonb(v_child);
      update public.contracts
      set status = 'confirmed',
          confirmed_at = pg_catalog.now(),
          confirmed_by = v_user,
          updated_by = v_user,
          updated_at = pg_catalog.now()
      where id = v_child.id
      returning * into v_child;

      update public.contracts
      set status = 'confirmed',
          cumulative_contract_amount = coalesce(
            v_child.cumulative_contract_amount,
            v_child.contract_amount
          ),
          contract_amount = case
            when p_kind = 'amendment' then v_child.contract_amount
            else contract_amount
          end,
          updated_by = v_user,
          updated_at = pg_catalog.now()
      where id = v_root.id;

      v_event := case
        when p_kind = 'amendment' then 'amendment_confirmed'
        else 'addition_confirmed'
      end;
      insert into public.contract_events(
        company_id,
        contract_id,
        root_contract_id,
        event_type,
        actor_id,
        reason,
        before_data,
        after_data
      ) values (
        v_company,
        v_child.id,
        v_root.id,
        v_event,
        v_user,
        v_child.change_reason,
        v_before,
        pg_catalog.to_jsonb(v_child)
      );
      insert into public.contract_events(
        company_id,
        contract_id,
        root_contract_id,
        event_type,
        actor_id,
        reason
      ) values (
        v_company,
        v_child.id,
        v_root.id,
        'budget_sync_skipped',
        v_user,
        '결제 테이블이 없어 실행예산/수금 동기화를 수행하지 않았습니다.'
      );

      return pg_catalog.jsonb_build_object(
        'ok', true,
        'contract_id', v_child.id,
        'root_contract_id', v_root.id
      );
    end;
    $$;
    $replace_contract_confirmation$;

    execute 'revoke all on function public.confirm_contract_lifecycle_child(uuid,text) from public, anon, authenticated, service_role';
  end if;

  if pg_catalog.to_regprocedure('public.confirm_contract(uuid)') is not null then
    execute $replace_original_confirmation$
      create or replace function public.confirm_contract(p_contract_id uuid)
      returns jsonb
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $$
      declare
        v_user uuid := auth.uid();
        v_company uuid;
        v_contract public.contracts%rowtype;
        v_before jsonb;
      begin
        if v_user is null or not public.is_erp_user() then
          raise exception '권한이 없습니다.';
        end if;

        v_company := public.current_company_id();
        select contract_row.*
        into v_contract
        from public.contracts contract_row
        where contract_row.id = p_contract_id
        for update;

        if not found
           or v_contract.company_id is distinct from v_company
           or not public.can_access_customer(v_contract.customer_id) then
          raise exception '계약을 찾을 수 없습니다.';
        end if;
        if v_contract.contract_kind is distinct from 'original'
           or v_contract.root_contract_id is not null
           or v_contract.parent_contract_id is not null then
          raise exception '일반 확정은 원계약에만 사용할 수 있습니다.';
        end if;
        if v_contract.status = 'confirmed' then
          return pg_catalog.jsonb_build_object(
            'ok', true,
            'contract_id', v_contract.id,
            'already_confirmed', true
          );
        end if;
        if v_contract.status <> 'draft' then
          raise exception '초안 계약만 확정할 수 있습니다.';
        end if;

        v_before := pg_catalog.to_jsonb(v_contract);
        update public.contracts
        set status = 'confirmed',
            confirmed_at = pg_catalog.now(),
            confirmed_by = v_user,
            updated_by = v_user,
            updated_at = pg_catalog.now()
        where id = v_contract.id
        returning * into v_contract;

        insert into public.contract_events(
          company_id,
          contract_id,
          root_contract_id,
          event_type,
          actor_id,
          before_data,
          after_data
        ) values (
          v_company,
          v_contract.id,
          v_contract.id,
          'confirmed',
          v_user,
          v_before,
          pg_catalog.to_jsonb(v_contract)
        );

        return pg_catalog.jsonb_build_object(
          'ok', true,
          'contract_id', v_contract.id
        );
      end;
      $$;
    $replace_original_confirmation$;

    execute 'revoke all on function public.confirm_contract(uuid) from public, anon, authenticated, service_role';
    execute 'grant execute on function public.confirm_contract(uuid) to authenticated';
  end if;

  -- Contract state transitions are RPC-only. Keeping permissive RLS policies
  -- for reads is harmless, but direct table writes could otherwise mark a
  -- lifecycle child confirmed without synchronizing its locked root.
  execute 'revoke insert, update, delete on table public.contracts from public, anon, authenticated';
  if pg_catalog.to_regclass('public.execution_budgets') is not null then
    execute 'revoke insert, update, delete on table public.execution_budgets from public, anon, authenticated';
  end if;
  if pg_catalog.to_regclass('public.execution_budget_items') is not null then
    execute 'revoke insert, update, delete on table public.execution_budget_items from public, anon, authenticated';
  end if;
end;
$contract_lifecycle_scope_relations$;

-- RLS decides who may write an assignment row, while this trigger enforces
-- what may be written. Locking the assignee employee row with FOR KEY SHARE
-- serializes child writes against Employee Master deactivation/merge, both of
-- which take FOR UPDATE first. Whichever transaction runs second must observe
-- either the new child assignment or the employee's inactive/merged state.
create or replace function public.assert_active_assignment_employee(
  p_row_data jsonb,
  p_table_name text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assigned_employee_id uuid;
  v_employee_company_id uuid;
  v_row_company_id uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_quote_id uuid;
  v_resource_company_id uuid;
begin
  if p_table_name not in (
    'customers',
    'quotes',
    'customer_schedules',
    'project_process_schedules',
    'projects',
    'contracts',
    'employee_tasks',
    'customer_quotes',
    'schedule_alert_events'
  ) then
    raise exception '지원하지 않는 담당업무 테이블입니다: %', p_table_name;
  end if;

  -- Soft-deleted rows and processed alert history do not keep an employee
  -- active. Restoring either state fires the trigger again and revalidates it.
  if p_row_data ? 'deleted_at'
     and nullif(p_row_data->>'deleted_at', '') is not null then
    return true;
  end if;
  if p_table_name = 'schedule_alert_events'
     and coalesce(p_row_data->>'status', '') <> 'pending' then
    return true;
  end if;

  v_assigned_employee_id := nullif(
    p_row_data->>'assigned_employee_id',
    ''
  )::uuid;
  if v_assigned_employee_id is null then
    return true;
  end if;

  select employee_row.company_id
  into v_employee_company_id
  from public.employees employee_row
  where employee_row.id = v_assigned_employee_id
    and employee_row.is_active = true
    and employee_row.merged_into_employee_id is null
  for key share;

  if v_employee_company_id is null then
    raise exception '활성·미병합 담당 직원을 찾을 수 없습니다.';
  end if;

  v_row_company_id := nullif(p_row_data->>'company_id', '')::uuid;
  if p_row_data ? 'company_id' then
    if v_row_company_id is null then
      raise exception 'live 담당업무 행의 회사가 비어 있습니다.';
    end if;
    if v_row_company_id is distinct from v_employee_company_id then
      raise exception '담당 직원이 업무 행의 회사에 속하지 않습니다.';
    end if;
  end if;

  v_customer_id := nullif(p_row_data->>'customer_id', '')::uuid;
  if v_customer_id is not null then
    select customer_row.company_id
    into v_resource_company_id
    from public.customers customer_row
    where customer_row.id = v_customer_id
    for key share;

    if v_resource_company_id is null then
      raise exception '담당업무 고객의 회사를 확인할 수 없습니다.';
    end if;
    if v_resource_company_id is distinct from v_employee_company_id then
      raise exception '담당 직원이 업무 고객의 회사에 속하지 않습니다.';
    end if;
  end if;

  v_project_id := nullif(p_row_data->>'project_id', '')::uuid;
  if v_project_id is not null then
    select customer_row.company_id
    into v_resource_company_id
    from public.projects project_row
    join public.customers customer_row
      on customer_row.id = project_row.customer_id
    where project_row.id = v_project_id
    for key share of project_row, customer_row;

    if v_resource_company_id is null then
      raise exception '담당업무 프로젝트의 회사를 확인할 수 없습니다.';
    end if;
    if v_resource_company_id is distinct from v_employee_company_id then
      raise exception '담당 직원이 업무 프로젝트의 회사에 속하지 않습니다.';
    end if;
  end if;

  v_quote_id := nullif(p_row_data->>'quote_id', '')::uuid;
  if v_quote_id is not null then
    select customer_row.company_id
    into v_resource_company_id
    from public.quotes quote_row
    join public.customers customer_row
      on customer_row.id = quote_row.customer_id
    where quote_row.id = v_quote_id
    for key share of quote_row, customer_row;

    if v_resource_company_id is null then
      raise exception '담당업무 견적의 회사를 확인할 수 없습니다.';
    end if;
    if v_resource_company_id is distinct from v_employee_company_id then
      raise exception '담당 직원이 업무 견적의 회사에 속하지 않습니다.';
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.assert_active_assignment_employee(jsonb, text)
from public, anon, authenticated, service_role;

create or replace function public.enforce_active_assignment_employee()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_active_assignment_employee(
    pg_catalog.to_jsonb(new),
    tg_table_name
  );
  return new;
end;
$$;

revoke all on function public.enforce_active_assignment_employee()
from public, anon, authenticated, service_role;

do $assignment_trigger_guard$
declare
  v_table record;
  v_update_columns text;
  v_preflight_ok boolean;
begin
  for v_table in
    select class_row.oid as table_oid,
           class_row.relname as table_name
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
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
      and exists (
        select 1
        from pg_catalog.pg_attribute assignment_attribute
        where assignment_attribute.attrelid = class_row.oid
          and assignment_attribute.attname = 'assigned_employee_id'
          and assignment_attribute.atttypid = 'uuid'::pg_catalog.regtype
          and assignment_attribute.attnum > 0
          and not assignment_attribute.attisdropped
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

    select pg_catalog.string_agg(
             pg_catalog.quote_ident(attribute_row.attname),
             ', '
             order by attribute_row.attnum
           )
    into v_update_columns
    from pg_catalog.pg_attribute attribute_row
    where attribute_row.attrelid = v_table.table_oid
      and (
        attribute_row.attname in (
          'assigned_employee_id',
          'company_id',
          'customer_id',
          'project_id',
          'quote_id',
          'deleted_at'
        )
        or (
          v_table.table_name = 'schedule_alert_events'
          and attribute_row.attname = 'status'
        )
      )
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped;

    execute pg_catalog.format(
      'drop trigger if exists assignment_employee_guard on public.%I',
      v_table.table_name
    );
    execute pg_catalog.format(
      'create trigger assignment_employee_guard before insert or update of %s on public.%I for each row execute function public.enforce_active_assignment_employee()',
      v_update_columns,
      v_table.table_name
    );

    -- CREATE TRIGGER holds a table lock until this transaction commits. Scan
    -- after installation so no direct writer can slip between validation and
    -- the durable guard becoming visible.
    execute pg_catalog.format(
      'select coalesce(pg_catalog.bool_and(public.assert_active_assignment_employee(pg_catalog.to_jsonb(row_data), %L)), true) from public.%I row_data where assigned_employee_id is not null',
      v_table.table_name,
      v_table.table_name
    ) into v_preflight_ok;
    if not v_preflight_ok then
      raise exception '담당업무 직원 정합성 preflight가 실패했습니다: %',
        v_table.table_name;
    end if;
  end loop;
end;
$assignment_trigger_guard$;

-- Customer portal tokens carry redundant customer/project/set identifiers.
-- Bind them at write time so an otherwise-authorized customer_id cannot be
-- paired with another company's project or material set and then trusted by a
-- SECURITY DEFINER portal RPC.
create or replace function public.assert_customer_access_token_scope(
  p_row_data jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := nullif(p_row_data->>'customer_id', '')::uuid;
  v_project_id uuid := nullif(p_row_data->>'project_id', '')::uuid;
  v_set_id uuid := nullif(p_row_data->>'set_id', '')::uuid;
  v_verified_customer_id uuid;
begin
  if v_customer_id is null or v_project_id is null then
    raise exception '고객 포털 토큰에는 고객과 프로젝트가 필요합니다.';
  end if;

  execute '
    select project_row.customer_id
    from public.projects project_row
    join public.customers customer_row
      on customer_row.id = project_row.customer_id
    where project_row.id = $1
      and project_row.customer_id = $2
      and project_row.deleted_at is null
      and customer_row.deleted_at is null
    for share of project_row, customer_row'
  into v_verified_customer_id
  using v_project_id, v_customer_id;

  if v_verified_customer_id is null then
    raise exception '고객 포털 토큰의 프로젝트가 고객과 일치하지 않습니다.';
  end if;

  if v_set_id is not null then
    if pg_catalog.to_regclass('public.project_material_sets') is null then
      raise exception '고객 포털 토큰의 선택안 테이블이 없습니다.';
    end if;
    v_verified_customer_id := null;
    execute '
      select set_row.customer_id
      from public.project_material_sets set_row
      where set_row.id = $1
        and set_row.project_id = $2
        and set_row.customer_id = $3
        and set_row.deleted_at is null
      for share of set_row'
    into v_verified_customer_id
    using v_set_id, v_project_id, v_customer_id;

    if v_verified_customer_id is null then
      raise exception '고객 포털 토큰의 선택안이 고객·프로젝트와 일치하지 않습니다.';
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.assert_customer_access_token_scope(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.enforce_customer_access_token_scope()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_customer_access_token_scope(pg_catalog.to_jsonb(new));
  return new;
end;
$$;

revoke all on function public.enforce_customer_access_token_scope()
from public, anon, authenticated, service_role;

do $customer_token_scope_guard$
declare
  v_update_columns text;
  v_preflight_ok boolean;
begin
  if pg_catalog.to_regclass('public.customer_access_tokens') is not null then
    select pg_catalog.string_agg(
             pg_catalog.quote_ident(attribute_row.attname),
             ', '
             order by attribute_row.attnum
           )
    into v_update_columns
    from pg_catalog.pg_attribute attribute_row
    where attribute_row.attrelid = 'public.customer_access_tokens'::regclass
      and attribute_row.attname in ('customer_id', 'project_id', 'set_id')
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped;

    if position('customer_id' in coalesce(v_update_columns, '')) = 0
       or position('project_id' in coalesce(v_update_columns, '')) = 0 then
      raise exception 'customer_access_tokens 고객·프로젝트 컬럼이 누락되었습니다.';
    end if;

    execute 'drop trigger if exists customer_access_token_scope_guard on public.customer_access_tokens';
    execute pg_catalog.format(
      'create trigger customer_access_token_scope_guard before insert or update of %s on public.customer_access_tokens for each row execute function public.enforce_customer_access_token_scope()',
      v_update_columns
    );

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
      raise exception '고객 포털 토큰 고객·프로젝트·선택안 preflight가 실패했습니다.';
    end if;
  end if;
end;
$customer_token_scope_guard$;

-- A token can outlive a later soft-delete of its customer/project/set. Every
-- portal RPC enters through this helper, so revalidate the current parent graph
-- at use time as defense in depth in addition to the write-time trigger/FKs.
do $material_token_runtime_guard$
begin
  if pg_catalog.to_regclass('public.customer_access_tokens') is not null
     and pg_catalog.to_regprocedure(
       'public._assert_material_token(text)'
     ) is not null then
    execute $replace_material_token$
      create or replace function public._assert_material_token(p_token text)
      returns public.customer_access_tokens
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $function$
      declare
        v_token public.customer_access_tokens;
      begin
        select token_row.*
        into v_token
        from public.customer_access_tokens token_row
        where token_row.token = p_token
          and token_row.revoked_at is null
          and token_row.expires_at > pg_catalog.now()
          and token_row.purpose = 'materials';

        if not found then
          raise exception '유효하지 않거나 만료된 접근 링크입니다.';
        end if;

        perform public.assert_customer_access_token_scope(
          pg_catalog.to_jsonb(v_token)
        );

        update public.customer_access_tokens
        set last_accessed_at = pg_catalog.now()
        where id = v_token.id
          and token = p_token
          and customer_id = v_token.customer_id
          and project_id = v_token.project_id
          and set_id is not distinct from v_token.set_id
          and revoked_at is null
          and expires_at > pg_catalog.now()
          and purpose = 'materials'
        returning * into v_token;

        if not found then
          raise exception '유효하지 않거나 만료된 접근 링크입니다.';
        end if;

        return v_token;
      end;
      $function$;
    $replace_material_token$;

    execute 'revoke all on function public._assert_material_token(text) from public, anon, authenticated, service_role';
  end if;
end;
$material_token_runtime_guard$;

-- Legacy assignment/quote tables predate company_id. Their original policies
-- placed is_admin() beside, rather than inside, a row-tenant predicate. Once
-- company roles become authoritative that would let an administrator of any
-- current company touch rows owned by another company. Derive ownership from
-- the assignee/customer on every operation instead.
do $tenant_policy_guard$
begin
  -- Remove legacy global-admin policies before the in-transaction widening
  -- preflight. Their RPC-only/current-company replacements are finalized
  -- below, still within this transaction.
  if pg_catalog.to_regclass('public.employees') is not null then
    execute 'drop policy if exists employees_insert_admin on public.employees';
    execute 'drop policy if exists employees_update_admin on public.employees';
    execute 'drop policy if exists employees_delete_admin on public.employees';
  end if;
  if pg_catalog.to_regclass('public.teams') is not null then
    execute 'drop policy if exists teams_write_admin on public.teams';
  end if;

  if pg_catalog.to_regclass('public.customers') is not null then
    execute 'drop policy if exists "customers_company_guard" on public.customers';
    execute 'create policy "customers_company_guard" on public.customers as restrictive for all to authenticated using (company_id = public.current_company_id()) with check (company_id = public.current_company_id())';
  end if;

  if pg_catalog.to_regclass('public.interior_quote_imports') is not null then
    execute 'drop policy if exists "interior_quote_imports_company_guard" on public.interior_quote_imports';
    execute 'create policy "interior_quote_imports_company_guard" on public.interior_quote_imports as restrictive for all to authenticated using (company_id = public.current_company_id()) with check (company_id = public.current_company_id())';
  end if;

  if pg_catalog.to_regclass('public.employee_tasks') is not null then
    execute 'drop policy if exists "staff_employee_tasks_select" on public.employee_tasks';
    execute 'create policy "staff_employee_tasks_select" on public.employee_tasks for select to authenticated using (deleted_at is null and public.can_access_schedule_assignee(assigned_employee_id) and (customer_id is null or public.can_access_customer(customer_id)) and (project_id is null or public.can_access_project(project_id)) and (quote_id is null or public.can_access_quote(quote_id)))';
    execute 'drop policy if exists "staff_employee_tasks_insert" on public.employee_tasks';
    execute 'create policy "staff_employee_tasks_insert" on public.employee_tasks for insert to authenticated with check (public.can_access_schedule_assignee(assigned_employee_id) and (customer_id is null or public.can_access_customer(customer_id)) and (project_id is null or public.can_access_project(project_id)) and (quote_id is null or public.can_access_quote(quote_id)))';
    execute 'drop policy if exists "staff_employee_tasks_update" on public.employee_tasks';
    execute 'create policy "staff_employee_tasks_update" on public.employee_tasks for update to authenticated using (public.can_access_schedule_assignee(assigned_employee_id) and (customer_id is null or public.can_access_customer(customer_id)) and (project_id is null or public.can_access_project(project_id)) and (quote_id is null or public.can_access_quote(quote_id))) with check (public.can_access_schedule_assignee(assigned_employee_id) and (customer_id is null or public.can_access_customer(customer_id)) and (project_id is null or public.can_access_project(project_id)) and (quote_id is null or public.can_access_quote(quote_id)))';
  end if;

  if pg_catalog.to_regclass('public.customer_quotes') is not null then
    execute 'drop policy if exists "customer_quotes_select" on public.customer_quotes';
    execute 'create policy "customer_quotes_select" on public.customer_quotes for select to authenticated using (deleted_at is null and public.can_access_customer(customer_id))';
    execute 'drop policy if exists "customer_quotes_insert" on public.customer_quotes';
    execute 'create policy "customer_quotes_insert" on public.customer_quotes for insert to authenticated with check (public.can_access_customer(customer_id) and (assigned_employee_id is null or public.is_current_company_employee(assigned_employee_id)))';
    execute 'drop policy if exists "customer_quotes_update" on public.customer_quotes';
    execute 'create policy "customer_quotes_update" on public.customer_quotes for update to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id) and (assigned_employee_id is null or public.is_current_company_employee(assigned_employee_id)))';
    execute 'drop policy if exists "customer_quotes_delete" on public.customer_quotes';
    execute 'create policy "customer_quotes_delete" on public.customer_quotes for delete to authenticated using (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.customer_quote_sends') is not null then
    execute 'drop policy if exists "customer_quote_sends_select" on public.customer_quote_sends';
    execute 'create policy "customer_quote_sends_select" on public.customer_quote_sends for select to authenticated using (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "customer_quote_sends_insert" on public.customer_quote_sends';
    execute 'create policy "customer_quote_sends_insert" on public.customer_quote_sends for insert to authenticated with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "customer_quote_sends_update" on public.customer_quote_sends';
    execute 'create policy "customer_quote_sends_update" on public.customer_quote_sends for update to authenticated using (public.current_company_role() in (''owner'', ''director'', ''admin'') and public.can_access_customer(customer_id)) with check (public.current_company_role() in (''owner'', ''director'', ''admin'') and public.can_access_customer(customer_id))';
    execute 'drop policy if exists "customer_quote_sends_delete" on public.customer_quote_sends';
    execute 'create policy "customer_quote_sends_delete" on public.customer_quote_sends for delete to authenticated using (public.current_company_role() in (''owner'', ''director'', ''admin'') and public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.material_approvals') is not null then
    execute 'drop policy if exists "material_approvals_select" on public.material_approvals';
    execute 'create policy "material_approvals_select" on public.material_approvals for select to authenticated using (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "material_approvals_insert" on public.material_approvals';
    execute 'create policy "material_approvals_insert" on public.material_approvals for insert to authenticated with check (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.projects') is not null then
    execute 'drop policy if exists "projects_select_erp" on public.projects';
    execute 'drop policy if exists "projects_insert_erp" on public.projects';
    execute 'drop policy if exists "projects_update_erp" on public.projects';
    execute 'drop policy if exists "projects_select" on public.projects';
    execute 'create policy "projects_select" on public.projects for select to authenticated using (deleted_at is null and public.can_access_customer(customer_id))';
    execute 'drop policy if exists "projects_insert" on public.projects';
    execute 'create policy "projects_insert" on public.projects for insert to authenticated with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "projects_update" on public.projects';
    execute 'create policy "projects_update" on public.projects for update to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "projects_delete" on public.projects';
    execute 'create policy "projects_delete" on public.projects for delete to authenticated using (public.is_admin() and public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.project_materials') is not null then
    execute 'drop policy if exists "staff_project_materials_select" on public.project_materials';
    execute 'drop policy if exists "staff_project_materials_insert" on public.project_materials';
    execute 'drop policy if exists "staff_project_materials_update" on public.project_materials';
    execute 'drop policy if exists "project_materials_select" on public.project_materials';
    execute 'create policy "project_materials_select" on public.project_materials for select to authenticated using (deleted_at is null and public.can_access_customer(customer_id))';
    execute 'drop policy if exists "project_materials_insert" on public.project_materials';
    execute 'create policy "project_materials_insert" on public.project_materials for insert to authenticated with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "project_materials_update" on public.project_materials';
    execute 'create policy "project_materials_update" on public.project_materials for update to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "project_materials_delete" on public.project_materials';
    execute 'create policy "project_materials_delete" on public.project_materials for delete to authenticated using (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.material_images') is not null then
    execute 'drop policy if exists "material_images_select" on public.material_images';
    execute 'create policy "material_images_select" on public.material_images for select to authenticated using (exists (select 1 from public.project_materials material_row where material_row.id = material_id and material_row.deleted_at is null and public.can_access_customer(material_row.customer_id)))';
    execute 'drop policy if exists "material_images_insert" on public.material_images';
    execute 'create policy "material_images_insert" on public.material_images for insert to authenticated with check (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id)))';
    execute 'drop policy if exists "material_images_update" on public.material_images';
    execute 'create policy "material_images_update" on public.material_images for update to authenticated using (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id))) with check (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id)))';
    execute 'drop policy if exists "material_images_delete" on public.material_images';
    execute 'create policy "material_images_delete" on public.material_images for delete to authenticated using (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id)))';
  end if;

  if pg_catalog.to_regclass('public.project_material_images') is not null then
    execute 'drop policy if exists "staff_project_material_images_select" on public.project_material_images';
    execute 'drop policy if exists "staff_project_material_images_insert" on public.project_material_images';
    execute 'drop policy if exists "staff_project_material_images_update" on public.project_material_images';
    execute 'drop policy if exists "staff_project_material_images_delete" on public.project_material_images';
    execute 'drop policy if exists "project_material_images_select" on public.project_material_images';
    execute 'create policy "project_material_images_select" on public.project_material_images for select to authenticated using (exists (select 1 from public.project_materials material_row where material_row.id = material_id and material_row.deleted_at is null and public.can_access_customer(material_row.customer_id)))';
    execute 'drop policy if exists "project_material_images_insert" on public.project_material_images';
    execute 'create policy "project_material_images_insert" on public.project_material_images for insert to authenticated with check (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id)))';
    execute 'drop policy if exists "project_material_images_update" on public.project_material_images';
    execute 'create policy "project_material_images_update" on public.project_material_images for update to authenticated using (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id))) with check (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id)))';
    execute 'drop policy if exists "project_material_images_delete" on public.project_material_images';
    execute 'create policy "project_material_images_delete" on public.project_material_images for delete to authenticated using (exists (select 1 from public.project_materials material_row where material_row.id = material_id and public.can_access_customer(material_row.customer_id)))';
  end if;

  if pg_catalog.to_regclass('public.material_comments') is not null then
    execute 'drop policy if exists "material_comments_select" on public.material_comments';
    execute 'create policy "material_comments_select" on public.material_comments for select to authenticated using (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "material_comments_insert" on public.material_comments';
    execute 'create policy "material_comments_insert" on public.material_comments for insert to authenticated with check (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.customer_access_tokens') is not null then
    execute 'drop policy if exists "customer_access_tokens_select" on public.customer_access_tokens';
    execute 'create policy "customer_access_tokens_select" on public.customer_access_tokens for select to authenticated using (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "customer_access_tokens_insert" on public.customer_access_tokens';
    execute 'create policy "customer_access_tokens_insert" on public.customer_access_tokens for insert to authenticated with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "customer_access_tokens_update" on public.customer_access_tokens';
    execute 'create policy "customer_access_tokens_update" on public.customer_access_tokens for update to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.material_change_requests') is not null then
    execute 'drop policy if exists "material_change_requests_staff_select" on public.material_change_requests';
    execute 'create policy "material_change_requests_staff_select" on public.material_change_requests for select to authenticated using (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "material_change_requests_staff_update" on public.material_change_requests';
    execute 'create policy "material_change_requests_staff_update" on public.material_change_requests for update to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.project_material_sets') is not null then
    execute 'drop policy if exists "project_material_sets_select" on public.project_material_sets';
    execute 'create policy "project_material_sets_select" on public.project_material_sets for select to authenticated using (deleted_at is null and public.can_access_customer(customer_id))';
    execute 'drop policy if exists "project_material_sets_insert" on public.project_material_sets';
    execute 'create policy "project_material_sets_insert" on public.project_material_sets for insert to authenticated with check (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "project_material_sets_update" on public.project_material_sets';
    execute 'create policy "project_material_sets_update" on public.project_material_sets for update to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.material_approval_versions') is not null then
    execute 'drop policy if exists "material_approval_versions_select" on public.material_approval_versions';
    execute 'create policy "material_approval_versions_select" on public.material_approval_versions for select to authenticated using (public.can_access_customer(customer_id))';
    execute 'drop policy if exists "material_approval_versions_insert" on public.material_approval_versions';
    execute 'create policy "material_approval_versions_insert" on public.material_approval_versions for insert to authenticated with check (public.can_access_customer(customer_id))';
  end if;

  if pg_catalog.to_regclass('public.material_favorites') is not null then
    execute 'drop policy if exists "material_favorites_select" on public.material_favorites';
    execute 'create policy "material_favorites_select" on public.material_favorites for select to authenticated using (user_id = auth.uid())';
    execute 'drop policy if exists "material_favorites_delete" on public.material_favorites';
    execute 'create policy "material_favorites_delete" on public.material_favorites for delete to authenticated using (user_id = auth.uid())';
  end if;

  if pg_catalog.to_regclass('storage.objects') is not null
     and pg_catalog.to_regprocedure('public.storage_customer_id(text)') is not null then
    execute 'drop policy if exists "customer_quotes_storage_select" on storage.objects';
    execute 'create policy "customer_quotes_storage_select" on storage.objects for select to authenticated using (bucket_id = ''customer-quotes'' and public.storage_customer_id(name) is not null and public.can_access_customer(public.storage_customer_id(name)))';
    execute 'drop policy if exists "customer_quotes_storage_insert" on storage.objects';
    execute 'create policy "customer_quotes_storage_insert" on storage.objects for insert to authenticated with check (bucket_id = ''customer-quotes'' and public.storage_customer_id(name) is not null and public.can_access_customer(public.storage_customer_id(name)))';
    execute 'drop policy if exists "customer_quotes_storage_update" on storage.objects';
    execute 'create policy "customer_quotes_storage_update" on storage.objects for update to authenticated using (bucket_id = ''customer-quotes'' and public.storage_customer_id(name) is not null and public.can_access_customer(public.storage_customer_id(name))) with check (bucket_id = ''customer-quotes'' and public.storage_customer_id(name) is not null and public.can_access_customer(public.storage_customer_id(name)))';
    execute 'drop policy if exists "customer_quotes_storage_delete" on storage.objects';
    execute 'create policy "customer_quotes_storage_delete" on storage.objects for delete to authenticated using (bucket_id = ''customer-quotes'' and public.storage_customer_id(name) is not null and public.can_access_customer(public.storage_customer_id(name)))';
  end if;

  if pg_catalog.to_regclass('storage.objects') is not null
     and pg_catalog.to_regprocedure('public.project_id_from_storage_path(text)') is not null then
    execute 'drop policy if exists "staff_project_materials_storage_select" on storage.objects';
    execute 'drop policy if exists "staff_project_materials_storage_insert" on storage.objects';
    execute 'drop policy if exists "staff_project_materials_storage_update" on storage.objects';
    execute 'drop policy if exists "staff_project_materials_storage_delete" on storage.objects';
    execute 'drop policy if exists "material_images_storage_select" on storage.objects';
    execute 'drop policy if exists "material_images_storage_insert" on storage.objects';
    execute 'drop policy if exists "material_images_storage_update" on storage.objects';
    execute 'drop policy if exists "material_images_storage_delete" on storage.objects';
    execute 'drop policy if exists "v1_material_storage_select" on storage.objects';
    execute 'create policy "v1_material_storage_select" on storage.objects for select to authenticated using (((bucket_id = ''project-materials'' and public.can_access_project_material_object(name)) or (bucket_id in (''material-change-requests'', ''material-images'', ''customer-change-requests'') and public.project_id_from_storage_path(name) is not null and public.can_access_project(public.project_id_from_storage_path(name)))))';
    execute 'drop policy if exists "v1_material_storage_insert" on storage.objects';
    execute 'create policy "v1_material_storage_insert" on storage.objects for insert to authenticated with check ((auth.uid() is not null and ((bucket_id = ''project-materials'' and public.can_access_project_material_object(name)) or (bucket_id in (''material-change-requests'', ''material-images'', ''customer-change-requests'') and public.project_id_from_storage_path(name) is not null and public.can_access_project(public.project_id_from_storage_path(name))))))';
    execute 'drop policy if exists "v1_material_storage_update" on storage.objects';
    execute 'create policy "v1_material_storage_update" on storage.objects for update to authenticated using (public.current_company_role() in (''owner'', ''director'', ''admin'') and ((bucket_id = ''project-materials'' and public.can_access_project_material_object(name)) or (bucket_id in (''material-change-requests'', ''material-images'', ''customer-change-requests'') and public.project_id_from_storage_path(name) is not null and public.can_access_project(public.project_id_from_storage_path(name))))) with check (public.current_company_role() in (''owner'', ''director'', ''admin'') and ((bucket_id = ''project-materials'' and public.can_access_project_material_object(name)) or (bucket_id in (''material-change-requests'', ''material-images'', ''customer-change-requests'') and public.project_id_from_storage_path(name) is not null and public.can_access_project(public.project_id_from_storage_path(name)))))';
    execute 'drop policy if exists "v1_material_storage_delete" on storage.objects';
    execute 'create policy "v1_material_storage_delete" on storage.objects for delete to authenticated using (auth.uid() is not null and ((bucket_id = ''project-materials'' and public.can_access_project_material_object(name)) or (bucket_id in (''material-change-requests'', ''material-images'', ''customer-change-requests'') and public.project_id_from_storage_path(name) is not null and public.can_access_project(public.project_id_from_storage_path(name)))))';
  end if;
end;
$tenant_policy_guard$;

-- The next function broadens which authenticated principals count as an
-- administrator. Prove the policy graph is already tenant-scoped *inside this
-- transaction* so a drifted or partially-migrated database cannot commit the
-- wider helper and only fail in the later verification transaction.
do $is_admin_widening_preflight$
declare
  v_bad_policy record;
  v_expected_storage_names text[];
  v_actual_storage_names text[];
begin
  select policy_row.schemaname,
         policy_row.tablename,
         policy_row.policyname
  into v_bad_policy
  from pg_catalog.pg_policies policy_row
  where policy_row.schemaname = 'public'
    and pg_catalog.lower(
      coalesce(policy_row.qual, '') || ' ' ||
      coalesce(policy_row.with_check, '')
    ) like '%is_admin%'
    and not exists (
      select 1
      from pg_catalog.pg_policies guard_policy
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
  limit 1;

  if v_bad_policy.policyname is not null then
    raise exception 'is_admin 확대 전 tenant guard가 없는 정책이 있습니다: %.%.%',
      v_bad_policy.schemaname,
      v_bad_policy.tablename,
      v_bad_policy.policyname;
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

    select pg_catalog.array_agg(
             policy_row.policyname::text order by policy_row.policyname
           )
    into v_actual_storage_names
    from pg_catalog.pg_policies policy_row
    where policy_row.schemaname = 'storage'
      and policy_row.tablename = 'objects';

    if exists (
      select 1
      from pg_catalog.unnest(v_expected_storage_names) expected(policy_name)
      where not (
        expected.policy_name = any(
          coalesce(v_actual_storage_names, array[]::text[])
        )
      )
    ) or exists (
      select 1
      from pg_catalog.unnest(
        coalesce(v_actual_storage_names, array[]::text[])
      ) actual(policy_name)
      where not (actual.policy_name = any(v_expected_storage_names))
    ) then
      raise exception 'is_admin 확대 전 Storage exact inventory가 올바르지 않습니다: %',
        v_actual_storage_names;
    end if;

    select policy_row.schemaname,
           policy_row.tablename,
           policy_row.policyname
    into v_bad_policy
    from pg_catalog.pg_policies policy_row
    where policy_row.schemaname = 'storage'
      and policy_row.tablename = 'objects'
      and pg_catalog.lower(
        coalesce(policy_row.qual, '') || ' ' ||
        coalesce(policy_row.with_check, '')
      ) like '%is_admin%'
    limit 1;

    if v_bad_policy.policyname is not null then
      raise exception 'is_admin 확대 전 tenant path가 없는 Storage 정책이 있습니다: %',
        v_bad_policy.policyname;
    end if;
  end if;
end;
$is_admin_widening_preflight$;

-- Widen company administrator recognition only after every tenantless policy
-- above has been replaced in this same transaction. If any cleanup fails, this
-- function change rolls back with it and no new principal gains legacy access.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_company_role() in ('owner', 'director', 'admin'),
    false
  );
$$;

revoke all on function public.is_admin()
from public, anon, authenticated, service_role;
grant execute on function public.is_admin()
to anon, authenticated, service_role;

-- Contact/profile editing is available to the exact employee account or to a
-- manager in the current company. The legacy global profiles.role shortcut is
-- intentionally excluded so it cannot bypass the company role hierarchy.
create or replace function public.update_employee_contact_profile(
  p_employee_id uuid,
  p_title text default null,
  p_phone text default null,
  p_email text default null,
  p_business_card_path text default null,
  p_clear_business_card boolean default false,
  p_show_business_card_on_quote boolean default null
)
returns public.employees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
  v_my_employee_id uuid;
  v_is_manager boolean;
  v_clear_business_card boolean := coalesce(p_clear_business_card, false);
  v_row public.employees;
  v_card_path text;
  v_path_company uuid;
  v_path_employee uuid;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.';
  end if;
  if v_company_id is null then
    raise exception '활성 회사를 확인할 수 없습니다.';
  end if;
  if p_employee_id is null then
    raise exception '직원 ID가 필요합니다.';
  end if;

  select profile_row.employee_id
  into v_my_employee_id
  from public.profiles profile_row
  where profile_row.id = v_uid
    and profile_row.active_company_id = v_company_id
    and profile_row.is_active = true
    and profile_row.is_approved = true
    and profile_row.approval_status = 'approved';

  v_is_manager := coalesce(
    v_company_role in ('owner', 'director', 'admin'),
    false
  );

  if not v_is_manager
     and v_my_employee_id is distinct from p_employee_id then
    raise exception '현재 회사의 관리자 또는 본인만 수정할 수 있습니다.';
  end if;

  select employee_row.*
  into v_row
  from public.employees employee_row
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
    and employee_row.merged_into_employee_id is null
  for update;

  if v_row.id is null then
    raise exception '현재 회사의 미병합 직원을 찾을 수 없습니다.';
  end if;

  if not v_clear_business_card and p_business_card_path is not null then
    v_card_path := nullif(pg_catalog.btrim(p_business_card_path), '');
    if v_card_path is not null then
      begin
        v_path_company := nullif(pg_catalog.split_part(v_card_path, '/', 1), '')::uuid;
        v_path_employee := nullif(pg_catalog.split_part(v_card_path, '/', 2), '')::uuid;
      exception
        when invalid_text_representation then
          raise exception '명함 경로가 올바르지 않습니다.';
      end;
      if v_path_company is distinct from v_company_id
         or v_path_employee is distinct from p_employee_id
         or nullif(pg_catalog.split_part(v_card_path, '/', 3), '') is null then
        raise exception '명함 경로는 {회사ID}/{직원ID}/파일명 형식이어야 합니다.';
      end if;
    end if;
  end if;

  update public.employees employee_row
  set title = case
        when p_title is null then employee_row.title
        else nullif(pg_catalog.btrim(p_title), '')
      end,
      phone = case
        when p_phone is null then employee_row.phone
        else nullif(pg_catalog.btrim(p_phone), '')
      end,
      email = case
        when p_email is null then employee_row.email
        else nullif(pg_catalog.btrim(p_email), '')
      end,
      business_card_path = case
        when v_clear_business_card then null
        when p_business_card_path is null then employee_row.business_card_path
        else nullif(pg_catalog.btrim(p_business_card_path), '')
      end,
      show_business_card_on_quote = case
        when p_show_business_card_on_quote is null
          then employee_row.show_business_card_on_quote
        else p_show_business_card_on_quote
      end,
      updated_at = now()
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
  returning * into v_row;

  if v_row.title is null or pg_catalog.btrim(v_row.title) = '' then
    raise exception '직책은 비울 수 없습니다.';
  end if;

  return v_row;
end;
$$;

-- Employee mutations are RPC-only. Direct table writes could bypass role
-- hierarchy, assignment checks, and audit logging even when company-scoped.
drop policy if exists employees_select_erp on public.employees;
create policy employees_select_erp
on public.employees
for select to authenticated
using (
  public.is_erp_user()
  and company_id = public.current_company_id()
);

drop policy if exists employees_insert_admin on public.employees;
drop policy if exists employees_update_admin on public.employees;
drop policy if exists employees_delete_admin on public.employees;

revoke insert, update, delete
on table public.employees
from public, anon, authenticated;

drop policy if exists teams_write_admin on public.teams;
create policy teams_write_admin
on public.teams
for all to authenticated
using (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
)
with check (
  company_id = public.current_company_id()
  and public.current_company_role() in ('owner', 'director', 'admin')
);

drop policy if exists teams_select_erp on public.teams;
create policy teams_select_erp
on public.teams
for select to authenticated
using (
  public.is_erp_user()
  and company_id = public.current_company_id()
);

-- Apply every Employee Master ACL only after all RPCs have been materialized.
-- This keeps upgrades from pre-Employee-Master databases bootstrap-safe.
revoke all
on function public.list_employee_master()
from public, anon, authenticated, service_role;
grant execute
on function public.list_employee_master()
to authenticated;

revoke all
on function public.create_employee_master(text, uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute
on function public.create_employee_master(text, uuid, text, text, text)
to authenticated;

revoke all
on function public.update_employee_master(uuid, text, uuid, text, text, text, boolean)
from public, anon, authenticated, service_role;
grant execute
on function public.update_employee_master(uuid, text, uuid, text, text, text, boolean)
to authenticated;

revoke all
on function public.transfer_employee_assignments(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute
on function public.transfer_employee_assignments(uuid, uuid)
to authenticated;

revoke all
on function public.unlink_employee_login(uuid)
from public, anon, authenticated, service_role;
grant execute
on function public.unlink_employee_login(uuid)
to authenticated;

revoke all
on function public.update_employee_login_role(uuid, text)
from public, anon, authenticated, service_role;
grant execute
on function public.update_employee_login_role(uuid, text)
to authenticated;

revoke all
on function public.get_employee_merge_impact(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute
on function public.get_employee_merge_impact(uuid, uuid)
to authenticated;

revoke all
on function public.merge_employees(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;
grant execute
on function public.merge_employees(uuid, uuid, uuid, text)
to authenticated;

revoke all
on function public.list_employee_merge_states()
from public, anon, authenticated, service_role;
grant execute
on function public.list_employee_merge_states()
to authenticated;

revoke all
on function public.can_write_employee_business_card(text)
from public, anon, authenticated, service_role;
grant execute
on function public.can_write_employee_business_card(text)
to authenticated, service_role;

revoke all
on function public.update_employee_contact_profile(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean
)
from public, anon, authenticated, service_role;

grant execute
on function public.update_employee_contact_profile(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean
)
to authenticated;

comment on function public.update_employee_contact_profile(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean
) is
  '현재 회사 owner·director·admin 또는 정확한 본인 직원만 연락처·명함을 수정한다.';

comment on function public.update_employee_login_role(uuid, text) is
  '현재 회사 역할과 멤버십을 함께 검증·갱신하며 super_admin/owner/director는 별도 절차로 보존한다.';
comment on function public.unlink_employee_login(uuid) is
  '단일회사 로그인만 pending 상태로 원자적으로 연결 해제한다.';
comment on function public.merge_employees(uuid, uuid, uuid, text) is
  '현재 회사의 직원·로그인·멤버십·업무 참조를 검증 후 원자적으로 병합한다.';
comment on function public.can_write_employee_business_card(text) is
  '현재 회사 관리자 또는 정확한 본인 직원만 회사·직원 경로의 명함 Storage 쓰기를 허용한다.';

notify pgrst, 'reload schema';

commit;
