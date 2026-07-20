-- =============================================================================
-- Eighty ERP — 견적 항목별 LX 할인 컬럼 + 공유 RPC 필드 보강
-- 파일: 20260803000027_quote_item_lx_discount.sql
--
-- 안전:
--   - DROP TABLE / DELETE / TRUNCATE / 기존 행 UPDATE 없음
--   - ADD COLUMN IF NOT EXISTS 만 사용 (nullable)
--   - 기존 quotes.lx_discount_rate / lx_discount_amount 유지
--   - 기존 quote_items 행은 null 유지 → 견적 단위 할인 계산 호환
--
-- 적용 순서: 본 파일(27) → 20260803000028_company_quote_brand.sql
--   28은 동일 get_quote_share_by_token 을 브랜드 필드로 교체한다.
--   운영에서 28 적용 후 27만 재적용하면 브랜드 필드가 빠지므로 28도 다시 적용한다.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) quote_items: 항목별 LX 할인 (nullable)
--    lx_discount_type: null=기존 견적단위 할인율 적용, none|rate|fixed
--    lx_discount_value: rate(%) 또는 정액(원)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quote_items') is null then
    raise notice 'public.quote_items 없음 — 항목별 LX 할인 컬럼 건너뜀';
    return;
  end if;

  alter table public.quote_items
    add column if not exists lx_discount_type text;

  alter table public.quote_items
    add column if not exists lx_discount_value numeric(12, 2);

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_lx_discount_type_check'
  ) then
    alter table public.quote_items
      add constraint quote_items_lx_discount_type_check
      check (
        lx_discount_type is null
        or lx_discount_type in ('none', 'rate', 'fixed')
      );
  end if;

  -- value: 항상 null 또는 >= 0.
  -- type = 'rate' 일 때만 추가로 <= 100 (정액 fixed 는 100원 초과 허용).
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_lx_discount_value_check'
  ) then
    alter table public.quote_items
      add constraint quote_items_lx_discount_value_check
      check (
        lx_discount_value is null
        or (
          lx_discount_value >= 0
          and (
            lx_discount_type is distinct from 'rate'
            or lx_discount_value <= 100
          )
        )
      );
  end if;

  -- COMMENT: 테이블·컬럼이 있을 때만 (부분 적용·재실행 안전)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quote_items'
      and column_name = 'lx_discount_type'
  ) then
    comment on column public.quote_items.lx_discount_type is
      '항목별 LX 할인 방식. null이면 견적 단위 lx_discount_rate 적용(기존 호환). none|rate|fixed';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quote_items'
      and column_name = 'lx_discount_value'
  ) then
    comment on column public.quote_items.lx_discount_value is
      '항목별 LX 할인값. rate면 0~100(%), fixed면 정액(원). null 허용';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) 고객 공유 RPC: 항목별 할인 필드 포함 (재실행 가능, 데이터 변경 없음)
-- ---------------------------------------------------------------------------
create or replace function public.get_quote_share_by_token(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_token is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', q.id,
    'title', q.title,
    'quote_type', q.quote_type,
    'quote_mode', coalesce(q.quote_mode, 'simple'),
    'quote_number', q.quote_number,
    'version_number', q.version_number,
    'status', q.status,
    'total_amount', q.total_amount,
    'discount_amount', q.discount_amount,
    'lx_discount_rate', coalesce(q.lx_discount_rate, 0),
    'lx_discount_amount', coalesce(q.lx_discount_amount, 0),
    'final_amount', q.final_amount,
    'valid_until', q.valid_until,
    'issued_at', q.issued_at,
    'customer_message', q.customer_message,
    'is_lx_material', q.is_lx_material,
    'customer_name', c.name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'trade_name', i.trade_name,
          'item_name', i.item_name,
          'description', i.description,
          'quantity', i.quantity,
          'unit', i.unit,
          'amount', i.amount,
          'cost_type', coalesce(i.cost_type, '기타'),
          'is_lx_material', coalesce(i.is_lx_material, false),
          'lx_discount_base_amount', coalesce(i.lx_discount_base_amount, 0),
          'lx_discount_type', i.lx_discount_type,
          'lx_discount_value', i.lx_discount_value,
          'sort_order', i.sort_order
        )
        order by i.sort_order
      )
      from public.quote_items i
      where i.quote_id = q.id
        and i.deleted_at is null
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'file_type', f.file_type,
          'file_name', f.file_name,
          'file_path', f.file_path,
          'is_primary', f.is_primary
        )
        order by f.created_at
      )
      from public.quote_files f
      where f.quote_id = q.id
        and f.deleted_at is null
    ), '[]'::jsonb)
  )
  into result
  from public.quotes q
  join public.customers c on c.id = q.customer_id
  where q.share_token = p_token
    and q.deleted_at is null
    and c.deleted_at is null;

  return result;
end;
$$;

grant execute on function public.get_quote_share_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
