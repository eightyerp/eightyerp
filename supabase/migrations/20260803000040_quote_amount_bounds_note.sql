-- =============================================================================
-- Eighty ERP — 견적 금액 상한 방어 (앱 계층 우선, DB는 문서화만)
-- 파일: 20260803000040_quote_amount_bounds_note.sql
--
-- 배경:
--   견적 금액은 원(won) 정수로 저장한다. 코드 경로에 만원×10000 변환은 없다.
--   이상 견적(수백억~수천억)은 원 단위 오입력·헤더/품목 비동기화로 발생했다.
--
-- 재발 방지:
--   - 앱: lib/crm/quote-constants.ts assertQuoteMoneyBounds / collectQuoteMoneyIssues
--     · 항목 금액·단가 상한 100억 원
--     · 견적 합계 상한 1,000억 원
--     · 저장 헤더는 computeQuoteAmounts 단일 결과만 사용
--   - UI: 원 단위 안내, 고액 경고
--
-- 이 파일:
--   - 기존 행 UPDATE/DELETE/백필 없음
--   - CHECK 제약 추가 없음 (기존 이상 금액 행이 있으면 ALTER가 실패함)
--   - Migration 38·39 미수정
--   - 적용해도 스키마 변경 없음 (검증용 no-op)
--
-- 추후(선택): create/update_quote_with_items RPC에 동일 상한을 넣을 때는
--   별도 migration으로 함수만 OR REPLACE 할 것.
-- =============================================================================

do $$
begin
  -- no-op verify: quotes / quote_items 존재만 확인
  if to_regclass('public.quotes') is null
     or to_regclass('public.quote_items') is null then
    raise exception 'Migration 40 requires quotes and quote_items';
  end if;

  raise notice
    'Migration 40: quote amount bounds enforced in app layer (won). No schema change.';
end;
$$;
