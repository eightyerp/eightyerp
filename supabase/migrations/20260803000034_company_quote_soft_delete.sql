-- =============================================================================
-- Eighty ERP — 회사 견적 soft delete RPC
-- 파일: 20260803000034_company_quote_soft_delete.sql
--
-- 목적:
--   - 같은 active company의 활성 멤버(owner/director/admin/employee)가
--     해당 회사 견적만 soft delete
--   - quotes UPDATE RLS를 완화하지 않고 SECURITY DEFINER RPC로만 처리
--   - quote_items / hard delete / 타사 데이터 노출 금지
--
-- 안전:
--   - DROP TABLE / DELETE FROM / TRUNCATE / 기존 행 backfill 없음
--   - quotes RLS 정책 ALTER 없음
--   - migrations 27~33 미수정
--   - 함수 CREATE OR REPLACE + GRANT/REVOKE 만 수행
--
-- 적용 순서: migration 33 이후 본 파일(34)
-- 재실행: create or replace / revoke·grant 재적용 가능
-- 이번 단계에서 로컬 파일만 추가. 운영 적용은 별도 승인 후.
-- =============================================================================

begin;

create or replace function public.soft_delete_quote(
  p_quote_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_active_company_id uuid;
  v_quote_company_id uuid;
  v_deleted_at timestamptz;
  v_reason text;
  v_now timestamptz := now();
begin
  -- 1) 인증
  if v_uid is null then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  if p_quote_id is null then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  -- 2) 삭제 사유 (trim 필수, 길이 제한)
  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception '삭제 사유를 입력해 주세요.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception '삭제 사유는 500자 이하로 입력해 주세요.';
  end if;

  -- 3) 활성 회사 (멤버십 포함 current_company_id)
  v_active_company_id := public.current_company_id();
  if v_active_company_id is null then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  -- 4) 대상 행 잠금 (동시 요청 안전). RLS 우회는 DEFINER 범위이므로
  --    아래 company/member 검사를 최종 권한 기준으로 강제한다.
  select q.company_id, q.deleted_at
    into v_quote_company_id, v_deleted_at
  from public.quotes q
  where q.id = p_quote_id
  for update;

  -- 존재하지 않음 / 타사 / 비회원 → 동일 안전 오류 (존재·타사 정보 미노출)
  if not found then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  if v_quote_company_id is null
     or v_quote_company_id is distinct from v_active_company_id then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  if not public.is_company_member(v_quote_company_id) then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  -- owner/director/admin/employee 만 (current_company_role 화이트리스트)
  if public.current_company_role() is null then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  -- 5) 이미 soft-deleted → 동일 성공(idempotent). 필드 재변경 없음.
  if v_deleted_at is not null then
    return jsonb_build_object(
      'quote_id', p_quote_id,
      'deleted_at', v_deleted_at
    );
  end if;

  -- 6) soft delete only (deleted_at / deleted_by / delete_reason)
  --    updated_at 은 touch_updated_at_column 트리거가 갱신할 수 있음.
  --    quote_items 및 기타 컬럼은 변경하지 않음. SQL DELETE 미사용.
  update public.quotes q
  set
    deleted_at = v_now,
    deleted_by = v_uid,
    delete_reason = v_reason
  where q.id = p_quote_id
    and q.company_id = v_active_company_id
    and q.deleted_at is null
  returning q.deleted_at into v_deleted_at;

  if not found or v_deleted_at is null then
    raise exception '견적을 삭제할 수 없습니다.';
  end if;

  -- 삭제 후 SELECT 재조회 없음. slim 결과만 반환.
  return jsonb_build_object(
    'quote_id', p_quote_id,
    'deleted_at', v_deleted_at
  );
end;
$$;

comment on function public.soft_delete_quote(uuid, text) is
  '활성 회사 멤버(owner/director/admin/employee) 견적 soft delete. '
  'deleted_at/deleted_by/delete_reason만 변경. quote_items 미변경. '
  '타사·비회원·anon 거부. 이미 삭제된 견적은 idempotent 성공.';

revoke all on function public.soft_delete_quote(uuid, text) from public;
revoke all on function public.soft_delete_quote(uuid, text) from anon;
revoke all on function public.soft_delete_quote(uuid, text) from authenticated;
grant execute on function public.soft_delete_quote(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
