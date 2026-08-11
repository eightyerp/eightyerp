-- Employee Master and merge company-scope guard.
--
-- Removes legacy global-profile-role bypasses, keeps profile and membership
-- state aligned, and reserves super_admin/owner/director for a separate
-- governance workflow.

begin;

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
  if p_other_login_action not in ('unlink', 'deactivate') then
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

comment on function public.update_employee_login_role(uuid, text) is
  '현재 회사 역할과 멤버십을 함께 검증·갱신하며 super_admin/owner/director는 별도 절차로 보존한다.';
comment on function public.unlink_employee_login(uuid) is
  '단일회사 로그인만 pending 상태로 원자적으로 연결 해제한다.';
comment on function public.merge_employees(uuid, uuid, uuid, text) is
  '현재 회사의 직원·로그인·멤버십·업무 참조를 검증 후 원자적으로 병합한다.';

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
  if not coalesce(p_is_active, false)
     and exists (
       select 1
       from public.customers customer_row
       where customer_row.company_id = v_company_id
         and customer_row.assigned_employee_id = p_employee_id
         and customer_row.deleted_at is null
       union all
       select 1
       from public.quotes quote_row
       where quote_row.company_id = v_company_id
         and quote_row.assigned_employee_id = p_employee_id
         and quote_row.deleted_at is null
       union all
       select 1
       from public.customer_schedules schedule_row
       where schedule_row.company_id = v_company_id
         and schedule_row.assigned_employee_id = p_employee_id
         and schedule_row.deleted_at is null
       union all
       select 1
       from public.project_process_schedules process_row
       where process_row.company_id = v_company_id
         and process_row.assigned_employee_id = p_employee_id
         and process_row.deleted_at is null
     ) then
    raise exception '담당 업무가 남아 있어 비활성화할 수 없습니다. 먼저 일괄 이전하세요.';
  end if;

  update public.employees employee_row
  set name = pg_catalog.btrim(p_name),
      team_id = p_team_id,
      title = pg_catalog.btrim(p_title),
      phone = nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''),
      email = nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), ''),
      is_active = coalesce(p_is_active, false),
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
  v_customers integer;
  v_quotes integer;
  v_customer_schedules integer;
  v_process_schedules integer;
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

  update public.customers customer_row
  set assigned_employee_id = p_to_employee_id,
      updated_at = now()
  where customer_row.company_id = v_company_id
    and customer_row.assigned_employee_id = p_from_employee_id
    and customer_row.deleted_at is null;
  get diagnostics v_customers = row_count;

  update public.quotes quote_row
  set assigned_employee_id = p_to_employee_id,
      updated_at = now()
  where quote_row.company_id = v_company_id
    and quote_row.assigned_employee_id = p_from_employee_id
    and quote_row.deleted_at is null;
  get diagnostics v_quotes = row_count;

  update public.customer_schedules schedule_row
  set assigned_employee_id = p_to_employee_id,
      updated_at = now()
  where schedule_row.company_id = v_company_id
    and schedule_row.assigned_employee_id = p_from_employee_id
    and schedule_row.deleted_at is null;
  get diagnostics v_customer_schedules = row_count;

  update public.project_process_schedules process_row
  set assigned_employee_id = p_to_employee_id,
      updated_at = now()
  where process_row.company_id = v_company_id
    and process_row.assigned_employee_id = p_from_employee_id
    and process_row.deleted_at is null;
  get diagnostics v_process_schedules = row_count;

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
    jsonb_build_object(
      'to_employee_id', p_to_employee_id,
      'customers', v_customers,
      'quotes', v_quotes,
      'customer_schedules', v_customer_schedules,
      'process_schedules', v_process_schedules
    )
  );

  return jsonb_build_object(
    'customers', v_customers,
    'quotes', v_quotes,
    'customer_schedules', v_customer_schedules,
    'process_schedules', v_process_schedules
  );
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

notify pgrst, 'reload schema';

commit;
