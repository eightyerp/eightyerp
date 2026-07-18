-- =============================================================================
-- Eighty ERP — 회사 identity 기반 (1단계)
-- 파일: 20260803000007_company_identity_foundation.sql
--
-- 범위:
--   - public.companies / public.company_memberships 생성
--   - 주식회사 에잇티 시드 1건
--   - 대표자(이응세) owner membership 시드 (조건부)
--   - SELECT 전용 RLS (authenticated)
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 업무 테이블 변경 없음 (profiles / employees / company_id 추가 없음)
--   - 기존 RLS 정책 변경 없음
--   - 이번 migration은 회사 identity 기반만 생성
--
-- 재실행: create table if not exists / on conflict do nothing / drop policy if exists
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_number_normalized text not null,
  business_number_display text not null,
  representative_name text not null,
  status text not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_nonblank_check
    check (length(btrim(name)) > 0),
  constraint companies_business_number_normalized_format_check
    check (business_number_normalized ~ '^[0-9]{10}$'),
  constraint companies_business_number_normalized_key
    unique (business_number_normalized),
  constraint companies_status_check
    check (status in ('active', 'suspended', 'closed'))
);

-- ---------------------------------------------------------------------------
-- 2) company_memberships
--    pending = 회사 가입신청 (별도 join_requests 테이블 없음)
-- ---------------------------------------------------------------------------
create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  role text not null default 'employee',
  status text not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_memberships_company_user_key
    unique (company_id, user_id),
  constraint company_memberships_role_check
    check (role in ('owner', 'director', 'admin', 'employee')),
  constraint company_memberships_status_check
    check (status in ('pending', 'active', 'rejected', 'suspended'))
);

create index if not exists company_memberships_company_id_idx
  on public.company_memberships (company_id);

create index if not exists company_memberships_user_id_idx
  on public.company_memberships (user_id);

create index if not exists company_memberships_status_idx
  on public.company_memberships (status);

-- ---------------------------------------------------------------------------
-- 3) 기본 회사 시드 — 주식회사 에잇티
--    동일 사업자번호가 있으면 기존 행을 변경하지 않음
-- ---------------------------------------------------------------------------
insert into public.companies (
  name,
  business_number_normalized,
  business_number_display,
  representative_name,
  status,
  created_by
)
values (
  '주식회사 에잇티',
  '5328102974',
  '532-81-02974',
  '이응세',
  'active',
  '8ba27d37-f1d2-4a0d-b432-40edda0cce4d'::uuid
)
on conflict (business_number_normalized) do nothing;

-- ---------------------------------------------------------------------------
-- 4) 대표자 owner membership 시드 (조건부)
--    profiles / employees 조건이 모두 맞을 때만 생성
--    unique(company_id, user_id) 충돌 시 기존 행 변경 없음
-- ---------------------------------------------------------------------------
insert into public.company_memberships (
  company_id,
  user_id,
  employee_id,
  role,
  status,
  reviewed_by,
  reviewed_at
)
select
  c.id,
  '8ba27d37-f1d2-4a0d-b432-40edda0cce4d'::uuid,
  '1fe41c5b-da0b-47ec-9745-b3cc20da216c'::uuid,
  'owner',
  'active',
  '8ba27d37-f1d2-4a0d-b432-40edda0cce4d'::uuid,
  now()
from public.companies c
where c.business_number_normalized = '5328102974'
  and exists (
    select 1
    from public.profiles p
    where p.id = '8ba27d37-f1d2-4a0d-b432-40edda0cce4d'::uuid
      and p.employee_id = '1fe41c5b-da0b-47ec-9745-b3cc20da216c'::uuid
      and p.is_active = true
      and p.is_approved = true
      and p.approval_status = 'approved'
  )
  and exists (
    select 1
    from public.employees e
    where e.id = '1fe41c5b-da0b-47ec-9745-b3cc20da216c'::uuid
      and e.name = '이응세'
  )
on conflict (company_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5) RLS — SELECT only (authenticated)
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;

drop policy if exists "companies_select_own_membership" on public.companies;
create policy "companies_select_own_membership" on public.companies
  for select to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.company_memberships m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "company_memberships_select_own" on public.company_memberships;
create policy "company_memberships_select_own" on public.company_memberships
  for select to authenticated
  using (
    auth.uid() is not null
    and user_id = auth.uid()
  );

revoke all on table public.companies from public, anon, authenticated;
revoke all on table public.company_memberships from public, anon, authenticated;

grant select on table public.companies to authenticated;
grant select on table public.company_memberships to authenticated;

notify pgrst, 'reload schema';

commit;
