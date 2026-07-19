-- =============================================================================
-- Eighty ERP — 회사 기능 5A단계: 핵심 테이블 회사별 RLS
-- 파일: 20260803000016_core_company_rls.sql
-- 기존 권한 구조는 유지하고 현재 회사 조건만 추가
-- =============================================================================

begin;

-- teams
alter policy teams_write_admin
on public.teams
using (
  public.is_admin()
  and company_id = (select public.current_company_id())
)
with check (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

alter policy teams_select_erp
on public.teams
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
);

-- employees
alter policy employees_delete_admin
on public.employees
using (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

alter policy employees_insert_admin
on public.employees
with check (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

alter policy employees_select_erp
on public.employees
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
);

alter policy employees_update_admin
on public.employees
using (
  public.is_admin()
  and company_id = (select public.current_company_id())
)
with check (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

-- lead_sources
alter policy lead_sources_delete_authenticated
on public.lead_sources
using (
  company_id = (select public.current_company_id())
);

alter policy lead_sources_insert_authenticated
on public.lead_sources
with check (
  company_id = (select public.current_company_id())
);

alter policy lead_sources_select_authenticated
on public.lead_sources
using (
  company_id = (select public.current_company_id())
);

alter policy lead_sources_update_authenticated
on public.lead_sources
using (
  company_id = (select public.current_company_id())
)
with check (
  company_id = (select public.current_company_id())
);

-- customers
alter policy customers_delete_admin_only
on public.customers
using (
  public.is_admin()
  and deleted_at is not null
  and company_id = (select public.current_company_id())
);

alter policy customers_insert_erp
on public.customers
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
);

alter policy customers_select_erp
on public.customers
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    deleted_at is null
    or public.is_admin()
  )
);

alter policy customers_update_admin
on public.customers
using (
  public.is_admin()
  and company_id = (select public.current_company_id())
)
with check (
  public.is_admin()
  and company_id = (select public.current_company_id())
);

alter policy customers_update_staff_erp
on public.customers
using (
  public.is_erp_user()
  and deleted_at is null
  and not public.is_admin()
  and company_id = (select public.current_company_id())
)
with check (
  public.is_erp_user()
  and deleted_at is null
  and not public.is_admin()
  and company_id = (select public.current_company_id())
);

-- 적용 검증
do $$
declare
  v_rls_disabled integer;
  v_unprotected_policies integer;
begin
  select count(*)::integer
  into v_rls_disabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (
      array['teams', 'employees', 'lead_sources', 'customers']
    )
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception
      '5A RLS 적용 실패: RLS가 꺼진 대상 테이블 수=%',
      v_rls_disabled;
  end if;

  select count(*)::integer
  into v_unprotected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = any (
      array['teams', 'employees', 'lead_sources', 'customers']
    )
    and (
      (
        cmd in ('SELECT', 'DELETE')
        and coalesce(qual, '') not ilike '%current_company_id%'
      )
      or
      (
        cmd = 'INSERT'
        and coalesce(with_check, '') not ilike '%current_company_id%'
      )
      or
      (
        cmd in ('UPDATE', 'ALL')
        and (
          coalesce(qual, '') not ilike '%current_company_id%'
          or coalesce(with_check, '') not ilike '%current_company_id%'
        )
      )
    );

  if v_unprotected_policies <> 0 then
    raise exception
      '5A RLS 적용 실패: 회사 조건이 없는 정책 수=%',
      v_unprotected_policies;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;