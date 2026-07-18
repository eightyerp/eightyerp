-- =============================================================================
-- Eighty ERP — 견적 작성방식(간편/상세) + LX 자재 할인 + share_token
-- 파일: 20260803000004_quote_mode_and_lx_discount.sql
--
-- quotes:
--   - share_token uuid (고객 공유용, 기존 행 값 변경/초기화 없음)
--   - quote_mode text not null default 'simple'  (simple | detailed)
--   - lx_discount_rate numeric(5,2) not null default 0
--   - lx_discount_amount bigint not null default 0
-- quote_items:
--   - cost_type text not null default '기타'  (자재 | 시공 | 기타)
--   - is_lx_material boolean not null default false
--   - is_lx_material = true 이면 cost_type 은 반드시 '자재'
--
-- 안전: DROP TABLE / DELETE / TRUNCATE / 기존 행 초기화 없음
-- 재실행: add column if not exists + 제약조건 존재 여부 확인
-- =============================================================================

do $$
begin
  if to_regclass('public.quotes') is null then
    raise notice 'public.quotes 없음 — quote_mode/lx/share_token 컬럼 건너뜀';
  else
    -- 고객 공유 RPC보다 먼저 share_token 보장 (기존 값 UPDATE/초기화 금지)
    alter table public.quotes
      add column if not exists share_token uuid;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'quotes_share_token_uidx'
    ) then
      execute $idx$
        create unique index quotes_share_token_uidx
          on public.quotes (share_token)
          where share_token is not null
      $idx$;
    end if;

    alter table public.quotes
      add column if not exists quote_mode text not null default 'simple';

    alter table public.quotes
      add column if not exists lx_discount_rate numeric(5, 2) not null default 0;

    alter table public.quotes
      add column if not exists lx_discount_amount bigint not null default 0;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'quotes'
        and c.conname = 'quotes_quote_mode_check'
    ) then
      alter table public.quotes
        add constraint quotes_quote_mode_check
        check (quote_mode in ('simple', 'detailed'));
    end if;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'quotes'
        and c.conname = 'quotes_lx_discount_rate_check'
    ) then
      alter table public.quotes
        add constraint quotes_lx_discount_rate_check
        check (lx_discount_rate >= 0 and lx_discount_rate <= 100);
    end if;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'quotes'
        and c.conname = 'quotes_lx_discount_amount_check'
    ) then
      alter table public.quotes
        add constraint quotes_lx_discount_amount_check
        check (lx_discount_amount >= 0);
    end if;
  end if;

  if to_regclass('public.quote_items') is null then
    raise notice 'public.quote_items 없음 — cost_type/is_lx_material 컬럼 건너뜀';
  else
    alter table public.quote_items
      add column if not exists cost_type text not null default '기타';

    alter table public.quote_items
      add column if not exists is_lx_material boolean not null default false;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'quote_items'
        and c.conname = 'quote_items_cost_type_check'
    ) then
      alter table public.quote_items
        add constraint quote_items_cost_type_check
        check (cost_type in ('자재', '시공', '기타'));
    end if;

    -- LX 자재 체크는 구분이 자재인 경우에만 허용
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'quote_items'
        and c.conname = 'quote_items_lx_requires_material_check'
    ) then
      alter table public.quote_items
        add constraint quote_items_lx_requires_material_check
        check (not is_lx_material or cost_type = '자재');
    end if;
  end if;
end $$;

-- 고객 공유 RPC: share_token 컬럼 생성 이후 정의 (재실행 가능)
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
