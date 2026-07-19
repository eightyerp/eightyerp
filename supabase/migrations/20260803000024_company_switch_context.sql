-- =============================================================================
-- Eighty ERP — 회사 기능 6A: 회사 전환 조회 기반
-- 파일: 20260803000024_company_switch_context.sql
--
-- 범위:
--   - 로그인 사용자가 전환할 수 있는 활성 회사 목록 조회 함수
--   - 현재 선택된 회사 표시
--   - 멤버십 역할 표시
--   - 회사 목록 조회용 부분 복합 인덱스 추가
--
-- 속도 최적화:
--   - active 멤버십만 포함하는 작은 부분 인덱스
--   - user_id가 선두인 복합 인덱스
--   - 회사 목록을 한 번의 RPC 호출로 조회
--
-- 안전:
--   - 기존 데이터 변경 없음
--   - DELETE / TRUNCATE / DROP TABLE 없음
--   - 기존 RLS 정책 변경 없음
--   - 승인·활성 프로필만 조회 가능
--   - active 멤버십과 active 회사만 반환
--   - 본인의 회사 목록만 반환
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 회사 전환 목록 조회 최적화 인덱스
--    기존 인덱스는 삭제하거나 변경하지 않음
-- ---------------------------------------------------------------------------
create index if not exists company_memberships_active_user_company_idx
  on public.company_memberships (user_id, company_id)
  include (role)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 2) 로그인 사용자가 전환 가능한 회사 목록
-- ---------------------------------------------------------------------------
create or replace function public.get_my_company_options()
returns table (
  company_id uuid,
  company_name text,
  business_number_display text,
  membership_role text,
  is_current boolean
)
language sql
stable
security definer
set search_path = public
rows 20
as $$
  select
    c.id as company_id,
    c.name as company_name,
    c.business_number_display,
    m.role as membership_role,
    coalesce(p.active_company_id = c.id, false) as is_current
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id
   and m.status = 'active'
  join public.companies c
    on c.id = m.company_id
   and c.status = 'active'
  where auth.uid() is not null
    and p.id = auth.uid()
    and p.is_active = true
    and p.is_approved = true
    and p.approval_status = 'approved'
  order by
    case when p.active_company_id = c.id then 0 else 1 end,
    c.name asc,
    c.id asc;
$$;

comment on function public.get_my_company_options() is
  '현재 로그인 사용자가 전환할 수 있는 활성 회사 목록과 현재 회사를 반환';

-- ---------------------------------------------------------------------------
-- 3) 실행 권한
-- ---------------------------------------------------------------------------
revoke all on function public.get_my_company_options() from public;
revoke all on function public.get_my_company_options() from anon;
revoke all on function public.get_my_company_options() from authenticated;
revoke all on function public.get_my_company_options() from service_role;

grant execute on function public.get_my_company_options() to authenticated;
grant execute on function public.get_my_company_options() to service_role;

notify pgrst, 'reload schema';

commit;