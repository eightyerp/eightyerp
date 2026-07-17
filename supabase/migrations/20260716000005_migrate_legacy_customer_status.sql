-- Eighty ERP CRM: use newly committed customer_status enum values
--
-- 전제:
--   반드시 먼저 20260716000004_customer_status_enum_values.sql 을
--   별도 실행으로 커밋한 뒤에 이 파일을 실행하세요.
--
-- 목적:
--   legacy 상태 '계약' → '계약완료' 로 안전하게 이관합니다.
--   (기존 고객 행을 삭제하지 않습니다.)
--
-- 실행 방법 (Supabase SQL Editor):
--   1) 000004 실행 완료 확인
--   2) 이 파일 실행
--   3) 필요 시 20260716000002_crm_permissions_status.sql 재실행
--      (enum ADD는 이미 반영됨, soft delete / profiles / RLS 등 나머지 적용)

-- Migrate legacy status label without deleting existing rows
update public.customers
set status = '계약완료'
where status::text = '계약';

notify pgrst, 'reload schema';
