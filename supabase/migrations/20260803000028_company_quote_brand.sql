-- =============================================================================
-- Eighty ERP — 회사별 견적 표지 브랜드 필드
-- 파일: 20260803000028_company_quote_brand.sql
--
-- 안전:
--   - DROP / DELETE / TRUNCATE / 기존 행 UPDATE 없음
--   - ADD COLUMN IF NOT EXISTS (nullable)
--   - 공유 RPC만 재정의 (데이터 변경 없음)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.companies') is null then
    raise notice 'public.companies 없음 — 브랜드 컬럼 건너뜀';
    return;
  end if;

  alter table public.companies
    add column if not exists brand_preset text;

  alter table public.companies
    add column if not exists brand_slogan text;

  alter table public.companies
    add column if not exists brand_intro text;

  alter table public.companies
    add column if not exists brand_advantages jsonb;

  alter table public.companies
    add column if not exists brand_phone text;

  alter table public.companies
    add column if not exists brand_trust_line text;

  alter table public.companies
    add column if not exists brand_logo_path text;

  alter table public.companies
    add column if not exists brand_cert_image_paths jsonb;

  alter table public.companies
    add column if not exists brand_site_image_paths jsonb;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'companies'
      and c.conname = 'companies_brand_preset_check'
  ) then
    alter table public.companies
      add constraint companies_brand_preset_check
      check (
        brand_preset is null
        or brand_preset in ('eighty', 'custom', 'simple')
      );
  end if;

  -- COMMENT: 테이블·컬럼이 있을 때만 (부분 적용·재실행 안전)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'brand_preset'
  ) then
    comment on column public.companies.brand_preset is
      '견적 표지 브랜드. eighty=에잇티 기본 문구, custom=직접 입력, simple=회사명 중심 단순 표지';
  end if;
end;
$$;

-- 공유 RPC: 회사 브랜드 최소 정보 포함 (재실행 가능)
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
    'company_name', co.name,
    'brand_preset', co.brand_preset,
    'brand_slogan', co.brand_slogan,
    'brand_intro', co.brand_intro,
    'brand_advantages', co.brand_advantages,
    'brand_phone', co.brand_phone,
    'brand_trust_line', co.brand_trust_line,
    'brand_logo_path', co.brand_logo_path,
    'brand_cert_image_paths', co.brand_cert_image_paths,
    'brand_site_image_paths', co.brand_site_image_paths,
    'company_business_number', co.business_number_normalized,
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
  left join public.companies co on co.id = q.company_id
  where q.share_token = p_token
    and q.deleted_at is null
    and c.deleted_at is null;

  return result;
end;
$$;

grant execute on function public.get_quote_share_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
