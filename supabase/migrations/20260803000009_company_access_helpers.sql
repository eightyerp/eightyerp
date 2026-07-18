-- =============================================================================
-- Eighty ERP — 회사 기능 3단계: 접근 helper 함수
-- 파일: 20260803000009_company_access_helpers.sql
--
-- 범위:
--   - public.current_company_id()
--   - public.is_company_member(uuid)
--   - public.current_company_role()
--   - public.can_approve_company_members(uuid)
--   - public.set_active_company(uuid)
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 데이터 및 RLS 변경 없음
--   - helper 함수만 생성
--   - membership 검증 + 승인된 active profile일 때만 현재 회사 반환/전환
--
-- 재실행: create or replace function / revoke·grant 재적용
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) current_company_id()
-- ---------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.active_company_id
  from public.profiles p
  join public.company_memberships m
    on m.company_id = p.active_company_id
   and m.user_id = p.id
  join public.companies c
    on c.id = p.active_company_id
  where p.id = auth.uid()
    and auth.uid() is not null
    and p.active_company_id is not null
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved'
    and m.status = 'active'
    and c.status = 'active'
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2) is_company_member(p_company_id)
-- ---------------------------------------------------------------------------
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_company_id is not null
    and exists (
      select 1
      from public.company_memberships m
      join public.companies c on c.id = m.company_id
      join public.profiles p on p.id = m.user_id
      where m.user_id = auth.uid()
        and m.company_id = p_company_id
        and m.status = 'active'
        and c.status = 'active'
        and p.id = auth.uid()
        and p.is_active = true
        and p.is_approved = true
        and p.approval_status = 'approved'
    );
$$;

-- ---------------------------------------------------------------------------
-- 3) current_company_role()
-- ---------------------------------------------------------------------------
create or replace function public.current_company_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.company_memberships m
  where m.user_id = auth.uid()
    and auth.uid() is not null
    and m.company_id = public.current_company_id()
    and m.status = 'active'
    and m.role in ('owner', 'director', 'admin', 'employee')
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4) can_approve_company_members(p_company_id)
-- ---------------------------------------------------------------------------
create or replace function public.can_approve_company_members(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_company_id is not null
    and exists (
      select 1
      from public.company_memberships m
      join public.companies c on c.id = m.company_id
      join public.profiles p on p.id = m.user_id
      where m.user_id = auth.uid()
        and m.company_id = p_company_id
        and m.status = 'active'
        and m.role in ('owner', 'director')
        and c.status = 'active'
        and p.id = auth.uid()
        and p.is_active = true
        and p.is_approved = true
        and p.approval_status = 'approved'
    );
$$;

-- ---------------------------------------------------------------------------
-- 5) set_active_company(p_company_id)
-- ---------------------------------------------------------------------------
create or replace function public.set_active_company(p_company_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or p_company_id is null then
    return false;
  end if;

  update public.profiles p
  set
    active_company_id = p_company_id,
    updated_at = now()
  where p.id = auth.uid()
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved'
    and exists (
      select 1
      from public.company_memberships m
      join public.companies c on c.id = m.company_id
      where m.user_id = auth.uid()
        and m.company_id = p_company_id
        and m.status = 'active'
        and c.id = p_company_id
        and c.status = 'active'
    );

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한: public/anon revoke, authenticated만 execute
-- ---------------------------------------------------------------------------
revoke all on function public.current_company_id() from public;
revoke all on function public.current_company_id() from anon;
grant execute on function public.current_company_id() to authenticated;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_member(uuid) from anon;
grant execute on function public.is_company_member(uuid) to authenticated;

revoke all on function public.current_company_role() from public;
revoke all on function public.current_company_role() from anon;
grant execute on function public.current_company_role() to authenticated;

revoke all on function public.can_approve_company_members(uuid) from public;
revoke all on function public.can_approve_company_members(uuid) from anon;
grant execute on function public.can_approve_company_members(uuid) to authenticated;

revoke all on function public.set_active_company(uuid) from public;
revoke all on function public.set_active_company(uuid) from anon;
grant execute on function public.set_active_company(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
