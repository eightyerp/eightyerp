-- =============================================================================
-- Eighty ERP — 회사 기능 5D단계: 운영 이벤트·발송 기록 회사별 RLS
-- 파일: 20260803000019_operational_events_company_rls.sql
--
-- 기존 허용 정책은 유지하고 RESTRICTIVE 회사 차단 정책만 추가
-- 데이터·기존 인덱스·기존 정책 변경 없음
-- =============================================================================

begin;

-- 회사 차단 정책 생성
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_send_logs'
      and policyname = 'quote_send_logs_company_guard'
  ) then
    create policy quote_send_logs_company_guard
      on public.quote_send_logs
      as restrictive
      for all
      to authenticated
      using (
        company_id = (select public.current_company_id())
      )
      with check (
        company_id = (select public.current_company_id())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_alert_events'
      and policyname = 'schedule_alert_events_company_guard'
  ) then
    create policy schedule_alert_events_company_guard
      on public.schedule_alert_events
      as restrictive
      for all
      to authenticated
      using (
        company_id = (select public.current_company_id())
      )
      with check (
        company_id = (select public.current_company_id())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_events'
      and policyname = 'notification_events_company_guard'
  ) then
    create policy notification_events_company_guard
      on public.notification_events
      as restrictive
      for all
      to authenticated
      using (
        company_id = (select public.current_company_id())
      )
      with check (
        company_id = (select public.current_company_id())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'message_logs'
      and policyname = 'message_logs_company_guard'
  ) then
    create policy message_logs_company_guard
      on public.message_logs
      as restrictive
      for all
      to authenticated
      using (
        company_id = (select public.current_company_id())
      )
      with check (
        company_id = (select public.current_company_id())
      );
  end if;
end $$;

-- 재실행 시에도 역할과 조건을 정확하게 재설정
alter policy quote_send_logs_company_guard
on public.quote_send_logs
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy schedule_alert_events_company_guard
on public.schedule_alert_events
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy notification_events_company_guard
on public.notification_events
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy message_logs_company_guard
on public.message_logs
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

-- 적용 검증
do $$
declare
  v_rls_disabled integer;
  v_bad_guard integer;
  v_without_permissive integer;
begin
  select count(*)::integer
  into v_rls_disabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (
      array[
        'quote_send_logs',
        'schedule_alert_events',
        'notification_events',
        'message_logs'
      ]
    )
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception
      '5D RLS 적용 실패: RLS가 꺼진 대상 테이블 수=%',
      v_rls_disabled;
  end if;

  select count(*)::integer
  into v_bad_guard
  from (
    values
      ('quote_send_logs', 'quote_send_logs_company_guard'),
      (
        'schedule_alert_events',
        'schedule_alert_events_company_guard'
      ),
      ('notification_events', 'notification_events_company_guard'),
      ('message_logs', 'message_logs_company_guard')
  ) as target(table_name, policy_name)
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = target.table_name
   and p.policyname = target.policy_name
  where p.policyname is null
     or p.permissive <> 'RESTRICTIVE'
     or p.cmd <> 'ALL'
     or not ('authenticated' = any(p.roles))
     or coalesce(p.qual, '') not ilike '%current_company_id%'
     or coalesce(p.with_check, '') not ilike '%current_company_id%';

  if v_bad_guard <> 0 then
    raise exception
      '5D RLS 적용 실패: 잘못된 회사 차단 정책 수=%',
      v_bad_guard;
  end if;

  select count(*)::integer
  into v_without_permissive
  from (
    values
      ('quote_send_logs'),
      ('schedule_alert_events'),
      ('notification_events'),
      ('message_logs')
  ) as target(table_name)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = target.table_name
      and p.permissive = 'PERMISSIVE'
  );

  if v_without_permissive <> 0 then
    raise exception
      '5D RLS 적용 실패: 기존 허용 정책이 없는 테이블 수=%',
      v_without_permissive;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;