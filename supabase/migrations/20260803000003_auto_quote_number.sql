-- =============================================================================
-- Eighty ERP — quotes.quote_number 자동 생성
-- 파일: 20260803000003_auto_quote_number.sql
--
-- 규칙:
--   - INSERT 시 quote_number 가 NULL/공백이면 YYYYMMDD-001 형식으로 자동 부여
--   - 날짜(Asia/Seoul)가 바뀌면 001부터 다시 시작
--   - 동시 INSERT 시 transaction advisory lock 으로 중복 방지
--   - 기존 quote_number 가 있으면 변경하지 않음
--   - UPDATE 에서는 자동 생성하지 않음
--
-- 안전: DROP TABLE / DELETE / TRUNCATE / 기존 데이터 초기화 없음
-- 재실행: CREATE OR REPLACE / IF NOT EXISTS / DROP TRIGGER IF EXISTS
-- =============================================================================

create or replace function public.quotes_assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  day_key text;
  lock_key bigint;
  next_seq integer;
begin
  -- 이미 값이 있으면 유지
  if new.quote_number is not null and btrim(new.quote_number) <> '' then
    return new;
  end if;

  day_key := to_char((current_timestamp at time zone 'Asia/Seoul'), 'YYYYMMDD');

  -- 날짜별 직잭션 advisory lock (동시 등록 시 순번 중복 방지)
  lock_key := hashtextextended('eighty_erp_quote_number_' || day_key, 0);
  perform pg_advisory_xact_lock(lock_key);

  select coalesce(max(
    case
      when q.quote_number ~ ('^' || day_key || '-[0-9]{3,}$')
        then substring(q.quote_number from length(day_key) + 2)::integer
      else 0
    end
  ), 0) + 1
  into next_seq
  from public.quotes q
  where q.quote_number like day_key || '-%';

  new.quote_number := day_key || '-' || lpad(next_seq::text, 3, '0');
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.quotes') is null then
    raise notice 'public.quotes 없음 — quote_number trigger/index 건너뜀';
    return;
  end if;

  drop trigger if exists trg_quotes_assign_quote_number on public.quotes;

  create trigger trg_quotes_assign_quote_number
    before insert on public.quotes
    for each row
    execute function public.quotes_assign_quote_number();

  -- 중복이 없을 때만 unique index 생성 (재실행·운영 안전)
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'quotes_quote_number_uidx'
  ) then
    if exists (
      select 1
      from public.quotes
      where quote_number is not null
        and btrim(quote_number) <> ''
      group by quote_number
      having count(*) > 1
    ) then
      raise notice 'quotes.quote_number 중복 값이 있어 unique index 생성을 건너뜁니다.';
    else
      execute $idx$
        create unique index quotes_quote_number_uidx
          on public.quotes (quote_number)
          where quote_number is not null and btrim(quote_number) <> ''
      $idx$;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
