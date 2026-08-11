-- Employee signup approval assignment guard.
-- This migration only replaces the existing RPC body. CREATE OR REPLACE keeps
-- the function's current owner and EXECUTE privileges for the same signature.

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
  if v_company_id is null then
    raise exception '현재 회사를 확인할 수 없습니다.';
  end if;

  -- Serialize approvals inside a company. This closes the check-then-insert/link
  -- race between two administrators without blocking approvals in other companies.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('approve_staff_signup:' || v_company_id::text, 0)
  );

  -- Lock and validate the selected employee before locking the signup profile.
  -- Employee merge uses the same employee row lock first, so the lock order also
  -- prevents a stale selection from being linked while a merge is in progress.
  if v_employee_id is not null then
    perform 1
    from public.employees e
    where e.id = v_employee_id
      and e.company_id = v_company_id
      and e.is_active = true
      and e.merged_into_employee_id is null
    for update;
    if not found then
      raise exception '선택한 직원을 연결할 수 없습니다. 활성·병합 상태를 확인하고 새로고침해 주세요.';
    end if;
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;
  if v_profile.id is null then raise exception '가입 프로필을 찾을 수 없습니다.'; end if;
  if v_profile.approval_status is distinct from 'pending'
     or coalesce(v_profile.is_approved, false)
     or v_profile.employee_id is not null then
    raise exception '이미 처리되었거나 직원에 연결된 가입 요청입니다. 새로고침해 주세요.';
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
