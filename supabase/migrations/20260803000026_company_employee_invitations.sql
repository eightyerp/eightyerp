-- =============================================================================
-- Eighty ERP — 회사별 직원 초대 기반
-- 파일: 20260803000026_company_employee_invitations.sql
--
-- 기능:
--   - 회사 관리자용 1회용 직원 초대 링크 생성
--   - 초대 토큰 원문 미저장(SHA-256 해시만 저장)
--   - 기본 유효기간 7일
--   - 초대 링크 검증 시 최소 회사정보만 공개
--   - 유효한 초대로 가입한 직원은 자동 활성화
--   - employees / profiles / company_memberships를 동일 트랜잭션에서 연결
--
-- 권한:
--   - owner / director / admin만 초대 생성·조회·취소
--   - 초대 가입자는 company_memberships.role = employee
--   - 전역 profiles.role은 staff 유지
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음
--   - 기존 회사·회원·직원 변경 없음
--   - 유효하지 않거나 만료·사용·취소된 초대는 가입 차단
--   - 직원 초대로 관리자 권한 부여 불가
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 회사별 직원 초대 테이블
-- ---------------------------------------------------------------------------
create table if not exists public.company_employee_invitations (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies (id)
    on delete restrict,

  -- 원문 토큰은 반환 후 저장하지 않고 SHA-256 해시만 저장
  token_hash bytea not null,

  -- 초대 생성자가 지정하는 기본 직원 정보
  default_title text not null default '직원',

  team_id uuid
    references public.teams (id)
    on delete set null,

  -- 현재 기본은 1회용이며 향후 정책 확장이 가능하도록 횟수 컬럼 유지
  max_uses integer not null default 1,
  use_count integer not null default 0,

  expires_at timestamptz not null default (now() + interval '7 days'),

  is_active boolean not null default true,

  created_by uuid
    references auth.users (id)
    on delete set null,

  revoked_by uuid
    references auth.users (id)
    on delete set null,

  revoked_at timestamptz,
  last_used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_employee_invitations_token_hash_key
    unique (token_hash),

  constraint company_employee_invitations_token_hash_length_check
    check (octet_length(token_hash) = 32),

  constraint company_employee_invitations_default_title_check
    check (
      char_length(trim(default_title)) between 1 and 100
    ),

  constraint company_employee_invitations_max_uses_check
    check (max_uses between 1 and 100),

  constraint company_employee_invitations_use_count_check
    check (
      use_count >= 0
      and use_count <= max_uses
    ),

  constraint company_employee_invitations_expiry_check
    check (expires_at > created_at)
);

comment on table public.company_employee_invitations is
  '회사별 직원 가입 초대. 원문 토큰은 저장하지 않고 SHA-256 해시만 저장한다.';

comment on column public.company_employee_invitations.token_hash is
  '초대 링크 원문 토큰의 SHA-256 해시(bytea 32바이트)';

-- 회사별 초대 목록 조회
create index if not exists
  company_employee_invitations_company_created_idx
on public.company_employee_invitations (
  company_id,
  created_at desc
);

-- 회사별 현재 사용 가능한 초대 조회
create index if not exists
  company_employee_invitations_company_expiry_active_idx
on public.company_employee_invitations (
  company_id,
  expires_at
)
where is_active = true
  and revoked_at is null;

-- 직접 테이블 접근은 차단하고 SECURITY DEFINER RPC만 사용
alter table public.company_employee_invitations
  enable row level security;

revoke all
on table public.company_employee_invitations
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) 회사 관리자용 초대 생성 RPC
--    - owner / director / admin만 가능
--    - 기본 1회용, 7일 유효
-- ---------------------------------------------------------------------------
create or replace function public.create_company_employee_invitation(
  p_default_title text default '직원',
  p_team_id uuid default null,
  p_expires_in_days integer default 7
)
returns table (
  invitation_id uuid,
  invite_token text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_title text;
  v_days integer;
  v_token text;
  v_token_hash bytea;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception '현재 회사가 설정되지 않았습니다.';
  end if;

  if not exists (
    select 1
    from public.company_memberships m
    join public.companies c
      on c.id = m.company_id
    where m.user_id = v_user_id
      and m.company_id = v_company_id
      and m.status = 'active'
      and m.role in ('owner', 'director', 'admin')
      and c.status = 'active'
  ) then
    raise exception '직원 초대를 만들 권한이 없습니다.';
  end if;

  v_title := trim(coalesce(p_default_title, '직원'));

  if char_length(v_title) not between 1 and 100 then
    raise exception '직급은 1자 이상 100자 이하로 입력해 주세요.';
  end if;

  v_days := coalesce(p_expires_in_days, 7);

  if v_days not between 1 and 30 then
    raise exception '초대 유효기간은 1일 이상 30일 이하만 가능합니다.';
  end if;

  if p_team_id is not null
     and not exists (
       select 1
       from public.teams t
       where t.id = p_team_id
         and t.company_id = v_company_id
     ) then
    raise exception '현재 회사에 속하지 않은 팀입니다.';
  end if;

  -- 256비트 난수 원문은 호출자에게 한 번만 반환
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := extensions.digest(v_token, 'sha256');
  v_expires_at := now() + make_interval(days => v_days);

  insert into public.company_employee_invitations (
    company_id,
    token_hash,
    default_title,
    team_id,
    max_uses,
    use_count,
    expires_at,
    is_active,
    created_by
  )
  values (
    v_company_id,
    v_token_hash,
    v_title,
    p_team_id,
    1,
    0,
    v_expires_at,
    true,
    v_user_id
  )
  returning id
  into v_invitation_id;

  return query
  select
    v_invitation_id,
    v_token,
    v_expires_at;
end;
$$;

comment on function public.create_company_employee_invitation(
  text,
  uuid,
  integer
) is
  '현재 회사의 owner/director/admin이 1회용 직원 초대 토큰을 생성한다.';

-- ---------------------------------------------------------------------------
-- 3) 회사 관리자용 초대 목록 RPC
-- ---------------------------------------------------------------------------
create or replace function public.list_company_employee_invitations()
returns table (
  invitation_id uuid,
  company_id uuid,
  default_title text,
  team_id uuid,
  team_name text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  is_active boolean,
  is_available boolean,
  created_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception '현재 회사가 설정되지 않았습니다.';
  end if;

  if not exists (
    select 1
    from public.company_memberships m
    join public.companies c
      on c.id = m.company_id
    where m.user_id = v_user_id
      and m.company_id = v_company_id
      and m.status = 'active'
      and m.role in ('owner', 'director', 'admin')
      and c.status = 'active'
  ) then
    raise exception '직원 초대를 조회할 권한이 없습니다.';
  end if;

  return query
  select
    i.id,
    i.company_id,
    i.default_title,
    i.team_id,
    t.name,
    i.expires_at,
    i.max_uses,
    i.use_count,
    i.is_active,
    (
      i.is_active = true
      and i.revoked_at is null
      and i.expires_at > now()
      and i.use_count < i.max_uses
    ) as is_available,
    i.created_at,
    i.last_used_at,
    i.revoked_at
  from public.company_employee_invitations i
  left join public.teams t
    on t.id = i.team_id
   and t.company_id = i.company_id
  where i.company_id = v_company_id
  order by i.created_at desc
  limit 100;
end;
$$;

comment on function public.list_company_employee_invitations() is
  '현재 회사의 owner/director/admin에게 최근 직원 초대 목록을 반환한다.';

-- ---------------------------------------------------------------------------
-- 4) 회사 관리자용 초대 취소 RPC
--    - 행 삭제 없이 비활성화
-- ---------------------------------------------------------------------------
create or replace function public.revoke_company_employee_invitation(
  p_invitation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_updated integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select i.company_id
  into v_company_id
  from public.company_employee_invitations i
  where i.id = p_invitation_id;

  if not found then
    return false;
  end if;

  if not exists (
    select 1
    from public.company_memberships m
    join public.companies c
      on c.id = m.company_id
    where m.user_id = v_user_id
      and m.company_id = v_company_id
      and m.status = 'active'
      and m.role in ('owner', 'director', 'admin')
      and c.status = 'active'
  ) then
    raise exception '직원 초대를 취소할 권한이 없습니다.';
  end if;

  update public.company_employee_invitations i
  set
    is_active = false,
    revoked_by = v_user_id,
    revoked_at = coalesce(i.revoked_at, now()),
    updated_at = now()
  where i.id = p_invitation_id
    and i.company_id = v_company_id
    and i.is_active = true
    and i.use_count < i.max_uses;

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

comment on function public.revoke_company_employee_invitation(uuid) is
  '현재 회사 관리자가 미사용 직원 초대를 삭제하지 않고 취소한다.';

-- ---------------------------------------------------------------------------
-- 5) 가입 화면용 공개 초대 검증 RPC
--    - 원문 토큰이 유효할 때만 최소 정보 반환
--    - 회사 UUID, 생성자, 사용 횟수 등 내부정보 비공개
-- ---------------------------------------------------------------------------
create or replace function public.get_company_employee_invitation(
  p_invite_token text
)
returns table (
  company_name text,
  default_title text,
  team_name text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  v_token := lower(trim(coalesce(p_invite_token, '')));

  if v_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
  select
    c.name,
    i.default_title,
    t.name,
    i.expires_at
  from public.company_employee_invitations i
  join public.companies c
    on c.id = i.company_id
   and c.status = 'active'
  left join public.teams t
    on t.id = i.team_id
   and t.company_id = i.company_id
  where i.token_hash = extensions.digest(v_token, 'sha256')
    and i.is_active = true
    and i.revoked_at is null
    and i.expires_at > now()
    and i.use_count < i.max_uses
  limit 1;
end;
$$;

comment on function public.get_company_employee_invitation(text) is
  '유효한 직원 초대 토큰에 대해 가입 화면 표시용 최소 정보만 반환한다.';

-- ---------------------------------------------------------------------------
-- 6) Auth 신규 가입 처리
--
-- 일반 가입:
--   - 기존과 동일하게 승인 대기 프로필 생성
--
-- 회사 대표 가입:
--   - 기존과 동일하게 승인 대기 프로필 생성 후
--     register_my_company()에서 회사 owner로 전환
--
-- 직원 초대 가입:
--   - signup_type = company_invite
--   - invite_token 검증 및 행 잠금
--   - 직원·회사 멤버십·활성 프로필을 한 트랜잭션에서 생성
--   - 사용 후 초대 자동 비활성화
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_team text;
  v_title text;
  v_signup_type text;
  v_invite_token text;

  v_invitation public.company_employee_invitations%rowtype;
  v_employee_id uuid;
begin
  v_name := nullif(
    trim(coalesce(new.raw_user_meta_data->>'full_name', '')),
    ''
  );

  v_phone := nullif(
    trim(coalesce(new.raw_user_meta_data->>'phone', '')),
    ''
  );

  v_team := nullif(
    trim(coalesce(new.raw_user_meta_data->>'requested_team', '')),
    ''
  );

  v_title := nullif(
    trim(coalesce(new.raw_user_meta_data->>'requested_title', '')),
    ''
  );

  v_signup_type := nullif(
    trim(coalesce(new.raw_user_meta_data->>'signup_type', '')),
    ''
  );

  v_invite_token := lower(
    trim(coalesce(new.raw_user_meta_data->>'invite_token', ''))
  );

  -- -------------------------------------------------------------------------
  -- 유효한 회사 직원 초대 가입
  -- -------------------------------------------------------------------------
  if v_signup_type = 'company_invite' then
    if new.email is null or trim(new.email) = '' then
      raise exception '직원 초대 가입에는 이메일이 필요합니다.';
    end if;

    if v_name is null then
      raise exception '직원 이름을 입력해 주세요.';
    end if;

    if char_length(v_name) > 100 then
      raise exception '직원 이름은 100자 이하로 입력해 주세요.';
    end if;

    if v_phone is not null and char_length(v_phone) > 50 then
      raise exception '연락처는 50자 이하로 입력해 주세요.';
    end if;

    if v_invite_token !~ '^[0-9a-f]{64}$' then
      raise exception '유효하지 않은 직원 초대 링크입니다.';
    end if;

    -- 동시 가입을 막기 위해 초대 행을 잠근 상태로 검증
    select i.*
    into v_invitation
    from public.company_employee_invitations i
    join public.companies c
      on c.id = i.company_id
     and c.status = 'active'
    where i.token_hash =
          extensions.digest(v_invite_token, 'sha256')
      and i.is_active = true
      and i.revoked_at is null
      and i.expires_at > now()
      and i.use_count < i.max_uses
    for update of i;

    if not found then
      raise exception '만료되었거나 이미 사용된 직원 초대 링크입니다.';
    end if;

    v_title := trim(v_invitation.default_title);

    if v_invitation.team_id is not null then
      select t.name
      into v_team
      from public.teams t
      where t.id = v_invitation.team_id
        and t.company_id = v_invitation.company_id;

      if not found then
        raise exception '초대에 지정된 팀 정보를 확인할 수 없습니다.';
      end if;
    else
      v_team := null;
    end if;

    -- 회사에 소속된 실제 직원 행 생성
    insert into public.employees (
      company_id,
      team_id,
      name,
      title,
      is_active
    )
    values (
      v_invitation.company_id,
      v_invitation.team_id,
      v_name,
      v_title,
      true
    )
    returning id
    into v_employee_id;

    -- 회사 권한은 항상 기본 employee로만 부여
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
      v_invitation.company_id,
      new.id,
      v_employee_id,
      'employee',
      'active',
      v_invitation.created_by,
      now()
    );

    -- 전역 역할은 staff를 유지하고 ERP 사용 상태만 활성화
    insert into public.profiles (
      id,
      email,
      full_name,
      phone,
      requested_team,
      requested_title,
      employee_id,
      role,
      permissions,
      is_active,
      is_approved,
      approval_status,
      approved_at,
      approved_by,
      active_company_id
    )
    values (
      new.id,
      new.email,
      v_name,
      v_phone,
      v_team,
      v_title,
      v_employee_id,
      'staff',
      '{}'::jsonb,
      true,
      true,
      'approved',
      now(),
      v_invitation.created_by,
      v_invitation.company_id
    );

    -- 1회용 초대 사용 처리
    update public.company_employee_invitations i
    set
      use_count = i.use_count + 1,
      is_active = (
        i.use_count + 1 < i.max_uses
      ),
      last_used_at = now(),
      updated_at = now()
    where i.id = v_invitation.id;

    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- 일반 가입 및 회사 대표 가입: 기존 승인 대기 흐름 유지
  -- -------------------------------------------------------------------------
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    requested_team,
    requested_title,
    role,
    permissions,
    is_active,
    is_approved,
    approval_status
  )
  values (
    new.id,
    new.email,
    v_name,
    v_phone,
    v_team,
    v_title,
    'staff',
    '{}'::jsonb,
    false,
    false,
    'pending'
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(
      excluded.full_name,
      public.profiles.full_name
    ),
    phone = coalesce(
      excluded.phone,
      public.profiles.phone
    ),
    requested_team = coalesce(
      excluded.requested_team,
      public.profiles.requested_team
    ),
    requested_title = coalesce(
      excluded.requested_title,
      public.profiles.requested_title
    ),
    -- 충돌 시에도 역할·승인 필드는 기존값 유지
    updated_at = now();

  return new;
end;
$$;

-- 트리거가 없거나 다른 함수를 가리키는 상황을 방지
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 7) 함수 실행 권한
-- ---------------------------------------------------------------------------
revoke all
on function public.create_company_employee_invitation(
  text,
  uuid,
  integer
)
from public, anon, authenticated, service_role;

revoke all
on function public.list_company_employee_invitations()
from public, anon, authenticated, service_role;

revoke all
on function public.revoke_company_employee_invitation(uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.get_company_employee_invitation(text)
from public, anon, authenticated, service_role;

grant execute
on function public.create_company_employee_invitation(
  text,
  uuid,
  integer
)
to authenticated, service_role;

grant execute
on function public.list_company_employee_invitations()
to authenticated, service_role;

grant execute
on function public.revoke_company_employee_invitation(uuid)
to authenticated, service_role;

grant execute
on function public.get_company_employee_invitation(text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;