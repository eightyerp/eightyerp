-- =============================================================================
-- EIGHTY CRM — PUSH 정책 보강
-- 파일: 20260816093000_crm_push_policy_completion.sql
--
-- 목적
--   1) 일정 등록/변경 PUSH 활성화 전 과거 pending backlog 안전 정리
--   2) 진행 중 고객 3일/7일 장기 방치 이벤트 생성
--   3) 장기 방치 판정용 조회 인덱스 보강
--
-- 전제
--   - 20260816090000_crm_mobile_push_foundation.sql
--
-- 안전
--   - 고객/상담/일정 데이터 삭제 없음
--   - 기존 schedule_changed 과거 이벤트만 skipped 처리
--   - 실제 Push 발송/cron/Secret 활성화는 별도 승인 후 수행
--   - service_role scheduler에서도 회사 범위가 보존되도록 event.company_id를 명시한다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 일정등록 PUSH를 처음 켤 때 과거 backlog가 한꺼번에 발송되지 않도록 정리
--    migration 이후 새로 생성되는 schedule_changed 이벤트만 Worker가 처리한다.
-- ---------------------------------------------------------------------------
update public.schedule_alert_events
set status = 'skipped',
    processed_at = now(),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'skip_reason', 'pre_push_activation_backlog'
    )
where event_type = 'schedule_changed'
  and status = 'pending';

-- ---------------------------------------------------------------------------
-- 2) 장기 방치 판정 성능 보강
-- ---------------------------------------------------------------------------
create index if not exists customer_activities_customer_created_idx
  on public.customer_activities (customer_id, created_at desc);

create index if not exists crm_customer_schedules_customer_start_active_idx
  on public.customer_schedules (customer_id, start_at)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3) 진행 중 고객 장기 방치 이벤트 생성
--
-- 기본 정책
--   - 3일 이상 ~ 7일 미만: customer_stale_3d 1회
--   - 7일 이상: customer_stale_7d 1회
--   - 미래 연락일 또는 미래 고객 일정이 있으면 방치로 보지 않음
--   - 상담/전화/문자/카카오/실측/견적발송/계약협의 등 의미 있는 활동이
--     새로 생기면 last_activity_at이 바뀌어 이후 타이머가 자연스럽게 reset됨
--   - 담당자변경/상태변경만으로는 방치 타이머를 reset하지 않음
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_due_crm_stale_customer_alerts(
  p_now timestamptz default now()
)
returns table (
  stale_3d_count integer,
  stale_7d_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stale_3d integer := 0;
  v_stale_7d integer := 0;
begin
  -- 3일 이상 ~ 7일 미만 방치
  with candidates as (
    select
      c.id as customer_id,
      c.company_id,
      c.assigned_employee_id,
      c.name as customer_name,
      c.status::text as customer_status,
      greatest(
        c.created_at,
        coalesce(
          (
            select max(a.created_at)
            from public.customer_activities a
            where a.customer_id = c.id
              and coalesce(a.activity_type::text, '') not in ('담당자변경', '상태변경')
          ),
          c.created_at
        )
      ) as last_activity_at
    from public.customers c
    where c.deleted_at is null
      and c.assigned_employee_id is not null
      and c.status::text in (
        '신규',
        '미연락',
        '1차 연락완료',
        '상담중',
        '방문예약',
        '실측예약',
        '견적작성중',
        '견적제출',
        '계약협의'
      )
      and (
        c.next_contact_at is null
        or c.next_contact_at < (p_now at time zone 'Asia/Seoul')::date
      )
      and not exists (
        select 1
        from public.customer_schedules s
        where s.customer_id = c.id
          and s.deleted_at is null
          and s.status not in ('완료', '취소')
          and s.start_at >= p_now
      )
  )
  insert into public.schedule_alert_events (
    event_type,
    schedule_kind,
    schedule_id,
    customer_id,
    assigned_employee_id,
    company_id,
    payload,
    status,
    dedupe_key
  )
  select
    'customer_stale_3d',
    'customer_stale',
    x.customer_id,
    x.customer_id,
    x.assigned_employee_id,
    x.company_id,
    jsonb_build_object(
      'source', 'crm_stale_customer_scheduler',
      'customer_name', x.customer_name,
      'customer_status', x.customer_status,
      'last_activity_at', x.last_activity_at,
      'stale_days', 3,
      'url', '/crm/customers/' || x.customer_id::text
    ),
    'pending',
    'customer_stale_3d:' || x.customer_id::text || ':' ||
      extract(epoch from x.last_activity_at)::bigint::text
  from candidates x
  where x.last_activity_at <= p_now - interval '3 days'
    and x.last_activity_at > p_now - interval '7 days'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_stale_3d = row_count;

  -- 7일 이상 방치. 이미 3일 알림을 받은 고객도 7일에 한 번 더 escalation 가능.
  with candidates as (
    select
      c.id as customer_id,
      c.company_id,
      c.assigned_employee_id,
      c.name as customer_name,
      c.status::text as customer_status,
      greatest(
        c.created_at,
        coalesce(
          (
            select max(a.created_at)
            from public.customer_activities a
            where a.customer_id = c.id
              and coalesce(a.activity_type::text, '') not in ('담당자변경', '상태변경')
          ),
          c.created_at
        )
      ) as last_activity_at
    from public.customers c
    where c.deleted_at is null
      and c.assigned_employee_id is not null
      and c.status::text in (
        '신규',
        '미연락',
        '1차 연락완료',
        '상담중',
        '방문예약',
        '실측예약',
        '견적작성중',
        '견적제출',
        '계약협의'
      )
      and (
        c.next_contact_at is null
        or c.next_contact_at < (p_now at time zone 'Asia/Seoul')::date
      )
      and not exists (
        select 1
        from public.customer_schedules s
        where s.customer_id = c.id
          and s.deleted_at is null
          and s.status not in ('완료', '취소')
          and s.start_at >= p_now
      )
  )
  insert into public.schedule_alert_events (
    event_type,
    schedule_kind,
    schedule_id,
    customer_id,
    assigned_employee_id,
    company_id,
    payload,
    status,
    dedupe_key
  )
  select
    'customer_stale_7d',
    'customer_stale',
    x.customer_id,
    x.customer_id,
    x.assigned_employee_id,
    x.company_id,
    jsonb_build_object(
      'source', 'crm_stale_customer_scheduler',
      'customer_name', x.customer_name,
      'customer_status', x.customer_status,
      'last_activity_at', x.last_activity_at,
      'stale_days', 7,
      'url', '/crm/customers/' || x.customer_id::text
    ),
    'pending',
    'customer_stale_7d:' || x.customer_id::text || ':' ||
      extract(epoch from x.last_activity_at)::bigint::text
  from candidates x
  where x.last_activity_at <= p_now - interval '7 days'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_stale_7d = row_count;

  return query select v_stale_3d, v_stale_7d;
end;
$$;

revoke all on function public.enqueue_due_crm_stale_customer_alerts(timestamptz) from public;
revoke all on function public.enqueue_due_crm_stale_customer_alerts(timestamptz) from anon;
revoke all on function public.enqueue_due_crm_stale_customer_alerts(timestamptz) from authenticated;
grant execute on function public.enqueue_due_crm_stale_customer_alerts(timestamptz) to service_role;

notify pgrst, 'reload schema';
