-- =============================================================================
-- Eighty ERP — quotes.special_discount_memo (특별할인 메모)
-- 파일: 20260803000042_quote_special_discount_memo.sql
--
-- 안전:
--   - ADD COLUMN IF NOT EXISTS (nullable text)
--   - 기존 행 UPDATE/DELETE/초기화 없음
--   - 원격 자동 실행 대상이 아님 (로컬 migration 파일만)
-- =============================================================================

begin;

alter table public.quotes
  add column if not exists special_discount_memo text;

comment on column public.quotes.special_discount_memo is
  '고객용 특별할인 메모(최대 40자 권장). 금액 계산과 무관. null/빈값 허용.';

-- 공유 RPC: 특별할인 메모 노출 (금액 계산·페이지 분할 무관)
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
    'special_discount_memo', q.special_discount_memo,
    'lx_discount_rate', coalesce(q.lx_discount_rate, 0),
    'lx_discount_amount', coalesce(q.lx_discount_amount, 0),
    'final_amount', q.final_amount,
    'vat_mode', q.vat_mode,
    'vat_rate', q.vat_rate,
    'supply_amount', coalesce(q.supply_amount, q.final_amount),
    'vat_amount', coalesce(q.vat_amount, 0),
    'customer_total_amount', coalesce(q.customer_total_amount, q.final_amount),
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
    'assignee_name', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_name
      else e.name
    end,
    'assignee_title', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_title
      else e.title
    end,
    'assignee_phone', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_phone
      else nullif(trim(coalesce(e.phone, '')), '')
    end,
    'assignee_email', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_email
      else nullif(trim(coalesce(e.email, '')), '')
    end,
    'assignee_card_path', case
      when (
        case
          when q.assignee_name is not null
            or q.assignee_title is not null
            or q.assignee_phone is not null
            or q.assignee_email is not null
            or q.assignee_card_path is not null
            or q.assignee_show_business_card is not null
          then q.assignee_show_business_card
          else coalesce(e.show_business_card_on_quote, false)
        end
      ) is true
      then case
        when q.assignee_name is not null
          or q.assignee_title is not null
          or q.assignee_phone is not null
          or q.assignee_email is not null
          or q.assignee_card_path is not null
          or q.assignee_show_business_card is not null
        then q.assignee_card_path
        else nullif(trim(coalesce(e.business_card_path, '')), '')
      end
      else null
    end,
    'assignee_show_business_card', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_show_business_card
      else coalesce(e.show_business_card_on_quote, false)
    end,
    'assigned_employee_id', q.assigned_employee_id,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'trade_name', i.trade_name,
          'item_name', i.item_name,
          'description', i.description,
          'remark', i.remark,
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
  left join public.employees e
    on e.id = q.assigned_employee_id
   and e.company_id = q.company_id
  where q.share_token = p_token
    and q.deleted_at is null
    and c.deleted_at is null;

  return result;
end;
$$;

comment on function public.get_quote_share_by_token(uuid) is
  '고객 공유 토큰 조회. VAT·담당자 스냅샷·remark·special_discount_memo 포함.';

revoke all on function public.get_quote_share_by_token(uuid) from public;
grant execute on function public.get_quote_share_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
