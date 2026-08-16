-- =============================================================================
-- Eighty ERP — Security Advisor P0 / authenticated helper ACL + search_path
--
-- 목적:
--   1) ERP/RLS 내부 helper 중 익명 사용자가 직접 /rpc 로 호출할 이유가 없는
--      SECURITY DEFINER 함수의 anon/PUBLIC EXECUTE를 제거한다.
--   2) Advisor가 지적한 단순 helper/trigger 함수의 mutable search_path를 고정한다.
--
-- 의도적으로 이번 migration에서 제외:
--   - get_company_employee_invitation(text): 회원가입 전 공개 초대 token 검증
--   - get_quote_share_by_token(uuid): 공개 견적 공유 token 검증
--   - employee_card_path_is_shared(text): 공개 견적의 명함 Storage RLS
--   - handle_new_user / quotes_assign_quote_number / quotes_assignee_snapshot_trigger /
--     seed_customer_checklists: trigger-only SECURITY DEFINER는 별도 Gate에서 검증 후 축소
--
-- 데이터 변경 없음 / RLS 정책 의미 변경 없음.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. mutable search_path 경고 해소
-- 함수 본문은 변경하지 않고 함수 설정만 고정한다.
-- pg_catalog를 먼저 두고, 기존 함수들이 public 객체를 참조할 수 있도록 public을 유지한다.
-- -----------------------------------------------------------------------------
alter function public.set_updated_at()
  set search_path = pg_catalog, public;

alter function public.touch_updated_at_column()
  set search_path = pg_catalog, public;

alter function public.normalize_employee_phone(text)
  set search_path = pg_catalog, public;

alter function public.prevent_employee_delete()
  set search_path = pg_catalog, public;

-- normalize_employee_phone은 직원가입/중복방지 내부에서 사용한다.
-- authenticated/service_role 호출은 유지하고 익명/PUBLIC 직접 RPC 실행만 차단한다.
revoke execute on function public.normalize_employee_phone(text) from public, anon;
grant execute on function public.normalize_employee_phone(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. ERP authenticated 전용 SECURITY DEFINER helper
-- 아래 함수들은 현재 authenticated RLS/DAL 또는 로그인된 ERP 업무 RPC에서 사용된다.
-- 공개 token 진입점이 아니므로 anon/PUBLIC 직접 Data API 실행권한은 필요하지 않다.
-- -----------------------------------------------------------------------------
revoke execute on function public.can_access_customer(uuid) from public, anon;
grant execute on function public.can_access_customer(uuid) to authenticated, service_role;

revoke execute on function public.can_access_project(uuid) from public, anon;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;

revoke execute on function public.current_employee_id() from public, anon;
grant execute on function public.current_employee_id() to authenticated, service_role;

revoke execute on function public.current_employee_team_id() from public, anon;
grant execute on function public.current_employee_team_id() to authenticated, service_role;

revoke execute on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated, service_role;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

revoke execute on function public.is_erp_user() from public, anon;
grant execute on function public.is_erp_user() to authenticated, service_role;

revoke execute on function public.is_manager_or_above() from public, anon;
grant execute on function public.is_manager_or_above() to authenticated, service_role;

revoke execute on function public.lookup_company_customer_phone_duplicates(text, uuid) from public, anon;
grant execute on function public.lookup_company_customer_phone_duplicates(text, uuid) to authenticated, service_role;

-- quote-files Storage 정책은 authenticated 전용이다. 공개 견적 token 자체는 별도 RPC로 읽는다.
revoke execute on function public.quote_storage_path_quote_id(text) from public, anon;
grant execute on function public.quote_storage_path_quote_id(text) to authenticated, service_role;

-- 계약 전환은 로그인된 ERP 사용자 전용 업무 RPC다.
-- PR #69의 후속 CREATE OR REPLACE도 ACL을 다시 최소화하도록 설계되어 있어 순서 충돌이 없다.
revoke execute on function public.transition_quote_to_contract(
  uuid, text, uuid, text, text, uuid, date, text
) from public, anon;
grant execute on function public.transition_quote_to_contract(
  uuid, text, uuid, text, text, uuid, date, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
