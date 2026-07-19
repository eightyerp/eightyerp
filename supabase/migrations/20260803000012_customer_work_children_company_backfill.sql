-- =============================================================================
-- Eighty ERP — 회사 기능 4C단계: 고객 업무 자식 테이블 company_id
-- 파일: 20260803000012_customer_work_children_company_backfill.sql
--
-- 범위:
--   - public.customer_consult_logs.company_id (nullable) 추가
--   - public.quote_files.company_id (nullable) 추가
--   - public.quote_items.company_id (nullable) 추가
--   - public.project_materials.company_id (nullable) 추가
--   - public.project_process_schedules.company_id (nullable) 추가
--   - companies(id) FK + 인덱스
--   - company_id IS NULL 인 행만 부모 company_id 상속
--   - 검증 성공 후 company_id default = public.current_company_id()
--
-- 상속 규칙:
--   - customer_consult_logs ← customers.company_id
--   - quote_files / quote_items ← quotes.company_id
--   - project_materials / project_process_schedules ← customers.company_id
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 RLS 정책 변경 없음
--   - NOT NULL 적용 없음
--   - company_id IS NULL 인 행만 UPDATE (기존 company_id 덮어쓰기 없음)
--   - 부모 company_id가 null이 아닌 경우만 상속
--   - 다른 컬럼 변경 없음
--   - 임의 회사 UUID 직접 주입 없음
--
-- 재실행: add column if not exists / FK·index 존재 확인 /
--         company_id IS NULL 일 때만 UPDATE / default 재설정
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) company_id 컬럼 추가 (default 없이, nullable)
-- ---------------------------------------------------------------------------
alter table public.customer_consult_logs
  add column if not exists company_id uuid;

alter table public.quote_files
  add column if not exists company_id uuid;

alter table public.quote_items
  add column if not exists company_id uuid;

alter table public.project_materials
  add column if not exists company_id uuid;

alter table public.project_process_schedules
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
      and t.relname = 'customer_consult_logs'
      and c.conname = 'customer_consult_logs_company_id_fkey'
  ) then
    alter table public.customer_consult_logs
      add constraint customer_consult_logs_company_id_fkey
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
      and t.relname = 'quote_files'
      and c.conname = 'quote_files_company_id_fkey'
  ) then
    alter table public.quote_files
      add constraint quote_files_company_id_fkey
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
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_company_id_fkey'
  ) then
    alter table public.quote_items
      add constraint quote_items_company_id_fkey
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
      and t.relname = 'project_materials'
      and c.conname = 'project_materials_company_id_fkey'
  ) then
    alter table public.project_materials
      add constraint project_materials_company_id_fkey
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
      and t.relname = 'project_process_schedules'
      and c.conname = 'project_process_schedules_company_id_fkey'
  ) then
    alter table public.project_process_schedules
      add constraint project_process_schedules_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 인덱스
-- ---------------------------------------------------------------------------
create index if not exists customer_consult_logs_company_id_idx
  on public.customer_consult_logs (company_id);

create index if not exists quote_files_company_id_idx
  on public.quote_files (company_id);

create index if not exists quote_items_company_id_idx
  on public.quote_items (company_id);

create index if not exists project_materials_company_id_idx
  on public.project_materials (company_id);

create index if not exists project_process_schedules_company_id_idx
  on public.project_process_schedules (company_id);

-- ---------------------------------------------------------------------------
-- 4~5) 부모 company_id 상속 backfill + 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_null_consult_logs integer;
  v_null_quote_files integer;
  v_null_quote_items integer;
  v_null_project_materials integer;
  v_null_process_schedules integer;
  v_consult_customer_mismatch integer;
  v_quote_files_mismatch integer;
  v_quote_items_mismatch integer;
  v_materials_customer_mismatch integer;
  v_process_customer_mismatch integer;
  v_materials_project_mismatch integer;
  v_process_project_mismatch integer;
  v_process_assignee_mismatch integer;
begin
  update public.customer_consult_logs l
  set company_id = c.company_id
  from public.customers c
  where l.customer_id = c.id
    and l.company_id is null
    and c.company_id is not null;

  update public.quote_files f
  set company_id = q.company_id
  from public.quotes q
  where f.quote_id = q.id
    and f.company_id is null
    and q.company_id is not null;

  update public.quote_items i
  set company_id = q.company_id
  from public.quotes q
  where i.quote_id = q.id
    and i.company_id is null
    and q.company_id is not null;

  update public.project_materials m
  set company_id = c.company_id
  from public.customers c
  where m.customer_id = c.id
    and m.company_id is null
    and c.company_id is not null;

  update public.project_process_schedules s
  set company_id = c.company_id
  from public.customers c
  where s.customer_id = c.id
    and s.company_id is null
    and c.company_id is not null;

  select count(*)::integer
  into v_null_consult_logs
  from public.customer_consult_logs l
  where l.company_id is null;

  select count(*)::integer
  into v_null_quote_files
  from public.quote_files f
  where f.company_id is null;

  select count(*)::integer
  into v_null_quote_items
  from public.quote_items i
  where i.company_id is null;

  select count(*)::integer
  into v_null_project_materials
  from public.project_materials m
  where m.company_id is null;

  select count(*)::integer
  into v_null_process_schedules
  from public.project_process_schedules s
  where s.company_id is null;

  if v_null_consult_logs <> 0
     or v_null_quote_files <> 0
     or v_null_quote_items <> 0
     or v_null_project_materials <> 0
     or v_null_process_schedules <> 0 then
    raise exception
      'company_id backfill 실패: consult_logs null=%, quote_files null=%, quote_items null=%, project_materials null=%, process_schedules null=%',
      v_null_consult_logs,
      v_null_quote_files,
      v_null_quote_items,
      v_null_project_materials,
      v_null_process_schedules;
  end if;

  select count(*)::integer
  into v_consult_customer_mismatch
  from public.customer_consult_logs l
  join public.customers c on c.id = l.customer_id
  where l.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_quote_files_mismatch
  from public.quote_files f
  join public.quotes q on q.id = f.quote_id
  where f.company_id is distinct from q.company_id;

  select count(*)::integer
  into v_quote_items_mismatch
  from public.quote_items i
  join public.quotes q on q.id = i.quote_id
  where i.company_id is distinct from q.company_id;

  select count(*)::integer
  into v_materials_customer_mismatch
  from public.project_materials m
  join public.customers c on c.id = m.customer_id
  where m.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_process_customer_mismatch
  from public.project_process_schedules s
  join public.customers c on c.id = s.customer_id
  where s.company_id is distinct from c.company_id;

  if v_consult_customer_mismatch <> 0
     or v_quote_files_mismatch <> 0
     or v_quote_items_mismatch <> 0
     or v_materials_customer_mismatch <> 0
     or v_process_customer_mismatch <> 0 then
    raise exception
      '부모 company_id 불일치: consult_logs/customers=%, quote_files/quotes=%, quote_items/quotes=%, materials/customers=%, process/customers=%',
      v_consult_customer_mismatch,
      v_quote_files_mismatch,
      v_quote_items_mismatch,
      v_materials_customer_mismatch,
      v_process_customer_mismatch;
  end if;

  select count(*)::integer
  into v_materials_project_mismatch
  from public.project_materials m
  join public.projects p on p.id = m.project_id
  where m.company_id is distinct from p.company_id;

  select count(*)::integer
  into v_process_project_mismatch
  from public.project_process_schedules s
  join public.projects p on p.id = s.project_id
  where s.company_id is distinct from p.company_id;

  if v_materials_project_mismatch <> 0
     or v_process_project_mismatch <> 0 then
    raise exception
      'project company_id 불일치: project_materials=%, project_process_schedules=%',
      v_materials_project_mismatch,
      v_process_project_mismatch;
  end if;

  select count(*)::integer
  into v_process_assignee_mismatch
  from public.project_process_schedules s
  join public.employees e on e.id = s.assigned_employee_id
  where s.company_id is distinct from e.company_id;

  if v_process_assignee_mismatch <> 0 then
    raise exception
      '담당자 company_id 불일치: project_process_schedules=%',
      v_process_assignee_mismatch;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) 신규 행 기본값: current_company_id() (nullable 유지)
-- ---------------------------------------------------------------------------
alter table public.customer_consult_logs
  alter column company_id
  set default public.current_company_id();

alter table public.quote_files
  alter column company_id
  set default public.current_company_id();

alter table public.quote_items
  alter column company_id
  set default public.current_company_id();

alter table public.project_materials
  alter column company_id
  set default public.current_company_id();

alter table public.project_process_schedules
  alter column company_id
  set default public.current_company_id();

notify pgrst, 'reload schema';

commit;
