-- =============================================================================
-- Eighty ERP — 회사 기능 4B단계: projects / quotes / customer_schedules company_id
-- 파일: 20260803000011_customer_work_company_backfill.sql
--
-- 범위:
--   - public.projects.company_id (nullable) 추가
--   - public.quotes.company_id (nullable) 추가
--   - public.customer_schedules.company_id (nullable) 추가
--   - companies(id) FK + 인덱스
--   - company_id IS NULL 인 행만 부모 customers.company_id 상속
--   - 검증 성공 후 company_id default = public.current_company_id()
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 RLS 정책 변경 없음
--   - NOT NULL 적용 없음
--   - company_id IS NULL 인 행만 UPDATE (기존 company_id 덮어쓰기 없음)
--   - customer_id / assigned_employee_id 등 다른 컬럼 변경 없음
--   - 임의 회사 UUID 직접 주입 없음 (부모 고객 상속만)
--   - quote_items / quote_files / project_materials /
--     project_process_schedules / can_access_* / 견적번호 트리거 변경 없음
--
-- 재실행: add column if not exists / FK·index 존재 확인 /
--         company_id IS NULL 일 때만 UPDATE / default 재설정
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) company_id 컬럼 추가 (default 없이, nullable)
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists company_id uuid;

alter table public.quotes
  add column if not exists company_id uuid;

alter table public.customer_schedules
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
      and t.relname = 'projects'
      and c.conname = 'projects_company_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_company_id_fkey
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
      and t.relname = 'quotes'
      and c.conname = 'quotes_company_id_fkey'
  ) then
    alter table public.quotes
      add constraint quotes_company_id_fkey
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
      and t.relname = 'customer_schedules'
      and c.conname = 'customer_schedules_company_id_fkey'
  ) then
    alter table public.customer_schedules
      add constraint customer_schedules_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 인덱스
-- ---------------------------------------------------------------------------
create index if not exists projects_company_id_idx
  on public.projects (company_id);

create index if not exists quotes_company_id_idx
  on public.quotes (company_id);

create index if not exists customer_schedules_company_id_idx
  on public.customer_schedules (company_id);

-- ---------------------------------------------------------------------------
-- 4~5) 부모 customers.company_id 상속 backfill + 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_null_projects integer;
  v_null_quotes integer;
  v_null_schedules integer;
  v_project_customer_mismatch integer;
  v_quote_customer_mismatch integer;
  v_schedule_customer_mismatch integer;
  v_project_assignee_mismatch integer;
  v_quote_assignee_mismatch integer;
  v_schedule_assignee_mismatch integer;
begin
  update public.projects p
  set company_id = c.company_id
  from public.customers c
  where p.customer_id = c.id
    and p.company_id is null
    and c.company_id is not null;

  update public.quotes q
  set company_id = c.company_id
  from public.customers c
  where q.customer_id = c.id
    and q.company_id is null
    and c.company_id is not null;

  update public.customer_schedules s
  set company_id = c.company_id
  from public.customers c
  where s.customer_id = c.id
    and s.company_id is null
    and c.company_id is not null;

  select count(*)::integer
  into v_null_projects
  from public.projects p
  where p.company_id is null;

  select count(*)::integer
  into v_null_quotes
  from public.quotes q
  where q.company_id is null;

  select count(*)::integer
  into v_null_schedules
  from public.customer_schedules s
  where s.company_id is null;

  if v_null_projects <> 0
     or v_null_quotes <> 0
     or v_null_schedules <> 0 then
    raise exception
      'company_id backfill 실패: projects null=%, quotes null=%, customer_schedules null=%',
      v_null_projects,
      v_null_quotes,
      v_null_schedules;
  end if;

  select count(*)::integer
  into v_project_customer_mismatch
  from public.projects p
  join public.customers c on c.id = p.customer_id
  where p.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_quote_customer_mismatch
  from public.quotes q
  join public.customers c on c.id = q.customer_id
  where q.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_schedule_customer_mismatch
  from public.customer_schedules s
  join public.customers c on c.id = s.customer_id
  where s.company_id is distinct from c.company_id;

  if v_project_customer_mismatch <> 0
     or v_quote_customer_mismatch <> 0
     or v_schedule_customer_mismatch <> 0 then
    raise exception
      '부모 고객 company_id 불일치: projects=%, quotes=%, customer_schedules=%',
      v_project_customer_mismatch,
      v_quote_customer_mismatch,
      v_schedule_customer_mismatch;
  end if;

  select count(*)::integer
  into v_project_assignee_mismatch
  from public.projects p
  join public.employees e on e.id = p.assigned_employee_id
  where p.company_id is distinct from e.company_id;

  select count(*)::integer
  into v_quote_assignee_mismatch
  from public.quotes q
  join public.employees e on e.id = q.assigned_employee_id
  where q.company_id is distinct from e.company_id;

  select count(*)::integer
  into v_schedule_assignee_mismatch
  from public.customer_schedules s
  join public.employees e on e.id = s.assigned_employee_id
  where s.company_id is distinct from e.company_id;

  if v_project_assignee_mismatch <> 0
     or v_quote_assignee_mismatch <> 0
     or v_schedule_assignee_mismatch <> 0 then
    raise exception
      '담당자 company_id 불일치: projects=%, quotes=%, customer_schedules=%',
      v_project_assignee_mismatch,
      v_quote_assignee_mismatch,
      v_schedule_assignee_mismatch;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) 신규 행 기본값: current_company_id() (nullable 유지)
-- ---------------------------------------------------------------------------
alter table public.projects
  alter column company_id
  set default public.current_company_id();

alter table public.quotes
  alter column company_id
  set default public.current_company_id();

alter table public.customer_schedules
  alter column company_id
  set default public.current_company_id();

notify pgrst, 'reload schema';

commit;
