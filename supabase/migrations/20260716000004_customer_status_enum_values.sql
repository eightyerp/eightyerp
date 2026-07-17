-- Eighty ERP CRM: customer_status enum values ONLY
--
-- PostgreSQL 제약:
--   ALTER TYPE ... ADD VALUE 로 추가한 enum 값은
--   해당 트랜잭션이 커밋된 뒤에만 사용할 수 있습니다.
--
-- 실행 방법 (Supabase SQL Editor):
--   1) 이 파일만 단독으로 실행하고 성공(커밋)을 확인합니다.
--   2) 그 다음 20260716000005_migrate_legacy_customer_status.sql 을 실행합니다.
--   3) 이어서 20260716000002_crm_permissions_status.sql 을 다시 실행해도 됩니다.
--      (이미 추가된 enum은 IF NOT EXISTS 로 건너뛰고, 이후 DDL이 이어집니다.)
--
-- 기존 migration은 수정하지 않습니다. 멱등(idempotent)입니다.

alter type public.customer_status add value if not exists '1차 연락완료';
alter type public.customer_status add value if not exists '실측예약';
alter type public.customer_status add value if not exists '견적작성중';
alter type public.customer_status add value if not exists '계약협의';
alter type public.customer_status add value if not exists '계약완료';
alter type public.customer_status add value if not exists '시공예정';
alter type public.customer_status add value if not exists '시공중';
alter type public.customer_status add value if not exists '연락두절';
alter type public.customer_status add value if not exists '취소';
