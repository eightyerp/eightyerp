-- 외부문의 자동등록 / 담당자 배정 알림용 event_type 확장
-- (카카오톡 연동 확장 대비 — 자동 실행하지 않음. SQL Editor에서 수동 적용)
-- 기존 material_* 이벤트 타입은 유지합니다.

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'notification_events'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%event_type%';

  if con_name is not null then
    execute format('alter table public.notification_events drop constraint %I', con_name);
  end if;
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
