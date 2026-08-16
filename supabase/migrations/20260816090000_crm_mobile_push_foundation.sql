-- =============================================================================
-- EIGHTY CRM — 직원 모바일 Web Push 기반
-- 파일: 20260816090000_crm_mobile_push_foundation.sql
--
-- 목적
--   1) 직원별 Web Push subscription 저장
--   2) 관리자/회사 고객 배분 시 customer_assigned 이벤트 자동 생성
--   3) 고객 일정 1시간 전 / 미처리 +30분 이벤트를 idempotent하게 생성
--
-- 주의
--   - 이 migration 파일 생성만으로 운영 DB에는 변화가 없다.
--   - pg_cron 활성화/실제 cron job/Edge Function Secret은 별도 승인 후 적용한다.
--   - 고객 데이터 삭제/초기화 없음.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 직원별 Web Push subscription
-- ---------------------------------------------------------------------------
create table if not exists public.crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  is_active boolean not null default true,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists crm_push_subscriptions_employee_active_idx
  on public.crm_push_subscriptions (employee_id, is_active)
  where is_active = true;

create index if not exists crm_push_subscriptions_user_idx
  on public.crm_push_subscriptions (user_id);

alter table public.crm_push_subscriptions enable row level security;

drop policy if exists "crm_push_subscriptions_select_own" on public.crm_push_subscriptions;
create policy "crm_push_subscriptions_select_own"
  on public.crm_push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "crm_push_subscriptions_insert_own" on public.crm_push_subscriptions;
create policy "crm_push_subscriptions_insert_own"
  on public.crm_push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "crm_push_subscriptions_update_own" on public.crm_push_subscriptions;
create policy "crm_push_subscriptions_update_own"
  on public.crm_push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "crm_push_subscriptions_delete_own" on public.crm_push_subscriptions;
create policy "crm_push_subscriptions_delete_own"
  on public.crm_push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.crm_push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 2) 회사/관리자 고객 배분 이벤트 자동 생성
--    직원이 본인 고객을 직접 등록한 경우에는 자동 PUSH 이벤트를 만들지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_crm_customer_assignment_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.assigned_employee_id is null then
    return new;
  end if;

  if not public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.assigned_employee_id is not distinct from new.assigned_employee_id then
    return new;
  end if;

  insert into public.notification_events (
    event_type,
    customer_id,
    payload,
    status
  )
  values (
    'customer_assigned',
    new.id,
    jsonb_build_object(
      'source', 'automatic_company_assignment',
      'assigned_employee_id', new.assigned_employee_id,
      'customer_name', new.name,
      'phone', new.phone,
      'address', new.address,
      'consultation_type', new.consultation_type,
      'status', new.status,
      'url', '/crm/customers/' || new.id::text
    ),
    'pending'
  );

  return new;
exception
  when others then
    -- 고객 저장 성공 여부를 알림 큐 실패가 좌우하지 않게 한다.
    return new;
end;
$$;

drop trigger if exists customers_crm_assignment_event on public.customers;
create trigger customers_crm_assignment_event
  after insert or update of assigned_employee_id on public.customers
  for each row
  execute function public.enqueue_crm_customer_assignment_event();

-- ---------------------------------------------------------------------------
-- 3) 시간 알림 dedupe key
--    기존 이벤트는 null 유지. start_at이 변경되면 새 key가 되어 재알림 가능.
-- ---------------------------------------------------------------------------
alter table public.schedule_alert_events
  add column if not exists dedupe_key text;

create unique index if not exists schedule_alert_events_dedupe_key_uidx
  on public.schedule_alert_events (dedupe_key)
  where dedupe_key is not null;

-- 기존 Performance Advisor 경고 보완: 알림 직원/고객 조회
create index if not exists schedule_alert_events_assignee_idx
  on public.schedule_alert_events (assigned_employee_id, created_at desc);

create index if not exists schedule_alert_events_customer_idx
  on public.schedule_alert_events (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) 예약 1시간 전 / 미연락 +30분 이벤트 생성
--    실제 scheduler는 이 함수를 주기적으로 호출한다.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_due_crm_schedule_alerts(
  p_now timestamptz default now()
)
returns table (
  remind_1h_count integer,
  unhandled_30m_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_remind integer := 0;
  v_unhandled integer := 0;
begin
  -- 예약/재연락 1시간 전. scheduler가 늦게 시작되어도 start_at 전이면 한 번 생성한다.
  insert into public.schedule_alert_events (
    event_type,
    schedule_kind,
    schedule_id,
    customer_id,
    assigned_employee_id,
    payload,
    status,
    dedupe_key
  )
  select
    'consult_remind_1h',
    'customer',
    s.id,
    s.customer_id,
    s.assigned_employee_id,
    jsonb_build_object(
      'source', 'crm_push_scheduler',
      'scheduled_start_at', s.start_at,
      'schedule_type', s.schedule_type,
      'title', s.title,
      'url', '/crm/customers/' || s.customer_id::text
    ),
    'pending',
    'consult_remind_1h:' || s.id::text || ':' || extract(epoch from s.start_at)::bigint::text
  from public.customer_schedules s
  where s.deleted_at is null
    and s.assigned_employee_id is not null
    and s.status in ('예정', '진행중')
    and s.schedule_type in ('전화상담', '방문상담', '실측', '계약상담', '재연락', '해피콜')
    and s.start_at > p_now
    and s.start_at <= p_now + interval '1 hour'
  on conflict (dedupe_key) do nothing;

  get diagnostics v_remind = row_count;

  -- 예정 시각 30분 경과 후에도 미처리. 후속 재예약이 있으면 재촉하지 않는다.
  insert into public.schedule_alert_events (
    event_type,
    schedule_kind,
    schedule_id,
    customer_id,
    assigned_employee_id,
    payload,
    status,
    dedupe_key
  )
  select
    'consult_unhandled',
    'customer',
    s.id,
    s.customer_id,
    s.assigned_employee_id,
    jsonb_build_object(
      'source', 'crm_push_scheduler',
      'scheduled_start_at', s.start_at,
      'schedule_type', s.schedule_type,
      'title', s.title,
      'overdue_minutes', floor(extract(epoch from (p_now - s.start_at)) / 60),
      'url', '/crm/customers/' || s.customer_id::text
    ),
    'pending',
    'consult_unhandled:' || s.id::text || ':' || extract(epoch from s.start_at)::bigint::text
  from public.customer_schedules s
  where s.deleted_at is null
    and s.assigned_employee_id is not null
    and s.status in ('예정', '진행중', '미처리')
    and s.schedule_type in ('전화상담', '방문상담', '실측', '계약상담', '재연락', '해피콜')
    and s.start_at <= p_now - interval '30 minutes'
    and not exists (
      select 1
      from public.customer_schedules later
      where later.id <> s.id
        and later.customer_id = s.customer_id
        and later.deleted_at is null
        and later.status not in ('완료', '취소')
        and later.start_at > s.start_at
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_unhandled = row_count;

  return query select v_remind, v_unhandled;
end;
$$;

revoke all on function public.enqueue_due_crm_schedule_alerts(timestamptz) from public;
revoke all on function public.enqueue_due_crm_schedule_alerts(timestamptz) from anon;
revoke all on function public.enqueue_due_crm_schedule_alerts(timestamptz) from authenticated;
grant execute on function public.enqueue_due_crm_schedule_alerts(timestamptz) to service_role;

notify pgrst, 'reload schema';
