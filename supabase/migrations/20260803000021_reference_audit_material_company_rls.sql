-- =============================================================================
-- Eighty ERP — 회사 기능 5F단계: 참조·감사·자재 테이블 회사별 RLS
-- 파일: 20260803000021_reference_audit_material_company_rls.sql
--
-- 대상:
--   - material_categories
--   - audit_logs
--   - material_catalog
--   - material_catalog_images
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
      and tablename = 'material_categories'
      and policyname = 'material_categories_company_guard'
  ) then
    create policy material_categories_company_guard
      on public.material_categories
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
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_company_guard'
  ) then
    create policy audit_logs_company_guard
      on public.audit_logs
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
      and tablename = 'material_catalog'
      and policyname = 'material_catalog_company_guard'
  ) then
    create policy material_catalog_company_guard
      on public.material_catalog
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
      and tablename = 'material_catalog_images'
      and policyname = 'material_catalog_images_company_guard'
  ) then
    create policy material_catalog_images_company_guard
      on public.material_catalog_images
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
alter policy material_categories_company_guard
on public.material_categories
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy audit_logs_company_guard
on public.audit_logs
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy material_catalog_company_guard
on public.material_catalog
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy material_catalog_images_company_guard
on public.material_catalog_images
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
        'material_categories',
        'audit_logs',
        'material_catalog',
        'material_catalog_images'
      ]
    )
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception
      '5F RLS 적용 실패: RLS가 꺼진 대상 테이블 수=%',
      v_rls_disabled;
  end if;

  select count(*)::integer
  into v_bad_guard
  from (
    values
      (
        'material_categories',
        'material_categories_company_guard'
      ),
      ('audit_logs', 'audit_logs_company_guard'),
      ('material_catalog', 'material_catalog_company_guard'),
      (
        'material_catalog_images',
        'material_catalog_images_company_guard'
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
      '5F RLS 적용 실패: 잘못된 회사 차단 정책 수=%',
      v_bad_guard;
  end if;

  select count(*)::integer
  into v_without_permissive
  from (
    values
      ('material_categories'),
      ('audit_logs'),
      ('material_catalog'),
      ('material_catalog_images')
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
      '5F RLS 적용 실패: 기존 허용 정책이 없는 테이블 수=%',
      v_without_permissive;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;