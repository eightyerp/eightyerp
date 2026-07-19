-- =============================================================================
-- Eighty ERP — 회사 기능 5E단계: 고객 이력 테이블 회사별 RLS
-- 파일: 20260803000020_customer_history_company_rls.sql
--
-- 대상:
--   - customer_checklists
--   - customer_activities
--   - inquiry_messages
--
-- 방식:
--   - 기존 허용 정책은 변경하거나 삭제하지 않음
--   - RESTRICTIVE 회사 차단 정책만 추가
--   - current_company_id()는 쿼리당 한 번만 계산
--
-- 안전:
--   - 데이터·기존 인덱스·기존 정책 변경 없음
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) RESTRICTIVE 회사 차단 정책 생성
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_checklists'
      and policyname = 'customer_checklists_company_guard'
  ) then
    create policy customer_checklists_company_guard
      on public.customer_checklists
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
      and tablename = 'customer_activities'
      and policyname = 'customer_activities_company_guard'
  ) then
    create policy customer_activities_company_guard
      on public.customer_activities
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
      and tablename = 'inquiry_messages'
      and policyname = 'inquiry_messages_company_guard'
  ) then
    create policy inquiry_messages_company_guard
      on public.inquiry_messages
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

-- ---------------------------------------------------------------------------
-- 2) 재실행 시에도 역할과 조건을 정확하게 재설정
-- ---------------------------------------------------------------------------
alter policy customer_checklists_company_guard
on public.customer_checklists
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy customer_activities_company_guard
on public.customer_activities
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy inquiry_messages_company_guard
on public.inquiry_messages
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

-- ---------------------------------------------------------------------------
-- 3) 적용 검증
-- ---------------------------------------------------------------------------
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
        'customer_checklists',
        'customer_activities',
        'inquiry_messages'
      ]
    )
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception
      '5E RLS 적용 실패: RLS가 꺼진 대상 테이블 수=%',
      v_rls_disabled;
  end if;

  select count(*)::integer
  into v_bad_guard
  from (
    values
      (
        'customer_checklists',
        'customer_checklists_company_guard'
      ),
      (
        'customer_activities',
        'customer_activities_company_guard'
      ),
      (
        'inquiry_messages',
        'inquiry_messages_company_guard'
      )
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
      '5E RLS 적용 실패: 잘못된 회사 차단 정책 수=%',
      v_bad_guard;
  end if;

  select count(*)::integer
  into v_without_permissive
  from (
    values
      ('customer_checklists'),
      ('customer_activities'),
      ('inquiry_messages')
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
      '5E RLS 적용 실패: 기존 허용 정책이 없는 테이블 수=%',
      v_without_permissive;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;