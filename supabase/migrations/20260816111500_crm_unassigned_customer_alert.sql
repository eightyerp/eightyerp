-- =============================================================================
-- EIGHTY CRM — 미배정 신규문의 관리자 누락 방지
-- 파일: 20260816111500_crm_unassigned_customer_alert.sql
--
-- 목적
--   신규문의가 들어왔지만 10분 이상 담당자 미배정 상태라면 같은 회사의
--   활성 admin/super_admin에게 1회 알림을 생성한다.
--
-- 안전
--   - 고객/직원 데이터 수정 없음
--   - 동일 고객/관리자 조합은 dedupe_key로 1회만 생성
--   - 실제 PUSH 발송/cron/Secret 활성화는 별도 승인 후 수행
--   - 알림 클릭은 설치형 CRM 범위 안의 간편 담당자 배정 화면으로 연결한다.
-- =============================================================================

create or replace function public.enqueue_due_crm_unassigned_customer_alerts(
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
    'customer_unassigned_10m',
    'customer_unassigned',
    c.id,
    c.id,
    e.id,
    c.company_id,
    jsonb_build_object(
      'source', 'crm_unassigned_customer_scheduler',
      'customer_name', c.name,
      'customer_status', c.status,
      'created_at', c.created_at,
      'url', '/crm/customers/' || c.id::text || '/assignee'
    ),
    'pending',
    'customer_unassigned_10m:' || c.id::text || ':' || e.id::text
  from public.customers c
  join public.employees e
    on e.company_id = c.company_id
   and e.is_active = true
   and e.merged_into_employee_id is null
  join public.profiles p
    on p.employee_id = e.id
   and p.is_active = true
   and p.is_approved = true
   and p.role in ('admin', 'super_admin')
  where c.deleted_at is null
    and c.assigned_employee_id is null
    and c.status::text in ('신규', '미연락')
    and c.created_at <= p_now - interval '10 minutes'
    and c.created_at >= p_now - interval '3 days'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_crm_unassigned_customer_alerts(timestamptz) from public;
revoke all on function public.enqueue_due_crm_unassigned_customer_alerts(timestamptz) from anon;
revoke all on function public.enqueue_due_crm_unassigned_customer_alerts(timestamptz) from authenticated;
grant execute on function public.enqueue_due_crm_unassigned_customer_alerts(timestamptz) to service_role;

notify pgrst, 'reload schema';
