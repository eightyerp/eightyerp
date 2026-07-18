-- =============================================================================
-- Eighty ERP — consultation_type enum 확장 (등록 폼 옵션과 동기화)
-- 파일: 20260730000001_consultation_type_enum_extend.sql
--
-- 증상: 고객등록 시
--   invalid input value for enum consultation_type: "종합인테리어" 등
-- 원인: 폼은 확장 상담유형을 쓰는데 DB enum에 값이 없음
--
-- 안전: 기존 데이터/컬럼 DROP 없음. ADD VALUE IF NOT EXISTS 만 수행.
-- 참고: 20260716000006 과 동일 목적. 미적용 환경용 재실행 가능 파일.
-- =============================================================================

alter type public.consultation_type add value if not exists '종합인테리어';
alter type public.consultation_type add value if not exists '부분인테리어';
alter type public.consultation_type add value if not exists '주방';
alter type public.consultation_type add value if not exists '도배';
alter type public.consultation_type add value if not exists '바닥재';
alter type public.consultation_type add value if not exists '도어/중문';
