-- =============================================================================
-- Eighty ERP — update_quote_with_items: quote_items.updated_at 참조 제거
-- 파일: 20260803000031_fix_atomic_quote_item_updated_at.sql
--
-- 원인 (42703):
--   column "updated_at" of relation "quote_items" does not exist
--
-- 수정:
--   - public.quote_items 의 updated_at 참조만 제거
--   - public.quotes.updated_at 은 컬럼이 존재하므로 헤더 UPDATE 유지
--   - quote_items 에 updated_at 컬럼을 추가하지 않음
--
-- 안전:
--   - migration 27·28·29·30 파일 미수정
--   - DROP TABLE / DELETE FROM / TRUNCATE / DROP FUNCTION 없음
--   - CREATE OR REPLACE + REVOKE/GRANT + notify 만 수행
--
-- 적용 순서: … → 30 → 본 파일(31)
-- 재실행: create or replace / revoke·grant 재적용 가능
-- =============================================================================

begin;

create or replace function public.update_quote_with_items(
  p_quote_id uuid,
  p_header jsonb,
  p_items jsonb default '[]'::jsonb,
  p_removed_item_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_quote_deleted_at timestamptz;
  v_removed uuid[];
  v_active_ids uuid[];
  v_incoming_ids uuid[];
  v_missing_ids uuid[];
  v_unknown_incoming integer;
  v_unknown_removed integer;
  v_removed_updated integer;
  v_dup_save integer;
  v_dup_removed integer;
  v_overlap integer;
  v_active_after integer;
  v_header_updated integer;
  v_id_map jsonb := '[]'::jsonb;
  v_items jsonb;
  v_title text;
  v_quote_type text;
  v_quote_mode text;
  v_status text;
  v_project_id uuid;
  v_assigned_employee_id uuid;
  v_valid_until date;
  v_issued_at date;
  v_total_amount bigint;
  v_discount_amount bigint;
  v_lx_discount_rate numeric;
  v_lx_discount_amount bigint;
  v_final_amount bigint;
  v_is_lx_material boolean;
  v_memo text;
  v_customer_message text;
  v_invalid_cost integer;
  v_invalid_lx_base integer;
  v_invalid_lx_rate integer;
begin
  -- 1) 인증
  if v_uid is null then
    raise exception '인증이 필요합니다.';
  end if;

  if p_quote_id is null then
    raise exception '견적 ID가 필요합니다.';
  end if;

  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception '견적 헤더 형식이 올바르지 않습니다.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception '견적 항목 형식이 올바르지 않습니다.';
  end if;

  -- 2) quote 행 FOR UPDATE + 권한
  select q.company_id, q.deleted_at
    into v_company_id, v_quote_deleted_at
  from public.quotes q
  where q.id = p_quote_id
  for update;

  if not found then
    raise exception '견적을 찾을 수 없습니다.';
  end if;

  if v_quote_deleted_at is not null then
    raise exception '삭제된 견적은 수정할 수 없습니다.';
  end if;

  if v_company_id is null then
    raise exception '견적 회사 정보가 없습니다.';
  end if;

  if not public.is_company_member(v_company_id) then
    raise exception '이 견적을 수정할 권한이 없습니다.';
  end if;

  if coalesce(public.is_admin(), false) = false
     and public.current_company_id() is distinct from v_company_id then
    raise exception '현재 활성 회사에서만 견적을 수정할 수 있습니다.';
  end if;

  -- 3) 헤더 필드 검증 (화이트리스트만 사용)
  v_title := nullif(trim(p_header->>'title'), '');
  if v_title is null then
    raise exception '견적명을 입력해 주세요.';
  end if;

  v_quote_type := nullif(trim(p_header->>'quote_type'), '');
  if v_quote_type is null or v_quote_type not in ('창호', '인테리어', '기타') then
    raise exception '견적유형이 올바르지 않습니다.';
  end if;

  v_quote_mode := coalesce(nullif(trim(p_header->>'quote_mode'), ''), 'simple');
  if v_quote_mode not in ('simple', 'detailed') then
    raise exception '견적 모드가 올바르지 않습니다.';
  end if;

  v_status := coalesce(nullif(trim(p_header->>'status'), ''), '작성중');
  if v_status not in (
    '작성중', '검토중', '발송완료', '수정요청', '승인', '계약전환', '만료', '취소'
  ) then
    raise exception '견적 상태가 올바르지 않습니다.';
  end if;

  begin
    v_project_id := nullif(trim(p_header->>'project_id'), '')::uuid;
  exception when others then
    raise exception '프로젝트 ID가 올바르지 않습니다.';
  end;

  begin
    v_assigned_employee_id := nullif(trim(p_header->>'assigned_employee_id'), '')::uuid;
  exception when others then
    raise exception '담당자 ID가 올바르지 않습니다.';
  end;

  begin
    v_valid_until := nullif(trim(p_header->>'valid_until'), '')::date;
  exception when others then
    raise exception '유효기간이 올바르지 않습니다.';
  end;

  begin
    v_issued_at := nullif(trim(p_header->>'issued_at'), '')::date;
  exception when others then
    raise exception '작성일이 올바르지 않습니다.';
  end;

  v_total_amount := greatest(0, round(coalesce(nullif(p_header->>'total_amount', '')::numeric, 0)));
  v_discount_amount := greatest(0, round(coalesce(nullif(p_header->>'discount_amount', '')::numeric, 0)));
  v_lx_discount_amount := greatest(0, round(coalesce(nullif(p_header->>'lx_discount_amount', '')::numeric, 0)));
  v_final_amount := greatest(0, round(coalesce(nullif(p_header->>'final_amount', '')::numeric, 0)));
  v_lx_discount_rate := coalesce(nullif(p_header->>'lx_discount_rate', '')::numeric, 0);
  if v_lx_discount_rate < 0 or v_lx_discount_rate > 100 then
    raise exception 'LX 자재 할인율은 0~100 사이여야 합니다.';
  end if;
  v_is_lx_material := coalesce((p_header->>'is_lx_material')::boolean, false);
  v_memo := nullif(p_header->>'memo', '');
  v_customer_message := nullif(p_header->>'customer_message', '');

  v_removed := coalesce(p_removed_item_ids, '{}'::uuid[]);

  -- 4) 항목 ID 집합 검증 (데이터 변경 전)
  select count(*)::integer into v_dup_removed
  from (
    select unnest(v_removed) as id
    group by 1
    having count(*) > 1
  ) d;
  if v_dup_removed > 0 then
    raise exception '제거 항목 ID가 중복되었습니다.';
  end if;

  select count(*)::integer into v_dup_save
  from (
    select (elem->>'id')::uuid as id
    from jsonb_array_elements(p_items) elem
    where nullif(trim(elem->>'id'), '') is not null
    group by 1
    having count(*) > 1
  ) d;
  if v_dup_save > 0 then
    raise exception '저장 항목 ID가 중복되었습니다.';
  end if;

  select count(*)::integer into v_overlap
  from (
    select (elem->>'id')::uuid as id
    from jsonb_array_elements(p_items) elem
    where nullif(trim(elem->>'id'), '') is not null
  ) s
  where s.id = any (v_removed);
  if v_overlap > 0 then
    raise exception '같은 항목이 저장 목록과 제거 목록에 모두 있습니다.';
  end if;

  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[])
    into v_active_ids
  from public.quote_items i
  where i.quote_id = p_quote_id
    and i.deleted_at is null
    and (i.company_id = v_company_id or i.company_id is null);

  select coalesce(array_agg((elem->>'id')::uuid order by (elem->>'id')::uuid), '{}'::uuid[])
    into v_incoming_ids
  from jsonb_array_elements(p_items) elem
  where nullif(trim(elem->>'id'), '') is not null;

  select count(*)::integer into v_unknown_incoming
  from unnest(v_incoming_ids) as u(id)
  where not (u.id = any (v_active_ids));
  if v_unknown_incoming > 0 then
    raise exception '기존 견적 항목 ID가 올바르지 않습니다.';
  end if;

  select count(*)::integer into v_unknown_removed
  from unnest(v_removed) as u(id)
  where not (u.id = any (v_active_ids));
  if v_unknown_removed > 0 then
    raise exception '제거할 견적 항목을 확인할 수 없습니다.';
  end if;

  select coalesce(array_agg(m.id order by m.id), '{}'::uuid[])
    into v_missing_ids
  from unnest(v_active_ids) as m(id)
  where not (
    m.id = any (v_incoming_ids)
    or m.id = any (v_removed)
  );

  if coalesce(cardinality(v_missing_ids), 0) > 0 then
    raise exception
      '기존 견적 항목 ID가 저장 요청에서 누락되었습니다. missing=%',
      array_to_string(v_missing_ids, ',');
  end if;

  -- cost_type / LX 필드 사전 검증 (정규화 후)
  select count(*)::integer into v_invalid_cost
  from jsonb_array_elements(p_items) elem
  where case
      when nullif(trim(elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
      when nullif(trim(elem->>'cost_type'), '') in ('자재', '시공', '기타')
        then nullif(trim(elem->>'cost_type'), '')
      when nullif(trim(elem->>'cost_type'), '') is null then '기타'
      else null
    end is null;
  if v_invalid_cost > 0 then
    raise exception '견적 항목 구분이 올바르지 않습니다.';
  end if;

  select count(*)::integer into v_invalid_lx_base
  from jsonb_array_elements(p_items) elem
  where greatest(0, round(coalesce(nullif(elem->>'lx_discount_base_amount', '')::numeric, 0)))
        > greatest(0, round(coalesce(nullif(elem->>'amount', '')::numeric, 0)));
  if v_invalid_lx_base > 0 then
    raise exception 'LX 자재금액은 항목 총금액 이하로 입력해주세요.';
  end if;

  select count(*)::integer into v_invalid_lx_rate
  from jsonb_array_elements(p_items) elem
  where nullif(trim(elem->>'lx_discount_type'), '') = 'rate'
    and (
      coalesce(nullif(elem->>'lx_discount_value', '')::numeric, -1) < 0
      or coalesce(nullif(elem->>'lx_discount_value', '')::numeric, 0) > 100
    );
  if v_invalid_lx_rate > 0 then
    raise exception 'LX 할인율은 0~100 사이여야 합니다.';
  end if;

  -- 5) 헤더 UPDATE (quotes.updated_at 유지 — 컬럼 존재)
  update public.quotes q
  set
    project_id = v_project_id,
    quote_type = v_quote_type,
    quote_mode = v_quote_mode,
    title = v_title,
    status = v_status,
    total_amount = v_total_amount,
    discount_amount = v_discount_amount,
    lx_discount_rate = v_lx_discount_rate,
    lx_discount_amount = v_lx_discount_amount,
    final_amount = v_final_amount,
    valid_until = v_valid_until,
    issued_at = v_issued_at,
    assigned_employee_id = v_assigned_employee_id,
    is_lx_material = v_is_lx_material,
    memo = v_memo,
    customer_message = v_customer_message,
    updated_by = v_uid,
    updated_at = now()
  where q.id = p_quote_id
    and q.deleted_at is null;

  get diagnostics v_header_updated = row_count;
  if v_header_updated <> 1 then
    raise exception '견적 수정에 실패했습니다.';
  end if;

  -- 6) 기존 항목 batch UPDATE (quote_items.updated_at 미사용)
  if coalesce(cardinality(v_incoming_ids), 0) > 0 then
    update public.quote_items i
    set
      trade_name = coalesce(nullif(trim(p.trade_name), ''), '미분류'),
      item_name = nullif(trim(p.item_name), ''),
      description = nullif(trim(p.description), ''),
      quantity = p.quantity,
      unit = nullif(trim(p.unit), ''),
      unit_price = greatest(0, round(coalesce(p.unit_price, 0))),
      amount = greatest(0, round(coalesce(p.amount, 0))),
      cost_type = p.cost_type_norm,
      is_lx_material = case
        when p.cost_type_norm in ('자재', '시공+자재') then coalesce(p.is_lx_material, false)
        else false
      end,
      lx_discount_base_amount = greatest(0, round(coalesce(p.lx_discount_base_amount, 0))),
      lx_discount_type = case
        when p.lx_discount_type in ('none', 'rate', 'fixed') then p.lx_discount_type
        else null
      end,
      lx_discount_value = p.lx_discount_value,
      sort_order = coalesce(p.sort_order, 0),
      deleted_at = null
    from (
      select
        (elem->>'id')::uuid as id,
        elem->>'trade_name' as trade_name,
        elem->>'item_name' as item_name,
        elem->>'description' as description,
        nullif(elem->>'quantity', '')::numeric as quantity,
        elem->>'unit' as unit,
        nullif(elem->>'unit_price', '')::numeric as unit_price,
        nullif(elem->>'amount', '')::numeric as amount,
        case
          when nullif(trim(elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
          when nullif(trim(elem->>'cost_type'), '') in ('자재', '시공', '기타')
            then nullif(trim(elem->>'cost_type'), '')
          else '기타'
        end as cost_type_norm,
        coalesce((elem->>'is_lx_material')::boolean, false) as is_lx_material,
        nullif(elem->>'lx_discount_base_amount', '')::numeric as lx_discount_base_amount,
        nullif(trim(elem->>'lx_discount_type'), '') as lx_discount_type,
        nullif(elem->>'lx_discount_value', '')::numeric as lx_discount_value,
        coalesce(nullif(elem->>'sort_order', '')::integer, 0) as sort_order
      from jsonb_array_elements(p_items) elem
      where nullif(trim(elem->>'id'), '') is not null
    ) p
    where i.id = p.id
      and i.quote_id = p_quote_id
      and i.deleted_at is null
      and (i.company_id = v_company_id or i.company_id is null);
  end if;

  -- 7) 신규 항목 set-based INSERT (id/created_at 은 테이블 DEFAULT 가능, updated_at 미사용)
  insert into public.quote_items (
    quote_id,
    company_id,
    trade_name,
    item_name,
    description,
    quantity,
    unit,
    unit_price,
    amount,
    cost_type,
    is_lx_material,
    lx_discount_base_amount,
    lx_discount_type,
    lx_discount_value,
    sort_order,
    created_at,
    deleted_at
  )
  select
    p_quote_id,
    v_company_id,
    coalesce(nullif(trim(n.elem->>'trade_name'), ''), '미분류'),
    nullif(trim(n.elem->>'item_name'), ''),
    nullif(trim(n.elem->>'description'), ''),
    nullif(n.elem->>'quantity', '')::numeric,
    nullif(trim(n.elem->>'unit'), ''),
    greatest(0, round(coalesce(nullif(n.elem->>'unit_price', '')::numeric, 0))),
    greatest(0, round(coalesce(nullif(n.elem->>'amount', '')::numeric, 0))),
    n.cost_type_norm,
    case
      when n.cost_type_norm in ('자재', '시공+자재')
        then coalesce((n.elem->>'is_lx_material')::boolean, false)
      else false
    end,
    greatest(0, round(coalesce(nullif(n.elem->>'lx_discount_base_amount', '')::numeric, 0))),
    case
      when nullif(trim(n.elem->>'lx_discount_type'), '') in ('none', 'rate', 'fixed')
        then nullif(trim(n.elem->>'lx_discount_type'), '')
      else null
    end,
    nullif(n.elem->>'lx_discount_value', '')::numeric,
    coalesce(nullif(n.elem->>'sort_order', '')::integer, n.ord::integer - 1),
    now(),
    null
  from (
    select
      t.elem,
      t.ord,
      case
        when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
        when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
          then nullif(trim(t.elem->>'cost_type'), '')
        else '기타'
      end as cost_type_norm
    from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
    where nullif(trim(t.elem->>'id'), '') is null
  ) n
  order by n.ord;

  -- 8) 명시된 removed ID만 batch soft-delete (quote_items.updated_at 미사용)
  if coalesce(cardinality(v_removed), 0) > 0 then
    update public.quote_items i
    set
      deleted_at = now()
    where i.quote_id = p_quote_id
      and i.deleted_at is null
      and i.id = any (v_removed)
      and (i.company_id = v_company_id or i.company_id is null);

    get diagnostics v_removed_updated = row_count;
    if v_removed_updated <> coalesce(cardinality(v_removed), 0) then
      raise exception '제거할 견적 항목을 확인할 수 없습니다.';
    end if;
  end if;

  -- 9) 최종 활성 항목 수 > 0
  select count(*)::integer into v_active_after
  from public.quote_items i
  where i.quote_id = p_quote_id
    and i.deleted_at is null;

  if v_active_after <= 0 then
    raise exception '견적 항목은 1개 이상 필요합니다.';
  end if;

  -- 10) 결과 반환
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'trade_name', i.trade_name,
        'item_name', i.item_name,
        'description', i.description,
        'quantity', i.quantity,
        'unit', i.unit,
        'unit_price', i.unit_price,
        'amount', i.amount,
        'cost_type', i.cost_type,
        'is_lx_material', i.is_lx_material,
        'lx_discount_base_amount', i.lx_discount_base_amount,
        'lx_discount_type', i.lx_discount_type,
        'lx_discount_value', i.lx_discount_value,
        'sort_order', i.sort_order
      )
      order by i.sort_order, i.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.quote_items i
  where i.quote_id = p_quote_id
    and i.deleted_at is null;

  return jsonb_build_object(
    'quote_id', p_quote_id,
    'company_id', v_company_id,
    'id_map', v_id_map,
    'items', v_items,
    'total_amount', v_total_amount,
    'final_amount', v_final_amount
  );
end;
$$;

comment on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) is
  '견적 헤더+항목 원자적 수정. quote_items.updated_at 미사용(42703 수정). 실패 시 전체 rollback.';

revoke all on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) from public;
revoke all on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
