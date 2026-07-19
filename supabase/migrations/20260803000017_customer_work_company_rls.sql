-- =============================================================================
-- Eighty ERP — 회사 기능 5B단계: 프로젝트·견적·고객 일정 회사별 RLS
-- 파일: 20260803000017_customer_work_company_rls.sql
--
-- 방식:
--   - 기존 정책은 변경하거나 삭제하지 않음
--   - RESTRICTIVE 정책을 추가하여 기존 권한과 회사 조건을 모두 통과시킴
--   - 현재 선택된 회사의 데이터만 조회·작성·수정 가능
--
-- 성능:
--   - current_company_id()를 쿼리당 한 번만 계산
--   - 앞 단계에서 만든 company_id 선두 복합 인덱스 활용
--
-- 안전:
--   - 데이터 변경·삭제 없음
--   - 기존 정책 이름·권한·조건 변경 없음
--   - 정책이 이미 있으면 재사용 후 조건 재설정
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 회사 차단용 RESTRICTIVE 정책 생성
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_company_guard'
  ) then
    create policy projects_company_guard
      on public.projects
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
      and tablename = 'quotes'
      and policyname = 'quotes_company_guard'
  ) then
    create policy quotes_company_guard
      on public.quotes
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
      and tablename = 'customer_schedules'
      and policyname = 'customer_schedules_company_guard'
  ) then
    create policy customer_schedules_company_guard
      on public.customer_schedules
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
alter policy projects_company_guard
on public.projects
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy quotes_company_guard
on public.quotes
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy customer_schedules_company_guard
on public.customer_schedules
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
      array['projects', 'quotes', 'customer_schedules']
    )
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception
      '5B RLS 적용 실패: RLS가 꺼진 대상 테이블 수=%',
      v_rls_disabled;
  end if;

  select count(*)::integer
  into v_bad_guard
  from (
    values
      ('projects', 'projects_company_guard'),
      ('quotes', 'quotes_company_guard'),
      ('customer_schedules', 'customer_schedules_company_guard')
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
      '5B RLS 적용 실패: 잘못된 회사 차단 정책 수=%',
      v_bad_guard;
  end if;

  select count(*)::integer
  into v_without_permissive
  from (
    values
      ('projects'),
      ('quotes'),
      ('customer_schedules')
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
      '5B RLS 적용 실패: 기존 허용 정책이 없는 테이블 수=%',
      v_without_permissive;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;