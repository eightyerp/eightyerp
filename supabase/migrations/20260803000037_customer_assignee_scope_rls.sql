-- =============================================================================
-- Eighty ERP — Bundle E: 고객 담당자 범위 RLS
-- =============================================================================
-- 목적:
--   - 관리자(profiles.role = admin | super_admin): 같은 회사 전체 고객
--   - 일반 직원(manager/staff 포함): assigned_employee_id = 본인만
--   - 미배정 고객: 관리자만 조회·배정
--   - 전화 중복 탐지는 회사 전체 유지, 권한 밖 개인정보는 마스킹
--
-- 안전:
--   - 데이터 UPDATE/DELETE/TRUNCATE/백필 없음
--   - DROP TABLE/COLUMN 없음
--   - CREATE OR REPLACE / DROP POLICY IF EXISTS + 재생성
--   - can_access_customer 는 SECURITY DEFINER (customers 정책에서 호출해도 재귀 없음)
--
-- 역할:
--   - public.is_admin() = profiles.role in ('admin','super_admin')
--   - company_memberships.role 과 무관
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) can_access_customer — Bundle E 최소권한
-- ---------------------------------------------------------------------------
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      -- RLS customers_select_erp 와 동일: NULL = NULL 은 통과하지 않음
      and c.company_id = public.current_company_id()
      and (
        public.is_admin()
        or (
          public.current_employee_id() is not null
          and c.assigned_employee_id = public.current_employee_id()
        )
      )
  );
$$;

grant execute on function public.can_access_customer(uuid) to authenticated;
grant execute on function public.can_access_customer(uuid) to anon;

comment on function public.can_access_customer(uuid) is
  'Bundle E: admin=회사 전체, 그 외=본인 담당만. 미배정은 관리자만. company_id 격리.';

-- ---------------------------------------------------------------------------
-- 2) 전화 중복 조회 (개인정보 마스킹) — RLS 우회하되 응답은 권한별 최소화
-- ---------------------------------------------------------------------------
create or replace function public.lookup_company_customer_phone_duplicates(
  p_phone text,
  p_exclude_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_company_id uuid;
  v_result jsonb := '[]'::jsonb;
  r record;
  v_accessible boolean;
  v_item jsonb;
begin
  if not public.is_erp_user() then
    return '[]'::jsonb;
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    return '[]'::jsonb;
  end if;

  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) not in (10, 11) then
    return '[]'::jsonb;
  end if;

  for r in
    select
      c.id,
      c.name,
      c.phone,
      c.status,
      c.assigned_employee_id,
      e.name as emp_name,
      e.title as emp_title
    from public.customers c
    left join public.employees e on e.id = c.assigned_employee_id
    where c.company_id = v_company_id
      and c.deleted_at is null
      and (p_exclude_id is null or c.id <> p_exclude_id)
      and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits
    order by c.created_at desc
    limit 10
  loop
    v_accessible :=
      public.is_admin()
      or (
        public.current_employee_id() is not null
        and r.assigned_employee_id = public.current_employee_id()
      );

    if v_accessible then
      v_item := jsonb_build_object(
        'accessible', true,
        'reason', 'phone',
        'id', r.id,
        'name', r.name,
        'phone', r.phone,
        'address', null,
        'source_order_no', null,
        'status', r.status,
        'assignee_name', case
          when r.emp_name is null then null
          when nullif(trim(coalesce(r.emp_title, '')), '') is null then r.emp_name
          else r.emp_name || ' ' || r.emp_title
        end
      );
    else
      v_item := jsonb_build_object(
        'accessible', false,
        'reason', 'phone',
        'id', null,
        'name', null,
        'phone', null,
        'address', null,
        'source_order_no', null,
        'status', null,
        'assignee_name', null
      );
    end if;

    v_result := v_result || jsonb_build_array(v_item);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.lookup_company_customer_phone_duplicates(text, uuid) from public;
grant execute on function public.lookup_company_customer_phone_duplicates(text, uuid) to authenticated;

comment on function public.lookup_company_customer_phone_duplicates(text, uuid) is
  '회사 내 전화 중복 soft 경고. 권한 밖 행은 accessible=false 및 개인정보 null.';

-- ---------------------------------------------------------------------------
-- 3) customers RLS — 담당자 범위
-- ---------------------------------------------------------------------------
drop policy if exists customers_select_erp on public.customers;
create policy customers_select_erp
on public.customers
for select
to authenticated
using (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    deleted_at is null
    or public.is_admin()
  )
  and (
    public.is_admin()
    or (
      public.current_employee_id() is not null
      and assigned_employee_id = public.current_employee_id()
    )
  )
);

drop policy if exists customers_insert_erp on public.customers;
create policy customers_insert_erp
on public.customers
for insert
to authenticated
with check (
  public.is_erp_user()
  and company_id = (select public.current_company_id())
  and (
    public.is_admin()
    or (
      public.current_employee_id() is not null
      and assigned_employee_id = public.current_employee_id()
    )
  )
);

drop policy if exists customers_update_staff_erp on public.customers;
create policy customers_update_staff_erp
on public.customers
for update
to authenticated
using (
  public.is_erp_user()
  and deleted_at is null
  and not public.is_admin()
  and company_id = (select public.current_company_id())
  and public.current_employee_id() is not null
  and assigned_employee_id = public.current_employee_id()
)
with check (
  public.is_erp_user()
  and deleted_at is null
  and not public.is_admin()
  and company_id = (select public.current_company_id())
  and public.current_employee_id() is not null
  and assigned_employee_id = public.current_employee_id()
  and deleted_at is null
);

-- customers_update_admin / customers_delete_admin_only 는 기존 유지
-- (20260803000016 에서 company_id 조건 포함)

-- ---------------------------------------------------------------------------
-- 4) 적용 검증 (데이터 변경 없음)
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn_ok boolean;
  v_rpc_ok boolean;
  v_select_ok boolean;
begin
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_access_customer'
  ) into v_fn_ok;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'lookup_company_customer_phone_duplicates'
  ) into v_rpc_ok;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and policyname = 'customers_select_erp'
  ) into v_select_ok;

  if not v_fn_ok or not v_rpc_ok or not v_select_ok then
    raise exception
      'Bundle E migration verify failed (can_access_customer=%, phone_rpc=%, select_policy=%)',
      v_fn_ok, v_rpc_ok, v_select_ok;
  end if;
end;
$$;
