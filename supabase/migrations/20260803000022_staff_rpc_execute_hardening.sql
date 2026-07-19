-- =============================================================================
-- Eighty ERP — 직원 관리 RPC 실행 권한 보안 강화
-- 파일: 20260803000022_staff_rpc_execute_hardening.sql
--
-- 범위:
--   - 사용 중인 승인/거절/비활성화 함수의 익명 실행 권한 제거
--   - 미사용 위험 함수 link_profile_to_employee는 service_role 전용
--
-- 안전:
--   - 함수 본문 변경 없음
--   - 데이터 변경·삭제 없음
--   - 현재 관리자 승인 화면의 authenticated 실행 권한 유지
--   - 함수 삭제 없음
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) 미사용 위험 함수: 외부 사용자 실행 차단
-- ---------------------------------------------------------------------------
revoke all
on function public.link_profile_to_employee(
  uuid,
  text,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.link_profile_to_employee(
  uuid,
  text,
  text,
  jsonb
)
to service_role;

-- ---------------------------------------------------------------------------
-- 2) 사용 중인 직원 관리 RPC: 익명 차단, 로그인 사용자 실행 유지
--    실제 관리자 여부는 각 함수 내부 is_admin()이 다시 검사
-- ---------------------------------------------------------------------------
revoke all
on function public.approve_staff_signup(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid
)
from public, anon;

grant execute
on function public.approve_staff_signup(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid
)
to authenticated, service_role;

revoke all
on function public.reject_staff_signup(
  uuid,
  text
)
from public, anon;

grant execute
on function public.reject_staff_signup(
  uuid,
  text
)
to authenticated, service_role;

revoke all
on function public.deactivate_staff_user(
  uuid
)
from public, anon;

grant execute
on function public.deactivate_staff_user(
  uuid
)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) 권한 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad_permission integer := 0;
begin
  -- link_profile_to_employee:
  -- anon/authenticated 불가, service_role만 허용
  if has_function_privilege(
    'anon',
    'public.link_profile_to_employee(uuid,text,text,jsonb)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.link_profile_to_employee(uuid,text,text,jsonb)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.link_profile_to_employee(uuid,text,text,jsonb)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  -- 사용 중인 세 함수:
  -- anon 불가, authenticated/service_role 허용
  if has_function_privilege(
    'anon',
    'public.approve_staff_signup(uuid,text,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.approve_staff_signup(uuid,text,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.approve_staff_signup(uuid,text,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if has_function_privilege(
    'anon',
    'public.reject_staff_signup(uuid,text)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.reject_staff_signup(uuid,text)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.reject_staff_signup(uuid,text)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if has_function_privilege(
    'anon',
    'public.deactivate_staff_user(uuid)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.deactivate_staff_user(uuid)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.deactivate_staff_user(uuid)',
    'EXECUTE'
  ) then
    v_bad_permission := v_bad_permission + 1;
  end if;

  if v_bad_permission <> 0 then
    raise exception
      '직원 관리 RPC 권한 적용 실패: 잘못된 권한 수=%',
      v_bad_permission;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;