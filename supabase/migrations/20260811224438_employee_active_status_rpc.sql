-- Employee Master status-only mutation.
--
-- Goals:
--   1. Detail edits cannot silently archive/restore an employee.
--   2. Archive/restore changes only is_active + updated_at under one row lock.
--   3. Existing self, owner/director/admin, merge, and assignment guards stay
--      inside the database and every real status change is audited.

begin;

-- Internal guard. This is created first so the public status RPC is complete
-- before the generic Employee Master update is restricted below.
create or replace function public.assert_employee_active_status_change(
  p_employee_id uuid,
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
  v_assignment_ref record;
  v_has_assignments boolean;
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원 상태를 변경할 수 있습니다.';
  end if;
  if p_employee_id is null then
    raise exception '직원을 선택해 주세요.';
  end if;
  if p_is_active is null then
    raise exception '직원 활성 상태가 필요합니다.';
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
    raise exception '이미 병합된 직원은 상태를 변경할 수 없습니다.';
  end if;
  if v_before.is_active = p_is_active then
    return v_before;
  end if;

  -- Activation does not create an assignment. The row lock and company/merge
  -- checks above are sufficient; deactivation needs the stronger guards below.
  if p_is_active then
    return v_before;
  end if;

  if exists (
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

  if exists (
    select 1
    from public.profiles profile_row
    where profile_row.id = auth.uid()
      and profile_row.employee_id = p_employee_id
  ) then
    raise exception '현재 로그인한 본인 직원은 비활성화할 수 없습니다.';
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

  return v_before;
end;
$$;

create or replace function public.set_employee_active_status(
  p_employee_id uuid,
  p_is_active boolean
)
returns public.employees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.employees;
  v_employee public.employees;
begin
  select guard_row.*
  into v_before
  from public.assert_employee_active_status_change(
    p_employee_id,
    p_is_active
  ) guard_row;

  if v_before.is_active = p_is_active then
    return v_before;
  end if;

  update public.employees employee_row
  set is_active = p_is_active,
      updated_at = now()
  where employee_row.id = p_employee_id
    and employee_row.company_id = v_company_id
  returning employee_row.* into v_employee;

  if v_employee.id is null then
    raise exception '직원 상태를 변경하지 못했습니다.';
  end if;

  insert into public.employee_master_events (
    company_id,
    employee_id,
    event_type,
    actor_id,
    before_data,
    after_data,
    detail
  ) values (
    v_company_id,
    v_employee.id,
    'status_changed',
    auth.uid(),
    to_jsonb(v_before),
    to_jsonb(v_employee),
    jsonb_build_object(
      'operation', case when p_is_active then 'restored' else 'archived' end,
      'mutation', 'set_employee_active_status'
    )
  );

  return v_employee;
end;
$$;

-- Generic detail edits must preserve the locked row's current status. Keep the
-- legacy parameter for API compatibility, but reject any attempted transition.
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
  if p_is_active is distinct from v_before.is_active then
    raise exception '직원 상태 변경은 전용 보관·복원 절차를 사용해 주세요.';
  end if;

  update public.employees employee_row
  set name = pg_catalog.btrim(p_name),
      team_id = p_team_id,
      title = pg_catalog.btrim(p_title),
      phone = nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''),
      email = nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), ''),
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
    'updated',
    auth.uid(),
    to_jsonb(v_before),
    to_jsonb(v_employee)
  );

  return v_employee;
end;
$$;

revoke all
on function public.assert_employee_active_status_change(uuid, boolean)
from public, anon, authenticated, service_role;

revoke all
on function public.set_employee_active_status(uuid, boolean)
from public, anon, authenticated, service_role;
grant execute
on function public.set_employee_active_status(uuid, boolean)
to authenticated;

revoke all
on function public.update_employee_master(uuid, text, uuid, text, text, text, boolean)
from public, anon, authenticated, service_role;
grant execute
on function public.update_employee_master(uuid, text, uuid, text, text, text, boolean)
to authenticated;

commit;
