-- =============================================================================
-- Eighty ERP — 회사 기능 4D단계: 운영 이벤트 테이블 company_id
-- 파일: 20260803000013_operational_events_company_backfill.sql
--
-- 범위:
--   - public.quote_send_logs.company_id (nullable) 추가
--   - public.schedule_alert_events.company_id (nullable) 추가
--   - public.notification_events.company_id (nullable) 추가
--   - public.message_logs.company_id (nullable) 추가
--   - companies(id) FK
--   - company_id IS NULL 인 행만 부모 company_id 상속
--   - 검증 성공 후 company_id default = public.current_company_id()
--
-- 상속 규칙:
--   - quote_send_logs ← quotes.company_id
--   - schedule_alert_events ← customers → projects → employees (순차)
--   - notification_events ← customers → projects → project_materials (순차)
--   - message_logs ← notification_events.company_id
--
-- 속도 최적화:
--   - 단일 company_id 인덱스 미생성
--   - company_id가 선두인 복합 인덱스만 추가
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 RLS 정책 변경 없음
--   - 기존 인덱스 삭제·변경 없음
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
alter table public.quote_send_logs
  add column if not exists company_id uuid;

alter table public.schedule_alert_events
  add column if not exists company_id uuid;

alter table public.notification_events
  add column if not exists company_id uuid;

alter table public.message_logs
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
      and t.relname = 'quote_send_logs'
      and c.conname = 'quote_send_logs_company_id_fkey'
  ) then
    alter table public.quote_send_logs
      add constraint quote_send_logs_company_id_fkey
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
      and t.relname = 'schedule_alert_events'
      and c.conname = 'schedule_alert_events_company_id_fkey'
  ) then
    alter table public.schedule_alert_events
      add constraint schedule_alert_events_company_id_fkey
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
      and t.relname = 'notification_events'
      and c.conname = 'notification_events_company_id_fkey'
  ) then
    alter table public.notification_events
      add constraint notification_events_company_id_fkey
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
      and t.relname = 'message_logs'
      and c.conname = 'message_logs_company_id_fkey'
  ) then
    alter table public.message_logs
      add constraint message_logs_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 복합 인덱스 (company_id 선두, 단일 company_id 인덱스 없음)
-- ---------------------------------------------------------------------------
create index if not exists quote_send_logs_company_quote_created_idx
  on public.quote_send_logs (company_id, quote_id, created_at desc);

create index if not exists schedule_alert_events_company_status_created_idx
  on public.schedule_alert_events (company_id, status, created_at desc);

create index if not exists notification_events_company_status_created_idx
  on public.notification_events (company_id, status, created_at desc);

create index if not exists message_logs_company_event_created_idx
  on public.message_logs (company_id, notification_event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4~5) 부모 company_id 상속 backfill + 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_null_quote_send_logs integer;
  v_null_schedule_alerts integer;
  v_null_notification_events integer;
  v_null_message_logs integer;
  v_send_quote_mismatch integer;
  v_send_customer_mismatch integer;
  v_alert_customer_mismatch integer;
  v_alert_project_mismatch integer;
  v_alert_employee_mismatch integer;
  v_notif_customer_mismatch integer;
  v_notif_project_mismatch integer;
  v_notif_material_mismatch integer;
  v_message_event_mismatch integer;
begin
  -- quote_send_logs ← quotes
  update public.quote_send_logs s
  set company_id = q.company_id
  from public.quotes q
  where s.quote_id = q.id
    and s.company_id is null
    and q.company_id is not null;

  -- schedule_alert_events: customers → projects → employees
  update public.schedule_alert_events e
  set company_id = c.company_id
  from public.customers c
  where e.customer_id = c.id
    and e.company_id is null
    and c.company_id is not null;

  update public.schedule_alert_events e
  set company_id = p.company_id
  from public.projects p
  where e.project_id = p.id
    and e.company_id is null
    and p.company_id is not null;

  update public.schedule_alert_events e
  set company_id = emp.company_id
  from public.employees emp
  where e.assigned_employee_id = emp.id
    and e.company_id is null
    and emp.company_id is not null;

  -- notification_events: customers → projects → project_materials
  update public.notification_events n
  set company_id = c.company_id
  from public.customers c
  where n.customer_id = c.id
    and n.company_id is null
    and c.company_id is not null;

  update public.notification_events n
  set company_id = p.company_id
  from public.projects p
  where n.project_id = p.id
    and n.company_id is null
    and p.company_id is not null;

  update public.notification_events n
  set company_id = m.company_id
  from public.project_materials m
  where n.material_id = m.id
    and n.company_id is null
    and m.company_id is not null;

  -- message_logs ← notification_events (부모 backfill 이후)
  update public.message_logs l
  set company_id = n.company_id
  from public.notification_events n
  where l.notification_event_id = n.id
    and l.company_id is null
    and n.company_id is not null;

  select count(*)::integer
  into v_null_quote_send_logs
  from public.quote_send_logs s
  where s.company_id is null;

  select count(*)::integer
  into v_null_schedule_alerts
  from public.schedule_alert_events e
  where e.company_id is null;

  select count(*)::integer
  into v_null_notification_events
  from public.notification_events n
  where n.company_id is null;

  select count(*)::integer
  into v_null_message_logs
  from public.message_logs l
  where l.company_id is null;

  if v_null_quote_send_logs <> 0
     or v_null_schedule_alerts <> 0
     or v_null_notification_events <> 0
     or v_null_message_logs <> 0 then
    raise exception
      'company_id backfill 실패: quote_send_logs null=%, schedule_alert_events null=%, notification_events null=%, message_logs null=%',
      v_null_quote_send_logs,
      v_null_schedule_alerts,
      v_null_notification_events,
      v_null_message_logs;
  end if;

  select count(*)::integer
  into v_send_quote_mismatch
  from public.quote_send_logs s
  join public.quotes q on q.id = s.quote_id
  where s.company_id is distinct from q.company_id;

  select count(*)::integer
  into v_send_customer_mismatch
  from public.quote_send_logs s
  join public.customers c on c.id = s.customer_id
  where s.company_id is distinct from c.company_id;

  if v_send_quote_mismatch <> 0
     or v_send_customer_mismatch <> 0 then
    raise exception
      'quote_send_logs company_id 불일치: quotes=%, customers=%',
      v_send_quote_mismatch,
      v_send_customer_mismatch;
  end if;

  select count(*)::integer
  into v_alert_customer_mismatch
  from public.schedule_alert_events e
  join public.customers c on c.id = e.customer_id
  where e.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_alert_project_mismatch
  from public.schedule_alert_events e
  join public.projects p on p.id = e.project_id
  where e.company_id is distinct from p.company_id;

  select count(*)::integer
  into v_alert_employee_mismatch
  from public.schedule_alert_events e
  join public.employees emp on emp.id = e.assigned_employee_id
  where e.company_id is distinct from emp.company_id;

  if v_alert_customer_mismatch <> 0
     or v_alert_project_mismatch <> 0
     or v_alert_employee_mismatch <> 0 then
    raise exception
      'schedule_alert_events company_id 불일치: customers=%, projects=%, employees=%',
      v_alert_customer_mismatch,
      v_alert_project_mismatch,
      v_alert_employee_mismatch;
  end if;

  select count(*)::integer
  into v_notif_customer_mismatch
  from public.notification_events n
  join public.customers c on c.id = n.customer_id
  where n.company_id is distinct from c.company_id;

  select count(*)::integer
  into v_notif_project_mismatch
  from public.notification_events n
  join public.projects p on p.id = n.project_id
  where n.company_id is distinct from p.company_id;

  select count(*)::integer
  into v_notif_material_mismatch
  from public.notification_events n
  join public.project_materials m on m.id = n.material_id
  where n.company_id is distinct from m.company_id;

  if v_notif_customer_mismatch <> 0
     or v_notif_project_mismatch <> 0
     or v_notif_material_mismatch <> 0 then
    raise exception
      'notification_events company_id 불일치: customers=%, projects=%, project_materials=%',
      v_notif_customer_mismatch,
      v_notif_project_mismatch,
      v_notif_material_mismatch;
  end if;

  select count(*)::integer
  into v_message_event_mismatch
  from public.message_logs l
  join public.notification_events n on n.id = l.notification_event_id
  where l.company_id is distinct from n.company_id;

  if v_message_event_mismatch <> 0 then
    raise exception
      'message_logs/notification_events company_id 불일치: %',
      v_message_event_mismatch;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) 신규 행 기본값: current_company_id() (nullable 유지)
-- ---------------------------------------------------------------------------
alter table public.quote_send_logs
  alter column company_id
  set default public.current_company_id();

alter table public.schedule_alert_events
  alter column company_id
  set default public.current_company_id();

alter table public.notification_events
  alter column company_id
  set default public.current_company_id();

alter table public.message_logs
  alter column company_id
  set default public.current_company_id();

notify pgrst, 'reload schema';

commit;
