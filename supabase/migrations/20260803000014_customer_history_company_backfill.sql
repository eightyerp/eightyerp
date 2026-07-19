-- =============================================================================
-- Eighty ERP — 회사 기능 4E단계: 고객 이력 테이블 company_id
-- 파일: 20260803000014_customer_history_company_backfill.sql
--
-- 범위:
--   - public.customer_checklists.company_id (nullable) 추가
--   - public.customer_activities.company_id (nullable) 추가
--   - public.inquiry_messages.company_id (nullable) 추가
--   - companies(id) FK
--   - company_id IS NULL 인 행만 부모 customers.company_id 상속
--   - 검증 성공 후 company_id default = public.current_company_id()
--
-- 상속 규칙:
--   - customer_checklists ← customers.company_id
--   - customer_activities ← customers.company_id
--   - inquiry_messages ← customers.company_id
--
-- 속도 최적화:
--   - 기존 인덱스 삭제·변경 없음
--   - 단일 company_id 인덱스 미생성
--   - company_id가 선두인 복합 인덱스만 추가
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
alter table public.customer_checklists
  add column if not exists company_id uuid;

alter table public.customer_activities
  add column if not exists company_id uuid;

alter table public.inquiry_messages
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
      and t.relname = 'customer_checklists'
      and c.conname = 'customer_checklists_company_id_fkey'
  ) then
    alter table public.customer_checklists
      add constraint customer_checklists_company_id_fkey
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
      and t.relname = 'customer_activities'
      and c.conname = 'customer_activities_company_id_fkey'
  ) then
    alter table public.customer_activities
      add constraint customer_activities_company_id_fkey
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
      and t.relname = 'inquiry_messages'
      and c.conname = 'inquiry_messages_company_id_fkey'
  ) then
    alter table public.inquiry_messages
      add constraint inquiry_messages_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 복합 인덱스 (company_id 선두, 단일 company_id 인덱스 없음)
-- ---------------------------------------------------------------------------
create index if not exists customer_checklists_company_customer_sort_idx
  on public.customer_checklists (company_id, customer_id, sort_order);

create index if not exists customer_activities_company_customer_created_idx
  on public.customer_activities (company_id, customer_id, created_at desc);

create index if not exists inquiry_messages_company_status_received_idx
  on public.inquiry_messages (company_id, status, received_at desc);

-- ---------------------------------------------------------------------------
-- 4~5) 부모 customers.company_id 상속 backfill + 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_null_checklists integer;
  v_null_activities integer;
  v_null_inquiry_messages integer;
  v_checklist_customer_mismatch integer;
  v_activity_customer_mismatch integer;
  v_inquiry_customer_mismatch integer;
  v_activity_employee_mismatch integer;
  v_activity_prev_assignee_mismatch integer := 0;
  v_activity_new_assignee_mismatch integer := 0;
begin
  update public.customer_checklists cl
  set company_id = c.company_id
  from public.customers c
  where cl.customer_id = c.id
    and cl.company_id is null
    and c.company_id is not null;

  update public.customer_activities a
  set company_id = c.company_id
  from public.customers c
  where a.customer_id = c.id
    and a.company_id is null
    and c.company_id is not null;

  update public.inquiry_messages im
  set company_id = c.company_id
  from public.customers c
  where im.customer_id = c.id
    and im.company_id is null
    and c.company_id is not null;

  select count(*)::integer
  into v_null_checklists
  from public.customer_checklists cl
  where cl.company_id is null;

  select count(*)::integer
  into v_null_activities
  from public.customer_activities a
  where a.company_id is null;

  select count(*)::integer
  into v_null_inquiry_messages
  from public.inquiry_messages im
  where im.company_id is null;

  if v_null_checklists <> 0
     or v_null_activities <> 0
     or v_null_inquiry_messages <> 0 then
    raise exception
      'company_id backfill 실패: customer_checklists null=%, customer_activities null=%, inquiry_messages null=%',
      v_null_checklists,
      v_null_activities,
      v_null_inquiry_messages;
  end if;

  select count(*)::integer
  into v_checklist_customer_mismatch
  from public.customer_checklists cl
  join public.customers c on c.id = cl.customer_id
  where cl.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_activity_customer_mismatch
  from public.customer_activities a
  join public.customers c on c.id = a.customer_id
  where a.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_inquiry_customer_mismatch
  from public.inquiry_messages im
  join public.customers c on c.id = im.customer_id
  where im.company_id is distinct from c.company_id;

  if v_checklist_customer_mismatch <> 0
     or v_activity_customer_mismatch <> 0
     or v_inquiry_customer_mismatch <> 0 then
    raise exception
      '부모 고객 company_id 불일치: customer_checklists=%, customer_activities=%, inquiry_messages=%',
      v_checklist_customer_mismatch,
      v_activity_customer_mismatch,
      v_inquiry_customer_mismatch;
  end if;

  select count(*)::integer
  into v_activity_employee_mismatch
  from public.customer_activities a
  join public.employees e on e.id = a.employee_id
  where a.company_id is distinct from e.company_id;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_activities'
      and column_name = 'previous_assignee_id'
  ) then
    execute $q$
      select count(*)::integer
      from public.customer_activities a
      join public.employees e on e.id = a.previous_assignee_id
      where a.company_id is distinct from e.company_id
    $q$
    into v_activity_prev_assignee_mismatch;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_activities'
      and column_name = 'new_assignee_id'
  ) then
    execute $q$
      select count(*)::integer
      from public.customer_activities a
      join public.employees e on e.id = a.new_assignee_id
      where a.company_id is distinct from e.company_id
    $q$
    into v_activity_new_assignee_mismatch;
  end if;

  if v_activity_employee_mismatch <> 0
     or v_activity_prev_assignee_mismatch <> 0
     or v_activity_new_assignee_mismatch <> 0 then
    raise exception
      'customer_activities 담당자 company_id 불일치: employee_id=%, previous_assignee_id=%, new_assignee_id=%',
      v_activity_employee_mismatch,
      v_activity_prev_assignee_mismatch,
      v_activity_new_assignee_mismatch;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) 신규 행 기본값: current_company_id() (nullable 유지)
-- ---------------------------------------------------------------------------
alter table public.customer_checklists
  alter column company_id
  set default public.current_company_id();

alter table public.customer_activities
  alter column company_id
  set default public.current_company_id();

alter table public.inquiry_messages
  alter column company_id
  set default public.current_company_id();

notify pgrst, 'reload schema';

commit;
