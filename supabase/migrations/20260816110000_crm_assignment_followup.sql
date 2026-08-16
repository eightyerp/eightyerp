-- =============================================================================
-- EIGHTY CRM — 신규 배분 후 첫 연락 누락 방지
-- 파일: 20260816110000_crm_assignment_followup.sql
--
-- 목적
--   1) 신규고객 배분 이벤트에 30분 첫 연락 추적 eligibility 표시
--   2) 배분 후 30분 동안 실제 연락/상담/예약이 없는 고객을 1회 알림
--   3) 멀티회사 company_id를 모든 이벤트에 명시
--   4) 관리자 수동배분뿐 아니라 service_role 자동 유입/자동배분도 동일하게 처리
--
-- 안전
--   - 고객/상담/일정 데이터 삭제 없음
--   - 기존 customer_assigned 이벤트는 follow-up 비대상으로 표시해 최초 활성화 폭주 방지
--   - 일반 직원이 본인 고객을 직접 등록한 경우에는 자동 배분 PUSH를 생성하지 않음
--   - 실제 PUSH 발송/cron/Secret 활성화는 별도 승인 후 수행
-- =============================================================================

-- 과거 배분 이벤트는 최초 활성화 시 30분 재촉 알림이 한꺼번에 나가지 않게 제외한다.
update public.notification_events
set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
  'assignment_followup_eligible', false
)
where event_type = 'customer_assigned'
  and not (coalesce(payload, '{}'::jsonb) ? 'assignment_followup_eligible');

-- 앞으로 관리자/회사 또는 서버 자동유입이 담당자를 배정한 이벤트는
-- 30분 첫 연락 추적 대상으로 표시한다.
create or replace function public.enqueue_crm_customer_assignment_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_source text;
begin
  if new.assigned_employee_id is null then
    return new;
  end if;

  -- 관리자 배분 또는 서버(service_role) 자동유입만 자동 배분 이벤트를 생성한다.
  -- 일반 직원의 본인 고객 직접등록은 자기 자신에게 불필요한 배분 PUSH를 만들지 않는다.
  if not public.is_admin() and v_jwt_role <> 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.assigned_employee_id is not distinct from new.assigned_employee_id then
    return new;
  end if;

  v_source := case
    when v_jwt_role = 'service_role' then 'automatic_system_assignment'
    else 'automatic_company_assignment'
  end;

  insert into public.notification_events (
    event_type,
    customer_id,
    company_id,
    payload,
    status
  )
  values (
    'customer_assigned',
    new.id,
    new.company_id,
    jsonb_build_object(
      'source', v_source,
      'assignment_followup_eligible', true,
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

-- 배분 후 30분 첫 연락 없음 이벤트.
-- 실제 연락/상담 활동 또는 예약이 잡히면 재촉하지 않는다.
create or replace function public.enqueue_due_crm_assignment_followups(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with latest_assignment as (
    select distinct on (n.customer_id)
      n.id as assignment_event_id,
      n.customer_id,
      n.created_at as assigned_at,
      n.payload
    from public.notification_events n
    where n.event_type = 'customer_assigned'
      and n.customer_id is not null
      and coalesce((n.payload ->> 'assignment_followup_eligible')::boolean, false)
      and n.created_at <= p_now - interval '30 minutes'
      and n.created_at >= p_now - interval '3 days'
    order by n.customer_id, n.created_at desc
  ), candidates as (
    select
      a.assignment_event_id,
      a.assigned_at,
      c.id as customer_id,
      c.company_id,
      c.assigned_employee_id,
      c.name as customer_name,
      c.status::text as customer_status
    from latest_assignment a
    join public.customers c on c.id = a.customer_id
    where c.deleted_at is null
      and c.assigned_employee_id is not null
      and c.assigned_employee_id::text = a.payload ->> 'assigned_employee_id'
      and c.status::text in ('신규', '미연락')
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
      and not exists (
        select 1
        from public.customer_activities ca
        where ca.customer_id = c.id
          and ca.created_at > a.assigned_at
          and coalesce(ca.activity_type::text, '') not in (
            '담당자변경', '상태변경', '메모', 'LX 본사문의', '홈페이지 문의'
          )
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
    'customer_assignment_uncontacted_30m',
    'customer_assignment',
    x.customer_id,
    x.customer_id,
    x.assigned_employee_id,
    x.company_id,
    jsonb_build_object(
      'source', 'crm_assignment_followup_scheduler',
      'customer_name', x.customer_name,
      'customer_status', x.customer_status,
      'assigned_at', x.assigned_at,
      'url', '/crm/customers/' || x.customer_id::text
    ),
    'pending',
    'customer_assignment_uncontacted_30m:' || x.assignment_event_id::text
  from candidates x
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_crm_assignment_followups(timestamptz) from public;
revoke all on function public.enqueue_due_crm_assignment_followups(timestamptz) from anon;
revoke all on function public.enqueue_due_crm_assignment_followups(timestamptz) from authenticated;
grant execute on function public.enqueue_due_crm_assignment_followups(timestamptz) to service_role;

notify pgrst, 'reload schema';
