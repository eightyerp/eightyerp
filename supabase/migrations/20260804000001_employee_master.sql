-- Employee Master: employees remain the permanent business identity.
-- Login profiles can be linked/unlinked without changing employee-owned data.

create table if not exists public.employee_master_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  employee_id uuid not null references public.employees(id),
  event_type text not null,
  actor_id uuid references auth.users(id),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists employee_master_events_employee_created_idx
  on public.employee_master_events(company_id, employee_id, created_at desc);
alter table public.employee_master_events enable row level security;
drop policy if exists employee_master_events_select_admin on public.employee_master_events;
create policy employee_master_events_select_admin on public.employee_master_events
  for select to authenticated using (
    company_id = public.current_company_id()
    and (public.is_admin() or public.current_company_role() in ('owner','director','admin'))
  );

create or replace function public.normalize_employee_phone(p_value text)
returns text language sql immutable parallel safe
as $$ select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '') $$;

create or replace function public.prevent_employee_delete()
returns trigger language plpgsql
as $$
begin
  raise exception '직원 Master는 삭제할 수 없습니다. 비활성화를 사용하세요.';
end;
$$;

drop trigger if exists employees_prevent_delete on public.employees;
create trigger employees_prevent_delete
before delete on public.employees
for each row execute function public.prevent_employee_delete();

create or replace function public.prevent_employee_duplicate()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if nullif(lower(trim(coalesce(new.email, ''))), '') is not null and exists (
    select 1 from public.employees e
    where e.company_id = new.company_id and e.id <> new.id
      and lower(trim(coalesce(e.email, ''))) = lower(trim(new.email))
  ) then
    raise exception '동일 이메일의 직원 Master가 이미 존재합니다.';
  end if;

  if public.normalize_employee_phone(new.phone) is not null and exists (
    select 1 from public.employees e
    where e.company_id = new.company_id and e.id <> new.id
      and public.normalize_employee_phone(e.phone) = public.normalize_employee_phone(new.phone)
  ) then
    raise exception '동일 전화번호의 직원 Master가 이미 존재합니다.';
  end if;

  if exists (
    select 1 from public.employees e
    where e.company_id = new.company_id and e.id <> new.id
      and lower(trim(e.name)) = lower(trim(new.name))
      and e.team_id is not distinct from new.team_id
  ) then
    raise exception '동일 이름과 팀의 직원 Master가 이미 존재합니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_prevent_duplicate on public.employees;
create trigger employees_prevent_duplicate
before insert or update of email, phone, name, team_id, company_id on public.employees
for each row execute function public.prevent_employee_duplicate();

do $$
begin
  if exists (
    select 1 from public.profiles
    where employee_id is not null
    group by employee_id having count(*) > 1
  ) then
    raise exception '한 직원에 여러 로그인 프로필이 연결되어 있습니다. Master 마이그레이션을 중단합니다.';
  end if;
end;
$$;

create unique index if not exists profiles_employee_login_uidx
  on public.profiles (employee_id)
  where employee_id is not null;

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
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_erp_user() then raise exception 'ERP 접근 권한이 없습니다.'; end if;
  return query
  select e.id, e.company_id, e.team_id, e.name, e.title, e.phone, e.email,
         e.business_card_path, e.show_business_card_on_quote, e.is_active,
         e.sort_order, e.created_at, e.updated_at, p.id, coalesce(u.email, p.email),
         p.id is not null, coalesce(p.is_active, false), p.approval_status,
         p.role, coalesce(p.permissions, '{}'::jsonb), u.last_sign_in_at,
         (select count(*) from public.customers c
          where c.assigned_employee_id = e.id and c.deleted_at is null),
         (select count(*) from public.quotes q
          where q.assigned_employee_id = e.id and q.deleted_at is null),
         ((select count(*) from public.customer_schedules cs
           where cs.assigned_employee_id = e.id and cs.deleted_at is null)
          + (select count(*) from public.project_process_schedules ps
             where ps.assigned_employee_id = e.id and ps.deleted_at is null))
  from public.employees e
  left join public.profiles p on p.employee_id = e.id
  left join auth.users u on u.id = p.id
  where e.company_id = public.current_company_id()
    and (
      public.is_admin()
      or public.current_company_role() in ('owner', 'director', 'admin')
      or e.id = public.current_employee_id()
    )
  order by e.sort_order, e.name;
end;
$$;

create or replace function public.create_employee_master(
  p_name text, p_team_id uuid, p_title text, p_phone text, p_email text
)
returns public.employees
language plpgsql security definer set search_path = public
as $$
declare v_employee public.employees;
begin
  if not (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin')) then
    raise exception '관리자만 직원을 생성할 수 있습니다.';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception '이름이 필요합니다.'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception '직책이 필요합니다.'; end if;
  insert into public.employees
    (company_id, team_id, name, title, phone, email, is_active, sort_order)
  values
    (public.current_company_id(), p_team_id, trim(p_name), trim(p_title),
     nullif(trim(coalesce(p_phone, '')), ''), nullif(lower(trim(coalesce(p_email, ''))), ''), true, 100)
  returning * into v_employee;
  insert into public.employee_master_events(company_id, employee_id, event_type, actor_id, after_data)
  values (v_employee.company_id, v_employee.id, 'created', auth.uid(), to_jsonb(v_employee));
  return v_employee;
end;
$$;

create or replace function public.update_employee_master(
  p_employee_id uuid, p_name text, p_team_id uuid, p_title text,
  p_phone text, p_email text, p_is_active boolean
)
returns public.employees
language plpgsql security definer set search_path = public
as $$
declare v_employee public.employees; v_before public.employees;
begin
  if not (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin')) then
    raise exception '관리자만 직원 Master를 수정할 수 있습니다.';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception '이름이 필요합니다.'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception '직책이 필요합니다.'; end if;
  select * into v_before from public.employees
  where id = p_employee_id and company_id = public.current_company_id() for update;
  if v_before.id is null then raise exception '직원 Master를 찾을 수 없습니다.'; end if;
  if not p_is_active and exists (
    select 1 from public.customers where assigned_employee_id = p_employee_id and deleted_at is null
    union all select 1 from public.quotes where assigned_employee_id = p_employee_id and deleted_at is null
    union all select 1 from public.customer_schedules where assigned_employee_id = p_employee_id and deleted_at is null
    union all select 1 from public.project_process_schedules where assigned_employee_id = p_employee_id and deleted_at is null
  ) then
    raise exception '담당 업무가 남아 있어 비활성화할 수 없습니다. 먼저 일괄 이전하세요.';
  end if;
  update public.employees
  set name = trim(p_name), team_id = p_team_id, title = trim(p_title),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      email = nullif(lower(trim(coalesce(p_email, ''))), ''),
      is_active = p_is_active, updated_at = now()
  where id = p_employee_id and company_id = public.current_company_id()
  returning * into v_employee;
  insert into public.employee_master_events(company_id, employee_id, event_type, actor_id, before_data, after_data)
  values (v_employee.company_id, v_employee.id,
    case when v_before.is_active is distinct from v_employee.is_active then 'status_changed' else 'updated' end,
    auth.uid(), to_jsonb(v_before), to_jsonb(v_employee));
  return v_employee;
end;
$$;

create or replace function public.transfer_employee_assignments(
  p_from_employee_id uuid, p_to_employee_id uuid
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_company uuid := public.current_company_id();
  v_customers integer; v_quotes integer; v_customer_schedules integer; v_process_schedules integer;
begin
  if not (public.is_admin() or public.current_company_role() in ('owner','director','admin')) then
    raise exception '관리자만 담당 업무를 이전할 수 있습니다.';
  end if;
  if p_from_employee_id = p_to_employee_id then raise exception '같은 직원에게 이전할 수 없습니다.'; end if;
  if not exists (select 1 from public.employees where id = p_from_employee_id and company_id = v_company) then raise exception '원본 직원을 찾을 수 없습니다.'; end if;
  if not exists (select 1 from public.employees where id = p_to_employee_id and company_id = v_company and is_active) then raise exception '활성 대상 직원을 찾을 수 없습니다.'; end if;

  update public.customers set assigned_employee_id = p_to_employee_id, updated_at = now()
  where assigned_employee_id = p_from_employee_id and deleted_at is null;
  get diagnostics v_customers = row_count;
  update public.quotes set assigned_employee_id = p_to_employee_id, updated_at = now()
  where assigned_employee_id = p_from_employee_id and deleted_at is null;
  get diagnostics v_quotes = row_count;
  update public.customer_schedules set assigned_employee_id = p_to_employee_id, updated_at = now()
  where assigned_employee_id = p_from_employee_id and deleted_at is null;
  get diagnostics v_customer_schedules = row_count;
  update public.project_process_schedules set assigned_employee_id = p_to_employee_id, updated_at = now()
  where assigned_employee_id = p_from_employee_id and deleted_at is null;
  get diagnostics v_process_schedules = row_count;

  insert into public.employee_master_events(company_id, employee_id, event_type, actor_id, detail)
  values (v_company, p_from_employee_id, 'assignments_transferred', auth.uid(),
    jsonb_build_object('to_employee_id', p_to_employee_id, 'customers', v_customers,
      'quotes', v_quotes, 'customer_schedules', v_customer_schedules,
      'process_schedules', v_process_schedules));
  return jsonb_build_object('customers', v_customers, 'quotes', v_quotes,
    'customer_schedules', v_customer_schedules, 'process_schedules', v_process_schedules);
end;
$$;

create or replace function public.unlink_employee_login(p_employee_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_profile_id uuid;
begin
  if not (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin')) then
    raise exception '관리자만 계정 연결을 해제할 수 있습니다.';
  end if;
  select p.id into v_profile_id
  from public.profiles p join public.employees e on e.id = p.employee_id
  where e.id = p_employee_id and e.company_id = public.current_company_id()
  for update;
  if v_profile_id is null then raise exception '연결된 로그인 계정이 없습니다.'; end if;
  if v_profile_id = auth.uid() then raise exception '현재 로그인한 본인 계정은 연결 해제할 수 없습니다.'; end if;
  update public.profiles
  set employee_id = null, is_active = false, is_approved = false,
      approval_status = 'pending', approved_at = null, approved_by = null,
      updated_at = now()
  where id = v_profile_id;
end;
$$;

create or replace function public.update_employee_login_role(
  p_employee_id uuid,
  p_role text
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin')) then
    raise exception '관리자만 계정 권한을 변경할 수 있습니다.';
  end if;
  if p_role not in ('super_admin', 'admin', 'manager', 'staff') then
    raise exception '유효하지 않은 권한입니다.';
  end if;
  update public.profiles p
  set role = p_role, updated_at = now()
  from public.employees e
  where p.employee_id = e.id and e.id = p_employee_id
    and e.company_id = public.current_company_id();
  if not found then raise exception '연결된 로그인 계정을 찾을 수 없습니다.'; end if;
end;
$$;

create or replace function public.approve_staff_signup(
  p_user_id uuid,
  p_role text,
  p_employee_id uuid default null,
  p_employee_name text default null,
  p_employee_title text default null,
  p_team_id uuid default null
)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_employee_id uuid := p_employee_id;
  v_company_id uuid := public.current_company_id();
  v_duplicate uuid;
begin
  if not public.is_admin() then raise exception '관리자만 가입을 승인할 수 있습니다.'; end if;
  if p_role not in ('super_admin', 'admin', 'manager', 'staff') then
    raise exception '유효하지 않은 권한입니다.';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null then raise exception '가입 프로필을 찾을 수 없습니다.'; end if;

  if v_employee_id is not null then
    perform 1 from public.employees e
    where e.id = v_employee_id and e.company_id = v_company_id;
    if not found then raise exception '선택한 직원 Master를 찾을 수 없습니다.'; end if;
    if exists (select 1 from public.profiles p where p.employee_id = v_employee_id and p.id <> p_user_id) then
      raise exception '선택한 직원에는 이미 로그인 계정이 연결되어 있습니다.';
    end if;
  else
    if nullif(trim(coalesce(p_employee_name, '')), '') is null then
      raise exception '새 직원 이름이 필요합니다.';
    end if;
    if nullif(trim(coalesce(p_employee_title, '')), '') is null then
      raise exception '새 직원 직급이 필요합니다.';
    end if;

    select e.id into v_duplicate
    from public.employees e
    left join public.teams t on t.id = e.team_id
    where e.company_id = v_company_id and (
      (nullif(lower(trim(coalesce(v_profile.email, ''))), '') is not null
       and lower(trim(coalesce(e.email, ''))) = lower(trim(v_profile.email)))
      or (public.normalize_employee_phone(v_profile.phone) is not null
       and public.normalize_employee_phone(e.phone) = public.normalize_employee_phone(v_profile.phone))
      or (lower(trim(e.name)) = lower(trim(p_employee_name))
       and (e.team_id is not distinct from p_team_id
         or lower(trim(coalesce(t.name, ''))) = lower(trim(coalesce(v_profile.requested_team, '')))))
    )
    order by
      case when lower(trim(coalesce(e.email, ''))) = lower(trim(coalesce(v_profile.email, ''))) then 1
           when public.normalize_employee_phone(e.phone) = public.normalize_employee_phone(v_profile.phone) then 2
           else 3 end,
      e.sort_order
    limit 1;
    if v_duplicate is not null then
      raise exception '기존 직원 Master가 발견되었습니다. 새로 만들지 말고 기존 직원 연결을 사용하세요.';
    end if;

    insert into public.employees
      (company_id, team_id, name, title, phone, email, is_active, sort_order)
    values
      (v_company_id, p_team_id, trim(p_employee_name), trim(p_employee_title),
       v_profile.phone, v_profile.email, true, 100)
    returning id into v_employee_id;
  end if;

  update public.profiles
  set employee_id = v_employee_id, role = p_role, is_active = true,
      is_approved = true, approval_status = 'approved', approved_at = now(),
      approved_by = auth.uid(), rejected_at = null, rejection_reason = null,
      updated_at = now()
  where id = p_user_id
  returning * into v_profile;
  return v_profile;
end;
$$;

grant execute on function public.list_employee_master() to authenticated;
grant execute on function public.create_employee_master(text, uuid, text, text, text) to authenticated;
grant execute on function public.update_employee_master(uuid, text, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.transfer_employee_assignments(uuid, uuid) to authenticated;
grant execute on function public.unlink_employee_login(uuid) to authenticated;
grant execute on function public.update_employee_login_role(uuid, text) to authenticated;
grant execute on function public.approve_staff_signup(uuid, text, uuid, text, text, uuid) to authenticated;
revoke all on function public.prevent_employee_delete() from public, anon, authenticated;
revoke all on function public.prevent_employee_duplicate() from public, anon, authenticated;

notify pgrst, 'reload schema';
