-- Eighty ERP CRM: registration options for new customer form
-- Non-destructive. Do not drop existing columns or data.
--
-- PostgreSQL: ALTER TYPE ... ADD VALUE 후 같은 트랜잭션에서
-- 새 enum 값을 쓰면 실패할 수 있으므로, 이 파일은 enum 추가 + seed만 수행합니다.

-- ---------------------------------------------------------------------------
-- 1) consultation_type enum 확장
-- ---------------------------------------------------------------------------
alter type public.consultation_type add value if not exists '종합인테리어';
alter type public.consultation_type add value if not exists '부분인테리어';
alter type public.consultation_type add value if not exists '주방';
alter type public.consultation_type add value if not exists '도배';
alter type public.consultation_type add value if not exists '바닥재';
alter type public.consultation_type add value if not exists '도어/중문';

-- ---------------------------------------------------------------------------
-- 2) 상담 흐름용 컬럼 (없으면 추가, 기존 데이터 유지)
--    신규등록 폼에서 제거한 additional_phone / apartment_name / unit_number 는 추가하지 않음
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists last_contact_at timestamptz,
  add column if not exists consultation_result text;

create index if not exists customers_last_contact_at_idx
  on public.customers (last_contact_at desc);

-- ---------------------------------------------------------------------------
-- 3) 유입경로 seed (에잇티 업무 기준)
-- ---------------------------------------------------------------------------
insert into public.lead_sources (name, sort_order) values
  ('홈페이지', 1),
  ('네이버 검색광고', 2),
  ('네이버 블로그', 3),
  ('인스타그램', 4),
  ('카카오톡', 5),
  ('문자문의', 6),
  ('LX하우시스 본사', 7),
  ('소개', 8),
  ('공동구매', 9),
  ('단지행사', 10),
  ('재계약', 11),
  ('기타', 12)
on conflict (name) do nothing;

-- 기존 유사 명칭이 있어도 신규 항목은 위 insert로 보완됨
-- (홈페이지 문의 → 홈페이지 등 이름 변경은 데이터 보존을 위해 강제하지 않음)

notify pgrst, 'reload schema';
