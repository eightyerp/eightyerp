-- =============================================================================
-- Eighty ERP — 회사 기능 5C단계: 하위 업무 테이블 회사별 RLS
-- 파일: 20260803000018_customer_work_children_company_rls.sql
--
-- 대상:
--   - customer_consult_logs
--   - quote_files
--   - quote_items
--   - project_materials
--   - project_process_schedules
--
-- 방식:
--   - 기존 허용 정책은 변경하거나 삭제하지 않음
--   - RESTRICTIVE 회사 차단 정책만 추가
--   - project_materials는 저장소 기록에 있던 누락 정책 3개만 복구
--
-- 안전:
--   - 데이터 변경·삭제 없음
--   - DELETE 권한 신규 추가 없음
--   - current_company_id()는 쿼리당 한 번만 계산
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 운영 DB에서 누락된 project_materials 기존 권한 복구
-- 저장소 기록과 동일하게 SELECT / INSERT / UPDATE만 허용
-- ---------------------------------------------------------------------------
grant select, insert, update
on public.project_materials
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_materials'
      and policyname = 'staff_project_materials_select'
  ) then
    create policy staff_project_materials_select
      on public.project_materials
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_materials'
      and policyname = 'staff_project_materials_insert'
  ) then
    create policy staff_project_materials_insert
      on public.project_materials
      for insert
      to authenticated
      with check (auth.uid() is not null);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_materials'
      and policyname = 'staff_project_materials_update'
  ) then
    create policy staff_project_materials_update
      on public.project_materials
      for update
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;
end $$;

alter policy staff_project_materials_select
on public.project_materials
to authenticated
using (
  auth.uid() is not null
);

alter policy staff_project_materials_insert
on public.project_materials
to authenticated
with check (
  auth.uid() is not null
);

alter policy staff_project_materials_update
on public.project_materials
to authenticated
using (
  auth.uid() is not null
)
with check (
  auth.uid() is not null
);

-- ---------------------------------------------------------------------------
-- 2) 모든 대상 테이블에 RESTRICTIVE 회사 차단 정책 추가
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_consult_logs'
      and policyname = 'customer_consult_logs_company_guard'
  ) then
    create policy customer_consult_logs_company_guard
      on public.customer_consult_logs
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
      and tablename = 'quote_files'
      and policyname = 'quote_files_company_guard'
  ) then
    create policy quote_files_company_guard
      on public.quote_files
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
      and tablename = 'quote_items'
      and policyname = 'quote_items_company_guard'
  ) then
    create policy quote_items_company_guard
      on public.quote_items
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
      and tablename = 'project_materials'
      and policyname = 'project_materials_company_guard'
  ) then
    create policy project_materials_company_guard
      on public.project_materials
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
      and tablename = 'project_process_schedules'
      and policyname = 'project_process_schedules_company_guard'
  ) then
    create policy project_process_schedules_company_guard
      on public.project_process_schedules
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
-- 3) 재실행 시에도 회사 차단 역할과 조건을 정확하게 재설정
-- ---------------------------------------------------------------------------
alter policy customer_consult_logs_company_guard
on public.customer_consult_logs
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy quote_files_company_guard
on public.quote_files
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy quote_items_company_guard
on public.quote_items
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy project_materials_company_guard
on public.project_materials
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

alter policy project_process_schedules_company_guard
on public.project_process_schedules
to authenticated
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

-- ---------------------------------------------------------------------------
-- 4) 적용 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_rls_disabled integer;
  v_bad_guard integer;
  v_without_permissive integer;
  v_bad_material_policy integer;
begin
  select count(*)::integer
  into v_rls_disabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (
      array[
        'customer_consult_logs',
        'quote_files',
        'quote_items',
        'project_materials',
        'project_process_schedules'
      ]
    )
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception
      '5C RLS 적용 실패: RLS가 꺼진 대상 테이블 수=%',
      v_rls_disabled;
  end if;

  select count(*)::integer
  into v_bad_guard
  from (
    values
      ('customer_consult_logs', 'customer_consult_logs_company_guard'),
      ('quote_files', 'quote_files_company_guard'),
      ('quote_items', 'quote_items_company_guard'),
      ('project_materials', 'project_materials_company_guard'),
      (
        'project_process_schedules',
        'project_process_schedules_company_guard'
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
      '5C RLS 적용 실패: 잘못된 회사 차단 정책 수=%',
      v_bad_guard;
  end if;

  select count(*)::integer
  into v_without_permissive
  from (
    values
      ('customer_consult_logs'),
      ('quote_files'),
      ('quote_items'),
      ('project_materials'),
      ('project_process_schedules')
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
      '5C RLS 적용 실패: 허용 정책이 없는 테이블 수=%',
      v_without_permissive;
  end if;

  select count(*)::integer
  into v_bad_material_policy
  from (
    values
      ('staff_project_materials_select', 'SELECT'),
      ('staff_project_materials_insert', 'INSERT'),
      ('staff_project_materials_update', 'UPDATE')
  ) as expected(policy_name, command_name)
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = 'project_materials'
   and p.policyname = expected.policy_name
  where p.policyname is null
     or p.permissive <> 'PERMISSIVE'
     or p.cmd <> expected.command_name
     or not ('authenticated' = any(p.roles));

  if v_bad_material_policy <> 0 then
    raise exception
      '5C RLS 적용 실패: project_materials 누락 정책 수=%',
      v_bad_material_policy;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;