-- Employee signup approval assignment guard.
--
-- Security boundaries enforced here:
--   - the approver must be an active owner/director of the current company
--   - employees and teams must belong to that same company
--   - only an existing pending membership in the current company can be approved
--   - the approved profile and company membership are linked atomically
--   - a profile already attached to another company cannot be claimed
--   - super_admin is never granted from the employee approval workflow
--   - EXECUTE is restricted to authenticated users only

begin;

create or replace function public.approve_staff_signup(
  p_user_id uuid,
  p_role text,
  p_employee_id uuid default null,
  p_employee_name text default null,
  p_employee_title text default null,
  p_team_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_employee_id uuid := p_employee_id;
  v_company_id uuid := public.current_company_id();
  v_actor_company_role text;
  v_membership public.company_memberships%rowtype;
  v_membership_role text;
  v_employee_team_id uuid;
  v_duplicate uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if v_company_id is null then
    raise exception '현재 회사를 확인할 수 없습니다.';
  end if;

  select m.role
  into v_actor_company_role
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id
   and m.company_id = v_company_id
   and m.status = 'active'
  join public.companies c
    on c.id = m.company_id
   and c.status = 'active'
  where p.id = auth.uid()
    and p.active_company_id = v_company_id
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved'
    and m.role in ('owner', 'director')
  limit 1;

  if v_actor_company_role is null then
    raise exception '현재 회사의 owner·director만 가입을 승인할 수 있습니다.';
  end if;
  if p_role not in ('admin', 'manager', 'staff') then
    raise exception '유효하지 않은 권한입니다.';
  end if;

  if p_role = 'admin'
     and v_actor_company_role not in ('owner', 'director') then
    raise exception '관리자 권한은 회사 owner·director만 지정할 수 있습니다.';
  end if;

  v_membership_role := case
    when p_role = 'admin' then 'admin'
    else 'employee'
  end;

  -- Serialize approvals inside a company. This closes the check-then-insert/link
  -- race between two administrators without blocking approvals in other companies.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('approve_staff_signup:' || v_company_id::text, 0)
  );

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

  -- Employee merge locks employee rows before profile rows. Keep the same order
  -- here to avoid a deadlock while preventing a stale employee selection.
  if v_employee_id is not null then
    select e.team_id
    into v_employee_team_id
    from public.employees e
    where e.id = v_employee_id
      and e.company_id = v_company_id
      and e.is_active = true
      and e.merged_into_employee_id is null
    for update;
    if not found then
      raise exception '선택한 직원을 연결할 수 없습니다. 활성·병합 상태를 확인하고 새로고침해 주세요.';
    end if;
    if v_employee_team_id is not null then
      perform 1
      from public.teams employee_team
      where employee_team.id = v_employee_team_id
        and employee_team.company_id = v_company_id
      for key share;
      if not found then
        raise exception '선택한 직원의 팀이 현재 회사와 일치하지 않습니다.';
      end if;
    end if;
  end if;

  -- A second approval (including one from another company) waits here and then
  -- fails the pending-state check after the first transaction commits.
  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if v_profile.id is null then
    raise exception '가입 프로필을 찾을 수 없습니다.';
  end if;
  if v_profile.approval_status is distinct from 'pending'
     or coalesce(v_profile.is_approved, false)
     or v_profile.is_active
     or v_profile.employee_id is not null then
    raise exception '이미 처리되었거나 직원에 연결된 가입 요청입니다. 새로고침해 주세요.';
  end if;
  if v_profile.active_company_id is not null
     and v_profile.active_company_id <> v_company_id then
    raise exception '다른 회사에 연결된 가입 요청은 승인할 수 없습니다.';
  end if;

  -- A profile has one employee_id in the current schema. Do not attach a user
  -- who already has an active/pending relationship with another company.
  if exists (
    select 1
    from public.company_memberships other_membership
    where other_membership.user_id = p_user_id
      and other_membership.company_id <> v_company_id
      and other_membership.status in ('pending', 'active')
  ) then
    raise exception '다른 회사에 연결되었거나 승인 대기 중인 계정입니다.';
  end if;

  select m.*
  into v_membership
  from public.company_memberships m
  where m.company_id = v_company_id
    and m.user_id = p_user_id
  for update;

  if v_membership.id is null or v_membership.status <> 'pending' then
    raise exception '현재 회사의 승인 대기 멤버십을 찾을 수 없습니다. 회사 초대 링크를 다시 확인해 주세요.';
  end if;
  if v_membership.role in ('owner', 'director') then
    raise exception '회사 owner·director 멤버십은 가입 승인 화면에서 변경할 수 없습니다.';
  end if;
  if v_membership.employee_id is not null
     and v_membership.employee_id is distinct from v_employee_id then
    raise exception '회사 멤버십에 다른 직원이 이미 연결되어 있습니다.';
  end if;

  if v_employee_id is not null then
    perform 1
    from public.profiles p
    where p.employee_id = v_employee_id
      and p.id <> p_user_id
    for update;
    if found then
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
    where e.company_id = v_company_id
      and (
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
      raise exception '기존 직원 Master가 발견되었습니다. 직원 Master의 병합/보관 상태를 확인하세요.';
    end if;

    insert into public.employees
      (company_id, team_id, name, title, phone, email, is_active, sort_order)
    values
      (v_company_id, p_team_id, trim(p_employee_name), trim(p_employee_title),
       v_profile.phone, v_profile.email, true, 100)
    returning id into v_employee_id;
  end if;

  update public.company_memberships
  set employee_id = v_employee_id,
      role = v_membership_role,
      status = 'active',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = null,
      updated_at = now()
  where id = v_membership.id
    and company_id = v_company_id
    and user_id = p_user_id
    and status = 'pending';

  update public.profiles
  set employee_id = v_employee_id,
      active_company_id = v_company_id,
      role = p_role,
      is_active = true,
      is_approved = true, approval_status = 'approved', approved_at = now(),
      approved_by = auth.uid(), rejected_at = null, rejection_reason = null,
      updated_at = now()
  where id = p_user_id
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.list_pending_company_signups()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if auth.uid() is null
     or v_company_id is null
     or not public.can_approve_company_members(v_company_id) then
    raise exception '현재 회사의 owner·director만 가입 요청을 조회할 수 있습니다.';
  end if;

  return query
  select profile_row.*
  from public.profiles profile_row
  join public.company_memberships membership_row
    on membership_row.user_id = profile_row.id
   and membership_row.company_id = v_company_id
   and membership_row.status = 'pending'
  where profile_row.approval_status = 'pending'
    and profile_row.is_approved = false
    and profile_row.is_active = false
    and profile_row.employee_id is null
    and (
      profile_row.active_company_id is null
      or profile_row.active_company_id = v_company_id
    )
  order by profile_row.created_at desc;
end;
$$;

create or replace function public.list_managed_company_profiles()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if auth.uid() is null
     or v_company_id is null
     or not public.can_approve_company_members(v_company_id) then
    raise exception '현재 회사의 owner·director만 로그인 계정을 조회할 수 있습니다.';
  end if;

  return query
  select profile_row.*
  from public.profiles profile_row
  join public.company_memberships membership_row
    on membership_row.user_id = profile_row.id
   and membership_row.company_id = v_company_id
  order by profile_row.created_at desc
  limit 200;
end;
$$;

create or replace function public.reject_staff_signup(
  p_user_id uuid,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_profile public.profiles;
  v_membership public.company_memberships%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null
     or v_company_id is null
     or not public.can_approve_company_members(v_company_id) then
    raise exception '현재 회사의 owner·director만 가입을 거절할 수 있습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('approve_staff_signup:' || v_company_id::text, 0)
  );

  select profile_row.*
  into v_profile
  from public.profiles profile_row
  where profile_row.id = p_user_id
  for update;

  select membership_row.*
  into v_membership
  from public.company_memberships membership_row
  where membership_row.company_id = v_company_id
    and membership_row.user_id = p_user_id
  for update;

  if v_profile.id is null
     or v_profile.approval_status <> 'pending'
     or v_profile.is_approved
     or v_profile.is_active
     or v_profile.employee_id is not null
     or (
       v_profile.active_company_id is not null
       and v_profile.active_company_id <> v_company_id
     )
     or v_membership.id is null
     or v_membership.status <> 'pending'
     or v_membership.role in ('owner', 'director') then
    raise exception '현재 회사의 승인 대기 가입 요청을 찾을 수 없습니다.';
  end if;

  update public.company_memberships
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = v_reason,
      updated_at = now()
  where id = v_membership.id
    and company_id = v_company_id
    and user_id = p_user_id
    and status = 'pending';

  update public.profiles
  set is_active = false,
      is_approved = false,
      approval_status = 'rejected',
      rejected_at = now(),
      rejection_reason = v_reason,
      updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.deactivate_staff_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_profile public.profiles;
  v_membership public.company_memberships%rowtype;
begin
  if auth.uid() is null
     or v_company_id is null
     or not public.can_approve_company_members(v_company_id) then
    raise exception '현재 회사의 owner·director만 계정을 비활성화할 수 있습니다.';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인 계정은 비활성화할 수 없습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('approve_staff_signup:' || v_company_id::text, 0)
  );

  select profile_row.*
  into v_profile
  from public.profiles profile_row
  where profile_row.id = p_user_id
  for update;

  select membership_row.*
  into v_membership
  from public.company_memberships membership_row
  where membership_row.company_id = v_company_id
    and membership_row.user_id = p_user_id
  for update;

  if v_profile.id is null
     or not v_profile.is_active
     or not v_profile.is_approved
     or v_profile.approval_status <> 'approved'
     or v_profile.active_company_id <> v_company_id
     or v_profile.employee_id is null
     or v_membership.id is null
     or v_membership.status <> 'active'
     or v_membership.employee_id is distinct from v_profile.employee_id then
    raise exception '현재 회사의 활성 계정을 찾을 수 없습니다.';
  end if;
  if v_membership.role in ('owner', 'director') then
    raise exception '회사 owner·director 계정은 이 화면에서 비활성화할 수 없습니다.';
  end if;
  if exists (
    select 1
    from public.company_memberships other_membership
    where other_membership.user_id = p_user_id
      and other_membership.company_id <> v_company_id
      and other_membership.status = 'active'
  ) then
    raise exception '다른 회사에서도 사용 중인 계정은 전역 비활성화할 수 없습니다.';
  end if;

  update public.company_memberships
  set status = 'suspended',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = v_membership.id
    and company_id = v_company_id
    and user_id = p_user_id
    and status = 'active';

  update public.profiles
  set is_active = false,
      updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

-- The legacy trigger trusted the global public.is_admin() role for every profile
-- update. Direct profile updates are self-only below, so retain an exception only
-- for a current-company manager changing another profile through a scoped
-- SECURITY DEFINER workflow. This also lets a self-service company owner whose
-- global profile role remains staff manage their own company safely.
create or replace function public.profiles_enforce_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.id is distinct from auth.uid()
     and public.current_company_role() in ('owner', 'director', 'admin') then
    return new;
  end if;

  -- register_my_company() is the only flow allowed to activate a caller who is
  -- still pending. Keep its original narrow transition and membership checks.
  if auth.uid() is not null
     and pg_catalog.current_setting(
       'app.self_service_company_registration_user',
       true
     ) = auth.uid()::text
     and old.id = auth.uid()
     and new.id = old.id
     and old.role = 'staff'
     and new.role = 'staff'
     and old.employee_id is not distinct from new.employee_id
     and old.permissions is not distinct from new.permissions
     and old.is_active = false
     and old.is_approved = false
     and old.approval_status = 'pending'
     and new.is_active = true
     and new.is_approved = true
     and new.approval_status = 'approved'
     and new.approved_at is not null
     and new.approved_by = auth.uid()
     and new.active_company_id is not null
     and exists (
       select 1
       from public.company_memberships membership_row
       join public.companies company_row
         on company_row.id = membership_row.company_id
       where membership_row.user_id = auth.uid()
         and membership_row.company_id = new.active_company_id
         and membership_row.role = 'owner'
         and membership_row.status = 'active'
         and company_row.status = 'active'
         and company_row.created_by = auth.uid()
     )
  then
    return new;
  end if;

  -- A signed-in user may switch only to one of their active companies. This is
  -- the same invariant enforced by set_active_company(), and no other sensitive
  -- profile field may change as part of the switch.
  if auth.uid() is not null
     and old.id = auth.uid()
     and new.id = old.id
     and new.active_company_id is distinct from old.active_company_id
     and new.active_company_id is not null
     and new.role is not distinct from old.role
     and new.is_approved is not distinct from old.is_approved
     and new.is_active is not distinct from old.is_active
     and new.employee_id is not distinct from old.employee_id
     and new.permissions is not distinct from old.permissions
     and new.approval_status is not distinct from old.approval_status
     and new.approved_at is not distinct from old.approved_at
     and new.approved_by is not distinct from old.approved_by
     and new.rejected_at is not distinct from old.rejected_at
     and new.rejection_reason is not distinct from old.rejection_reason
     and exists (
       select 1
       from public.company_memberships membership_row
       join public.companies company_row
         on company_row.id = membership_row.company_id
       where membership_row.user_id = auth.uid()
         and membership_row.company_id = new.active_company_id
         and membership_row.status = 'active'
         and company_row.status = 'active'
     )
  then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.is_approved is distinct from old.is_approved
    or new.is_active is distinct from old.is_active
    or new.employee_id is distinct from old.employee_id
    or new.permissions is distinct from old.permissions
    or new.active_company_id is distinct from old.active_company_id
    or new.approval_status is distinct from old.approval_status
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.rejected_at is distinct from old.rejected_at
    or new.rejection_reason is distinct from old.rejection_reason
  then
    raise exception '승인·역할 변경 권한이 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_security on public.profiles;
create trigger profiles_enforce_security
  before update on public.profiles
  for each row execute function public.profiles_enforce_security();

-- Direct profile reads/updates are self-only. Company administration uses the
-- narrowly scoped SECURITY DEFINER functions above instead of global is_admin().
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and role = 'staff'
    and coalesce(is_approved, false) = false
    and coalesce(is_active, false) = false
    and coalesce(approval_status, 'pending') = 'pending'
  );

revoke all
on function public.approve_staff_signup(uuid, text, uuid, text, text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.approve_staff_signup(uuid, text, uuid, text, text, uuid)
to authenticated;

revoke all
on function public.list_pending_company_signups()
from public, anon, authenticated, service_role;

grant execute
on function public.list_pending_company_signups()
to authenticated;

revoke all
on function public.list_managed_company_profiles()
from public, anon, authenticated, service_role;

grant execute
on function public.list_managed_company_profiles()
to authenticated;

revoke all
on function public.reject_staff_signup(uuid, text)
from public, anon, authenticated, service_role;

grant execute
on function public.reject_staff_signup(uuid, text)
to authenticated;

revoke all
on function public.deactivate_staff_user(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.deactivate_staff_user(uuid)
to authenticated;

revoke all
on function public.profiles_enforce_security()
from public, anon, authenticated, service_role;

comment on function public.approve_staff_signup(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid
) is
  '현재 회사의 권한 있는 관리자가 직원·멤버십·프로필을 원자적으로 연결해 가입을 승인한다.';

comment on function public.list_pending_company_signups() is
  '현재 회사의 owner·director에게 현재 회사의 승인 대기 가입 요청만 반환한다.';

comment on function public.list_managed_company_profiles() is
  '현재 회사의 owner·director에게 현재 회사 멤버십이 있는 로그인 계정만 반환한다.';

comment on function public.reject_staff_signup(uuid, text) is
  '현재 회사의 pending 멤버십과 가입 프로필을 원자적으로 거절한다.';

comment on function public.deactivate_staff_user(uuid) is
  '현재 회사의 활성 직원 멤버십을 중지하고 단일회사 프로필을 비활성화한다.';

notify pgrst, 'reload schema';

commit;
