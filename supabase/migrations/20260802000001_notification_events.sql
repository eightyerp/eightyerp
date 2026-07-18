-- =============================================================================
-- Eighty ERP — notification_events / message_logs 생성 + event_type 확장
-- 파일: 20260802000001_notification_events.sql
--
-- 목적:
--   - 운영에 notification_events 테이블이 없을 때 안전하게 생성
--   - 자재 알림(material_*) + 외부문의/담당자 배정 타입 포함
--   - can_access_customer 미설치 환경에서도 단독 실행 가능
--
-- 안전:
--   - DROP TABLE / DELETE / TRUNCATE 없음
--   - 고객·일정·직원·profiles 데이터 변경·초기화 없음
--   - 재실행 가능 (IF NOT EXISTS / DROP POLICY IF EXISTS / 제약 교체)
--   - 중간 실패 후 재실행해도 테이블·정책·제약이 안전하게 정리됨
--
-- 전제(이미 운영 적용됨):
--   - 20260801000001_employee_signup_approval.sql
--     → is_admin() / is_erp_user() / current_employee_id() /
--       current_employee_team_id() 존재
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) can_access_customer 보장
--    원본 정의:
--      - 20260716000003_customer_detail_activities.sql
--      - 20260717000000_ensure_crm_access_helpers.sql
--    규칙(앱 CRM 헬퍼와 동일):
--      - admin/super_admin: 전체
--      - 본인 담당 고객
--      - 같은 팀 담당 고객 (manager 팀 범위)
--      - 담당자 미지정 고객
--    ※ 모든 authenticated 에게 전 고객 개방하지 않음
-- ---------------------------------------------------------------------------
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.customers c
      left join public.employees assignee on assignee.id = c.assigned_employee_id
      where c.id = p_customer_id
        and (
          c.assigned_employee_id = public.current_employee_id()
          or (
            public.current_employee_team_id() is not null
            and assignee.team_id = public.current_employee_team_id()
          )
          or c.assigned_employee_id is null
        )
    );
$$;

grant execute on function public.can_access_customer(uuid) to authenticated;
grant execute on function public.can_access_customer(uuid) to anon;

-- ---------------------------------------------------------------------------
-- 1) notification_events
-- ---------------------------------------------------------------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  customer_id uuid references public.customers (id) on delete set null,
  project_id uuid,
  material_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- 선택 FK (테이블이 있을 때만) — 자재/현장 미적용 환경에서도 생성 가능
do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'notification_events_project_id_fkey'
         and conrelid = 'public.notification_events'::regclass
     )
  then
    alter table public.notification_events
      add constraint notification_events_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;

  if to_regclass('public.project_materials') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'notification_events_material_id_fkey'
         and conrelid = 'public.notification_events'::regclass
     )
  then
    alter table public.notification_events
      add constraint notification_events_material_id_fkey
      foreign key (material_id) references public.project_materials (id) on delete set null;
  end if;
end $$;

-- event_type / status CHECK — 레거시·부분 생성 제약까지 제거 후 재생성
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'notification_events'
      and c.contype = 'c'
      and (
        c.conname in (
          'notification_events_event_type_check',
          'notification_events_status_check'
        )
        or pg_get_constraintdef(c.oid) ilike '%event_type%'
        or (
          pg_get_constraintdef(c.oid) ilike '%status%'
          and pg_get_constraintdef(c.oid) not ilike '%event_type%'
        )
      )
  loop
    execute format(
      'alter table public.notification_events drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.notification_events
  add constraint notification_events_event_type_check
  check (event_type in (
    'material_approval_request',
    'material_approved',
    'material_change_request',
    'material_reapproval_request',
    'material_all_approved',
    'external_inquiry_registered',
    'customer_assigned'
  ));

alter table public.notification_events
  add constraint notification_events_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

create index if not exists notification_events_status_idx
  on public.notification_events (status, created_at desc);

create index if not exists notification_events_customer_id_idx
  on public.notification_events (customer_id);

-- ---------------------------------------------------------------------------
-- 2) message_logs (카카오 연동 대기 로그)
-- ---------------------------------------------------------------------------
create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid references public.notification_events (id) on delete set null,
  channel text not null default 'kakao',
  recipient text,
  template_code text,
  body text,
  provider_status text not null default 'recorded',
  provider_message_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'message_logs'
      and c.contype = 'c'
      and (
        c.conname in (
          'message_logs_channel_check',
          'message_logs_provider_status_check'
        )
        or pg_get_constraintdef(c.oid) ilike '%channel%'
        or pg_get_constraintdef(c.oid) ilike '%provider_status%'
      )
  loop
    execute format(
      'alter table public.message_logs drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.message_logs
  add constraint message_logs_channel_check
  check (channel in ('kakao', 'sms', 'email', 'etc'));

alter table public.message_logs
  add constraint message_logs_provider_status_check
  check (provider_status in ('recorded', 'queued', 'sent', 'failed'));

create index if not exists message_logs_event_id_idx
  on public.message_logs (notification_event_id);

-- ---------------------------------------------------------------------------
-- 3) RLS
--    - 미승인/비활성: is_erp_user()=false → 차단
--    - admin: 전체 알림 조회·등록 / 수정·삭제는 admin만
--    - 일반 직원: can_access_customer 범위(본인·팀·미배정)만
-- ---------------------------------------------------------------------------
alter table public.notification_events enable row level security;
alter table public.message_logs enable row level security;

drop policy if exists "notification_events_staff" on public.notification_events;
drop policy if exists "notification_events_select_erp" on public.notification_events;
drop policy if exists "notification_events_insert_erp" on public.notification_events;
drop policy if exists "notification_events_update_admin" on public.notification_events;
drop policy if exists "notification_events_delete_admin" on public.notification_events;

create policy "notification_events_select_erp" on public.notification_events
  for select to authenticated
  using (
    public.is_erp_user()
    and (
      public.is_admin()
      or customer_id is null
      or public.can_access_customer(customer_id)
    )
  );

create policy "notification_events_insert_erp" on public.notification_events
  for insert to authenticated
  with check (
    public.is_erp_user()
    and (
      public.is_admin()
      or customer_id is null
      or public.can_access_customer(customer_id)
    )
  );

create policy "notification_events_update_admin" on public.notification_events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "notification_events_delete_admin" on public.notification_events
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "message_logs_staff" on public.message_logs;
drop policy if exists "message_logs_insert_auth" on public.message_logs;
drop policy if exists "message_logs_select_auth" on public.message_logs;
drop policy if exists "message_logs_select_erp" on public.message_logs;
drop policy if exists "message_logs_insert_erp" on public.message_logs;
drop policy if exists "message_logs_update_admin" on public.message_logs;
drop policy if exists "message_logs_delete_admin" on public.message_logs;

-- message_logs: 승인된 ERP 사용자만 (미승인 authenticated 차단)
create policy "message_logs_select_erp" on public.message_logs
  for select to authenticated
  using (public.is_erp_user());

create policy "message_logs_insert_erp" on public.message_logs
  for insert to authenticated
  with check (public.is_erp_user());

create policy "message_logs_update_admin" on public.message_logs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "message_logs_delete_admin" on public.message_logs
  for delete to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';
