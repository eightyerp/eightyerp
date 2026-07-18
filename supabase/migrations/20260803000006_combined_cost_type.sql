-- =============================================================================
-- Eighty ERP — quote_items 시공+자재 구분 + LX 할인 대상 자재금액
-- 파일: 20260803000006_combined_cost_type.sql
--
-- quote_items:
--   - lx_discount_base_amount bigint not null default 0
--   - cost_type 허용: 자재, 시공, 시공+자재, 기타
--   - is_lx_material=true 허용: 자재, 시공+자재
--   - lx_discount_base_amount >= 0 AND <= amount
--
-- 안전: DROP TABLE / DELETE / TRUNCATE / 기존 행 UPDATE·초기화 없음
-- 허용: DROP CONSTRAINT (재정의)
-- 재실행 가능
-- =============================================================================

do $$
begin
  if to_regclass('public.quote_items') is null then
    raise notice 'public.quote_items 없음 — combined cost_type 건너뜀';
    return;
  end if;

  alter table public.quote_items
    add column if not exists lx_discount_base_amount bigint not null default 0;

  -- cost_type 허용값 재정의 (시공+자재 추가)
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_cost_type_check'
  ) then
    alter table public.quote_items
      drop constraint quote_items_cost_type_check;
  end if;

  alter table public.quote_items
    add constraint quote_items_cost_type_check
    check (cost_type in ('자재', '시공', '시공+자재', '기타'));

  -- LX 체크 허용 구분 재정의
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_lx_requires_material_check'
  ) then
    alter table public.quote_items
      drop constraint quote_items_lx_requires_material_check;
  end if;

  alter table public.quote_items
    add constraint quote_items_lx_requires_material_check
    check (not is_lx_material or cost_type in ('자재', '시공+자재'));

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_lx_discount_base_nonneg_check'
  ) then
    alter table public.quote_items
      add constraint quote_items_lx_discount_base_nonneg_check
      check (lx_discount_base_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quote_items'
      and c.conname = 'quote_items_lx_discount_base_le_amount_check'
  ) then
    alter table public.quote_items
      add constraint quote_items_lx_discount_base_le_amount_check
      check (lx_discount_base_amount <= amount);
  end if;
end $$;

-- 고객 공유 RPC: lx_discount_base_amount 포함 (재실행 가능)
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
