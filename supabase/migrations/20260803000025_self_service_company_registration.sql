-- =============================================================================
-- Eighty ERP — 회사 기능 6C-1: 셀프 회사 개설 보안 기반
-- 파일: 20260803000025_self_service_company_registration.sql
--
-- 목적:
--   - 신규 사용자가 에잇티 승인 없이 자기 회사를 직접 개설
--   - 최초 개설자를 해당 회사 owner로 자동 등록
--   - 신규 회사는 기존 에잇티 데이터를 복사하지 않고 빈 상태로 시작
--   - 사업자번호 중복 등록 차단
--
-- 동작:
--   1) 이메일 확인이 완료된 로그인 사용자만 실행
--   2) 승인 대기 상태의 신규 프로필만 회사 개설 가능
--   3) 회사와 멤버십이 없는 사용자만 실행 가능
--   4) 회사 생성 → owner 멤버십 생성 → 프로필 활성화를 한 트랜잭션으로 처리
--
-- 안전:
--   - 기존 회사·회원·업무 데이터 변경 없음
--   - DROP TABLE / DELETE / TRUNCATE 없음
--   - 기존 에잇티 회사와 두 계정 변경 없음
--   - 기존 회사의 사업자번호로 새 회사 생성 불가
--   - 클라이언트가 profile role을 올릴 수 없음
--   - 새 회사 owner의 기존 profile.role은 staff로 유지
--   - 회사 권한은 company_memberships.role = owner로 관리
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 프로필 보안 트리거
--
-- 일반 사용자의 자기 role·승인 상태 변경은 계속 차단한다.
-- register_my_company() 내부에서만 신규 회사 owner의 최초 활성화를 허용한다.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_enforce_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 기존 승인된 전역 관리자 동작 유지
  if public.is_admin() then
    return new;
  end if;

  -- 셀프 회사 개설 함수 내부에서만 허용되는 좁은 예외
  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and current_setting(
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
       from public.company_memberships m
       join public.companies c
         on c.id = m.company_id
       where m.user_id = auth.uid()
         and m.company_id = new.active_company_id
         and m.role = 'owner'
         and m.status = 'active'
         and c.status = 'active'
         and c.created_by = auth.uid()
     )
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
      or new.is_approved is distinct from old.is_approved
      or new.is_active is distinct from old.is_active
      or new.employee_id is distinct from old.employee_id
      or new.permissions is distinct from old.permissions
      or new.approval_status is distinct from old.approval_status
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
    then
      raise exception '승인·역할 변경 권한이 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) 신규 사용자의 셀프 회사 개설
-- ---------------------------------------------------------------------------
create or replace function public.register_my_company(
  p_company_name text,
  p_business_number text,
  p_representative_name text
)
returns table (
  company_id uuid,
  company_name text,
  membership_role text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_profile public.profiles%rowtype;
  v_company_id uuid;
  v_company_name text;
  v_representative_name text;
  v_business_number text;
  v_business_number_display text;
  v_updated integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- 이메일 확인이 완료된 Auth 사용자만 회사 개설 가능
  if not exists (
    select 1
    from auth.users u
    where u.id = v_user_id
      and u.email_confirmed_at is not null
  ) then
    raise exception '이메일 확인 후 회사를 개설할 수 있습니다.';
  end if;

  -- 동일 사용자의 동시 요청 방지
  select p.*
  into v_profile
  from public.profiles p
  where p.id = v_user_id
  for update;

  if v_profile.id is null then
    raise exception '사용자 프로필을 찾을 수 없습니다.';
  end if;

  -- handle_new_user()가 만든 안전한 신규 가입 상태만 허용
  if v_profile.role <> 'staff'
     or v_profile.is_active <> false
     or v_profile.is_approved <> false
     or v_profile.approval_status <> 'pending'
  then
    raise exception
      '새 회사 개설은 승인 대기 상태의 신규 계정만 가능합니다.';
  end if;

  -- 이미 회사 신청 또는 멤버십이 있는 사용자는 중복 개설 불가
  if exists (
    select 1
    from public.company_memberships m
    where m.user_id = v_user_id
  ) then
    raise exception '이미 연결되거나 신청한 회사가 있습니다.';
  end if;

  v_company_name :=
    nullif(btrim(coalesce(p_company_name, '')), '');

  v_representative_name :=
    nullif(btrim(coalesce(p_representative_name, '')), '');

  v_business_number :=
    regexp_replace(
      coalesce(p_business_number, ''),
      '[^0-9]',
      '',
      'g'
    );

  if v_company_name is null
     or length(v_company_name) < 2
     or length(v_company_name) > 100
  then
    raise exception '회사명은 2자 이상 100자 이하로 입력해 주세요.';
  end if;

  if v_representative_name is null
     or length(v_representative_name) < 2
     or length(v_representative_name) > 50
  then
    raise exception '대표자명은 2자 이상 50자 이하로 입력해 주세요.';
  end if;

  if v_business_number !~ '^[0-9]{10}$' then
    raise exception '사업자번호 10자리를 정확히 입력해 주세요.';
  end if;

  v_business_number_display :=
    substring(v_business_number from 1 for 3)
    || '-'
    || substring(v_business_number from 4 for 2)
    || '-'
    || substring(v_business_number from 6 for 5);

  -- 사업자번호 UNIQUE 제약으로 동시 중복 등록까지 차단
  begin
    insert into public.companies (
      name,
      business_number_normalized,
      business_number_display,
      representative_name,
      status,
      created_by
    )
    values (
      v_company_name,
      v_business_number,
      v_business_number_display,
      v_representative_name,
      'active',
      v_user_id
    )
    returning id into v_company_id;
  exception
    when unique_violation then
      raise exception
        '이미 등록된 사업자번호입니다. 기존 회사의 초대 링크를 이용해 주세요.';
  end;

  -- 최초 개설자를 회사 owner로 즉시 활성화
  insert into public.company_memberships (
    company_id,
    user_id,
    employee_id,
    role,
    status,
    reviewed_by,
    reviewed_at
  )
  values (
    v_company_id,
    v_user_id,
    null,
    'owner',
    'active',
    v_user_id,
    now()
  );

  -- 프로필 보안 트리거가 이 함수 내부 활성화만 식별하도록 설정
  perform set_config(
    'app.self_service_company_registration_user',
    v_user_id::text,
    true
  );

  update public.profiles p
  set
    active_company_id = v_company_id,
    is_active = true,
    is_approved = true,
    approval_status = 'approved',
    approved_at = now(),
    approved_by = v_user_id,
    rejected_at = null,
    rejection_reason = null,
    updated_at = now()
  where p.id = v_user_id
    and p.role = 'staff'
    and p.is_active = false
    and p.is_approved = false
    and p.approval_status = 'pending';

  get diagnostics v_updated = row_count;

  -- transaction-local 식별값 즉시 제거
  perform set_config(
    'app.self_service_company_registration_user',
    '',
    true
  );

  if v_updated <> 1 then
    raise exception '회사 개설 프로필 활성화에 실패했습니다.';
  end if;

  return query
  select
    v_company_id,
    v_company_name,
    'owner'::text;
end;
$$;

comment on function public.register_my_company(text, text, text) is
  '신규 가입자가 회사를 직접 개설하고 최초 owner로 활성화';

-- ---------------------------------------------------------------------------
-- 3) 실행 권한
-- ---------------------------------------------------------------------------
revoke all
on function public.register_my_company(text, text, text)
from public, anon, authenticated, service_role;

grant execute
on function public.register_my_company(text, text, text)
to authenticated;

notify pgrst, 'reload schema';

commit;