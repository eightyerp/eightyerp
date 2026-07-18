-- =============================================================================
-- Eighty ERP — 회사 기능 4A단계: teams / employees / customers company_id
-- 파일: 20260803000010_core_company_backfill.sql
--
-- 범위:
--   - public.teams.company_id (nullable) 추가
--   - public.employees.company_id (nullable) 추가
--   - public.customers.company_id (nullable) 추가
--   - companies(id) FK + 인덱스
--   - 주식회사 에잇티(5328102974)로 null 행만 안전 backfill
--   - 검증 성공 후 company_id default = public.current_company_id()
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 RLS 정책 변경 없음
--   - profiles / company_memberships 변경 없음
--   - NOT NULL 적용 없음
--   - company_id IS NULL 인 행만 UPDATE (기존 company_id 덮어쓰기 없음)
--   - 팀·담당자·상태 등 다른 컬럼 변경 없음
--   - 담당자 미배정 고객(assigned_employee_id null) 유지
--   - projects / quotes / schedules / materials 변경 없음
--
-- 재실행: add column if not exists / FK·index 존재 확인 /
--         company_id IS NULL 일 때만 UPDATE / default 재설정
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) company_id 컬럼 추가 (default 없이, nullable)
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists company_id uuid;

alter table public.employees
  add column if not exists company_id uuid;

alter table public.customers
  add column if not exists company_id uuid;

-- ---------------------------------------------------------------------------
-- 2) FK 추가 (on delete restrict, 재실행 안전)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'teams'
      and c.conname = 'teams_company_id_fkey'
  ) then
    alter table public.teams
      add constraint teams_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'employees'
      and c.conname = 'employees_company_id_fkey'
  ) then
    alter table public.employees
      add constraint employees_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'customers'
      and c.conname = 'customers_company_id_fkey'
  ) then
    alter table public.customers
      add constraint customers_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 인덱스
-- ---------------------------------------------------------------------------
create index if not exists teams_company_id_idx
  on public.teams (company_id);

create index if not exists employees_company_id_idx
  on public.employees (company_id);

create index if not exists customers_company_id_idx
  on public.customers (company_id);

-- ---------------------------------------------------------------------------
-- 4~6) 기본 회사 확인 → null 행 backfill → 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_company_count integer;
  v_company_id uuid;
  v_null_teams integer;
  v_null_employees integer;
  v_null_customers integer;
  v_employee_team_mismatch integer;
  v_customer_employee_mismatch integer;
begin
  select count(*)::integer
  into v_company_count
  from public.companies c
  where c.business_number_normalized = '5328102974'
    and c.status = 'active';

  if v_company_count <> 1 then
    raise exception
      '주식회사 에잇티(5328102974, active) 회사 수가 %건입니다. 정확히 1건이어야 합니다.',
      v_company_count;
  end if;

  select c.id
  into v_company_id
  from public.companies c
  where c.business_number_normalized = '5328102974'
    and c.status = 'active';

  if v_company_id is null then
    raise exception
      '주식회사 에잇티(5328102974, active) company id를 확인할 수 없습니다.';
  end if;

  update public.teams t
  set company_id = v_company_id
  where t.company_id is null;

  update public.employees e
  set company_id = v_company_id
  where e.company_id is null;

  update public.customers c
  set company_id = v_company_id
  where c.company_id is null;

  select count(*)::integer
  into v_null_teams
  from public.teams t
  where t.company_id is null;

  select count(*)::integer
  into v_null_employees
  from public.employees e
  where e.company_id is null;

  select count(*)::integer
  into v_null_customers
  from public.customers c
  where c.company_id is null;

  if v_null_teams <> 0
     or v_null_employees <> 0
     or v_null_customers <> 0 then
    raise exception
      'company_id backfill 실패: teams null=%, employees null=%, customers null=%',
      v_null_teams,
      v_null_employees,
      v_null_customers;
  end if;

  select count(*)::integer
  into v_employee_team_mismatch
  from public.employees e
  join public.teams t on t.id = e.team_id
  where e.company_id is distinct from t.company_id;

  if v_employee_team_mismatch <> 0 then
    raise exception
      'employee/team company_id 불일치 %건',
      v_employee_team_mismatch;
  end if;

  select count(*)::integer
  into v_customer_employee_mismatch
  from public.customers c
  join public.employees e on e.id = c.assigned_employee_id
  where c.company_id is distinct from e.company_id;

  if v_customer_employee_mismatch <> 0 then
    raise exception
      'customer/assigned_employee company_id 불일치 %건',
      v_customer_employee_mismatch;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) 신규 행 기본값: current_company_id() (nullable 유지)
-- ---------------------------------------------------------------------------
alter table public.teams
  alter column company_id
  set default public.current_company_id();

alter table public.employees
  alter column company_id
  set default public.current_company_id();

alter table public.customers
  alter column company_id
  set default public.current_company_id();

notify pgrst, 'reload schema';

commit;
