-- =============================================================================
-- Eighty ERP — 견적 항목 안전 동기화 RPC
-- 파일: 20260803000029_safe_quote_item_sync.sql
--
-- 목적:
--   - 기존 quote_items 전체 soft-delete + 전체 INSERT 재생성 제거
--   - 기존 ID UPDATE / 신규 INSERT / 명시적 제거 ID만 soft-delete
--   - 활성 ID 집합 완전성 검증 (누락·전체 유실·부분 유실 차단)
--   - 한 트랜잭션으로 부분 실패 방지
--
-- 안전:
--   - DROP TABLE / DELETE / TRUNCATE / 기존 행 데이터 backfill 없음
--   - 함수 CREATE OR REPLACE + GRANT/REVOKE 만 수행
--   - SQL DELETE 미사용 (soft-delete 는 deleted_at UPDATE)
--
-- ID 집합 검증 (데이터 변경 전):
--   active_existing_ids ⊆ (incoming_existing_ids ∪ removed_ids)
--   → 누락 ID가 있으면 전체 실패 (자동 soft-delete 금지)
--
-- 적용 순서: migration 27 → 28 → 본 파일(29)
-- 재실행: create or replace / revoke·grant 재적용 가능
-- =============================================================================

begin;

create or replace function public.sync_quote_items(
  p_quote_id uuid,
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
  v_id_map jsonb := '[]'::jsonb;
  v_items jsonb;
  v_elem jsonb;
  v_ord integer;
  v_new_id uuid;
  v_client_key text;
begin
  -- 1) 인증
  if v_uid is null then
    raise exception '인증이 필요합니다.';
  end if;

  if p_quote_id is null then
    raise exception '견적 ID가 필요합니다.';
  end if;

  -- 3) payload JSON 구조
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

  v_removed := coalesce(p_removed_item_ids, '{}'::uuid[]);

  -- 중복 제거 ID
  select count(*)::integer into v_dup_removed
  from (
    select unnest(v_removed) as id
    group by 1
    having count(*) > 1
  ) d;
  if v_dup_removed > 0 then
    raise exception '제거 항목 ID가 중복되었습니다.';
  end if;

  -- 중복 저장 ID
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

  -- 저장∩제거 교집합 금지
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

  -- 4) active_existing_ids (현재 활성 전체)
  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[])
    into v_active_ids
  from public.quote_items i
  where i.quote_id = p_quote_id
    and i.deleted_at is null
    and (i.company_id = v_company_id or i.company_id is null);

  -- 5) incoming_existing_ids
  select coalesce(array_agg((elem->>'id')::uuid order by (elem->>'id')::uuid), '{}'::uuid[])
    into v_incoming_ids
  from jsonb_array_elements(p_items) elem
  where nullif(trim(elem->>'id'), '') is not null;

  -- 6) removed / incoming 이 모두 active 에 속하는지
  select count(*)::integer into v_unknown_incoming
  from unnest(v_incoming_ids) as u(id)
  where not (u.id = any (v_active_ids));
  if v_unknown_incoming > 0 then
    -- soft-delete 과거 ID·타 quote/company ID 포함
    raise exception '기존 견적 항목 ID가 올바르지 않습니다.';
  end if;

  select count(*)::integer into v_unknown_removed
  from unnest(v_removed) as u(id)
  where not (u.id = any (v_active_ids));
  if v_unknown_removed > 0 then
    raise exception '제거할 견적 항목을 확인할 수 없습니다.';
  end if;

  -- 7) 누락 ID 집합 검증
  --    active ⊆ (incoming ∪ removed)
  --    전체 ID 유실(N>0, U=0, C>0, R=0) 및 부분 유실(예: B 누락)을 모두 차단
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

  -- 8) 필드 클램프는 UPDATE/INSERT 시 greatest(0,…) 적용
  --    (앱 사전 검증 보조; 최종 안전은 아래 변경 + 활성 수 확인)

  -- 9) 기존 항목 batch UPDATE
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
      cost_type = case
        when p.cost_type in ('자재', '시공', '시공+자재', '기타') then p.cost_type
        else '기타'
      end,
      is_lx_material = coalesce(p.is_lx_material, false),
      lx_discount_base_amount = greatest(0, round(coalesce(p.lx_discount_base_amount, 0))),
      lx_discount_type = case
        when p.lx_discount_type in ('none', 'rate', 'fixed') then p.lx_discount_type
        else null
      end,
      lx_discount_value = p.lx_discount_value,
      sort_order = coalesce(p.sort_order, 0),
      updated_at = now(),
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
        elem->>'cost_type' as cost_type,
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

  -- 10) 신규 항목 INSERT (id 없음). quote_id/company_id 는 견적에서만 결정
  for v_elem, v_ord in
    select elem, ord::integer
    from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
    where nullif(trim(elem->>'id'), '') is null
    order by ord
  loop
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
      updated_at,
      deleted_at
    )
    values (
      p_quote_id,
      v_company_id,
      coalesce(nullif(trim(v_elem->>'trade_name'), ''), '미분류'),
      nullif(trim(v_elem->>'item_name'), ''),
      nullif(trim(v_elem->>'description'), ''),
      nullif(v_elem->>'quantity', '')::numeric,
      nullif(trim(v_elem->>'unit'), ''),
      greatest(0, round(coalesce(nullif(v_elem->>'unit_price', '')::numeric, 0))),
      greatest(0, round(coalesce(nullif(v_elem->>'amount', '')::numeric, 0))),
      case
        when v_elem->>'cost_type' in ('자재', '시공', '시공+자재', '기타')
          then v_elem->>'cost_type'
        else '기타'
      end,
      coalesce((v_elem->>'is_lx_material')::boolean, false),
      greatest(0, round(coalesce(nullif(v_elem->>'lx_discount_base_amount', '')::numeric, 0))),
      case
        when nullif(trim(v_elem->>'lx_discount_type'), '') in ('none', 'rate', 'fixed')
          then nullif(trim(v_elem->>'lx_discount_type'), '')
        else null
      end,
      nullif(v_elem->>'lx_discount_value', '')::numeric,
      coalesce(nullif(v_elem->>'sort_order', '')::integer, v_ord - 1),
      now(),
      now(),
      null
    )
    returning id into v_new_id;

    v_client_key := coalesce(
      nullif(trim(v_elem->>'client_key'), ''),
      'new-' || v_ord::text
    );
    v_id_map := v_id_map || jsonb_build_array(
      jsonb_build_object('client_key', v_client_key, 'id', v_new_id)
    );
  end loop;

  -- 11) 명시된 removed ID만 batch soft-delete
  if coalesce(cardinality(v_removed), 0) > 0 then
    update public.quote_items i
    set
      deleted_at = now(),
      updated_at = now()
    where i.quote_id = p_quote_id
      and i.deleted_at is null
      and i.id = any (v_removed)
      and (i.company_id = v_company_id or i.company_id is null);

    get diagnostics v_removed_updated = row_count;
    if v_removed_updated <> coalesce(cardinality(v_removed), 0) then
      raise exception '제거할 견적 항목을 확인할 수 없습니다.';
    end if;
  end if;

  -- 12) 최종 활성 항목 수 > 0
  select count(*)::integer into v_active_after
  from public.quote_items i
  where i.quote_id = p_quote_id
    and i.deleted_at is null;

  if v_active_after <= 0 then
    raise exception '견적 항목은 1개 이상 필요합니다.';
  end if;

  -- 13) 결과 반환
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
    'items', v_items
  );
end;
$$;

comment on function public.sync_quote_items(uuid, jsonb, uuid[]) is
  '견적 항목 안전 동기화: 활성 ID 완전성 검증 후 UPDATE/INSERT/명시 soft-delete. 한 트랜잭션.';

revoke all on function public.sync_quote_items(uuid, jsonb, uuid[]) from public;
revoke all on function public.sync_quote_items(uuid, jsonb, uuid[]) from anon;
grant execute on function public.sync_quote_items(uuid, jsonb, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
