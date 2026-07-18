-- =============================================================================
-- Eighty ERP — 회사 기능 2단계: director 연결 + active_company_id
-- 파일: 20260803000008_company_member_backfill.sql
--
-- 범위:
--   - profiles.active_company_id (nullable) 추가
--   - 김설화 이사 → 주식회사 에잇티 director membership (조건부 1건)
--   - 이응세 owner / 김설화 director 의 active_company_id 안전 backfill
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 데이터 변경은 승인된 두 사용자(이응세·김설화)의
--     profiles.active_company_id NULL → 에잇티 설정뿐
--   - profiles.role / 승인 상태 / employee_id 변경 없음
--   - 고객·견적·일정·현장·자재 테이블 변경 없음
--   - 기존 RLS / company_memberships 정책 변경 없음
--
-- 재실행: add column if not exists / FK 존재 확인 / on conflict do nothing /
--         active_company_id IS NULL 일 때만 UPDATE
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) profiles.active_company_id
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists active_company_id uuid;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles 없음 — active_company_id FK 건너뜀';
    return;
  end if;

  if to_regclass('public.companies') is null then
    raise notice 'public.companies 없음 — active_company_id FK 건너뜀';
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_active_company_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_active_company_id_fkey
      foreign key (active_company_id)
      references public.companies (id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_active_company_id_idx
  on public.profiles (active_company_id);

-- ---------------------------------------------------------------------------
-- 2~3) 김설화 director 후보 검증 + membership 생성
--      후보가 정확히 1명이고 에잇티 owner(이응세) active membership이 있을 때만
-- ---------------------------------------------------------------------------
do $$
declare
  v_company_id uuid;
  v_candidate_count integer;
  v_director_user_id uuid;
  v_director_employee_id uuid;
  v_owner_user_id uuid := '8ba27d37-f1d2-4a0d-b432-40edda0cce4d'::uuid;
begin
  if to_regclass('public.companies') is null
     or to_regclass('public.company_memberships') is null then
    raise notice 'companies/company_memberships 없음 — director 시드 건너뜀';
    return;
  end if;

  select c.id
  into v_company_id
  from public.companies c
  where c.business_number_normalized = '5328102974';

  if v_company_id is null then
    raise notice '주식회사 에잇티(5328102974) 없음 — director 시드 건너뜀';
    return;
  end if;

  if not exists (
    select 1
    from public.company_memberships m
    where m.company_id = v_company_id
      and m.user_id = v_owner_user_id
      and m.role = 'owner'
      and m.status = 'active'
  ) then
    raise notice '이응세 owner/active membership 없음 — director 시드 건너뜀';
    return;
  end if;

  select count(*)::integer
  into v_candidate_count
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where e.name = '김설화'
    and e.title = '이사'
    and p.role = 'admin'
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved'
    and p.employee_id is not null;

  if v_candidate_count <> 1 then
    raise notice
      '김설화 director 후보 수=% — 0 또는 2명 이상이므로 membership 생성 안 함',
      v_candidate_count;
    return;
  end if;

  select p.id, p.employee_id
  into v_director_user_id, v_director_employee_id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where e.name = '김설화'
    and e.title = '이사'
    and p.role = 'admin'
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved'
    and p.employee_id is not null;

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
    v_director_user_id,
    v_director_employee_id,
    'director',
    'active',
    v_owner_user_id,
    now()
  )
  on conflict (company_id, user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 4) active_company_id backfill
--    이응세 owner / 김설화 director 의 active membership만,
--    active_company_id IS NULL 일 때만 에잇티로 설정
-- ---------------------------------------------------------------------------
update public.profiles p
set
  active_company_id = c.id,
  updated_at = now()
from public.companies c
join public.company_memberships m
  on m.company_id = c.id
where c.business_number_normalized = '5328102974'
  and m.status = 'active'
  and m.user_id = p.id
  and p.active_company_id is null
  and (
    (
      m.user_id = '8ba27d37-f1d2-4a0d-b432-40edda0cce4d'::uuid
      and m.role = 'owner'
    )
    or (
      m.role = 'director'
      and exists (
        select 1
        from public.employees e
        where e.id = p.employee_id
          and e.name = '김설화'
          and e.title = '이사'
      )
      and p.role = 'admin'
      and p.is_active = true
      and p.is_approved = true
      and p.approval_status = 'approved'
    )
  );

notify pgrst, 'reload schema';

commit;
