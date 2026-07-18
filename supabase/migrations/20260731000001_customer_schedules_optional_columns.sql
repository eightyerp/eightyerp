-- =============================================================================
-- Eighty ERP — customer_schedules 선택 컬럼 보강
-- 파일: 20260731000001_customer_schedules_optional_columns.sql
--
-- 증상: 일정 등록 시
--   Could not find the 'customer_reaction' column of 'customer_schedules'
-- 원인: 앱은 customer_reaction / next_action 을 쓰는데 DB에 컬럼 없음
--
-- 안전: ADD COLUMN IF NOT EXISTS 만. DROP/DELETE/TRUNCATE 없음.
-- =============================================================================

alter table public.customer_schedules
  add column if not exists customer_reaction text;

alter table public.customer_schedules
  add column if not exists next_action text;

notify pgrst, 'reload schema';
