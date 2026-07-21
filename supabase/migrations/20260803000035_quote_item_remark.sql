-- =============================================================================
-- Eighty ERP — 견적 항목 비고(remark)
-- 파일: 20260803000035_quote_item_remark.sql
--
-- 목적:
--   - quote_items.remark (nullable text) 추가 — 항목별 선택 비고
--   - description(규격)과 별도. 금액·VAT·LX 계산 무관
--   - create/update/sync/share RPC가 remark를 저장·반환
--
-- 안전:
--   - DROP TABLE / DELETE / TRUNCATE / 기존 행 backfill 없음
--   - NOT NULL / 강제 DEFAULT 없음
--   - RLS 정책 ALTER 없음
--   - migrations 1~34 미수정 (본 파일 CREATE OR REPLACE만)
-- =============================================================================

begin;

alter table public.quote_items
  add column if not exists remark text;

comment on column public.quote_items.remark is
  '항목별 선택 비고(색상·규격·시공조건 등). null/빈값 허용. 최대 500자(앱·RPC 클램프).';

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
      remark = nullif(left(trim(coalesce(p.remark, '')), 500), ''),
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
        elem->>'remark' as remark,
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
      remark,
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
      nullif(left(trim(coalesce(v_elem->>'remark', '')), 500), ''),
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
        'remark', i.remark,
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
  '견적 항목 안전 동기화(+remark). 활성 ID 완전성 검증 후 UPDATE/INSERT/명시 soft-delete.';

revoke all on function public.sync_quote_items(uuid, jsonb, uuid[]) from public;
revoke all on function public.sync_quote_items(uuid, jsonb, uuid[]) from anon;
grant execute on function public.sync_quote_items(uuid, jsonb, uuid[]) to authenticated;

create or replace function public.create_quote_with_items(
  p_header jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_request_id uuid;
  v_quote_id uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_assigned_employee_id uuid;
  v_title text;
  v_quote_type text;
  v_quote_mode text;
  v_status text;
  v_valid_until date;
  v_issued_at date;
  v_quote_number text;
  v_client_total bigint;
  v_client_lx bigint;
  v_client_final bigint;
  v_discount bigint;
  v_lx_discount_rate numeric;
  v_lx_rate_clamped numeric;
  v_calc_total bigint;
  v_calc_lx bigint;
  v_calc_lx_base bigint;
  v_calc_final bigint;
  v_is_lx_material boolean;
  v_memo text;
  v_customer_message text;
  v_is_contract_quote boolean;
  v_vat_key_count integer := 0;
  v_vat_provided boolean := false;
  v_vat_mode text;
  v_vat_rate numeric;
  v_company_vat_mode text;
  v_company_vat_rate numeric;
  v_supply_amount bigint;
  v_vat_amount bigint;
  v_customer_total_amount bigint;
  v_app_supply_amount bigint;
  v_app_vat_amount bigint;
  v_app_customer_total_amount bigint;
  v_dup_ids integer;
  v_existing_ids integer;
  v_invalid_cost integer;
  v_invalid_lx_base integer;
  v_invalid_lx_rate integer;
  v_item_count integer;
  v_canonical jsonb;
  v_hash text;
  v_existing_hash text;
  v_row_customer_id uuid;
  v_row_total bigint;
  v_row_discount bigint;
  v_row_lx bigint;
  v_row_final bigint;
  v_row_vat_mode text;
  v_row_vat_rate numeric;
  v_row_supply bigint;
  v_row_vat_amount bigint;
  v_row_customer_total bigint;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.';
  end if;

  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception '견적 헤더 형식이 올바르지 않습니다.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception '견적 항목 형식이 올바르지 않습니다.';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception '현재 회사가 설정되지 않았습니다.';
  end if;

  if not public.is_company_member(v_company_id) then
    raise exception '견적을 등록할 권한이 없습니다.';
  end if;

  -- request_id 필수 (idempotency key). 신규 키 request_id, 구버전 호환 create_request_id
  begin
    v_request_id := nullif(
      trim(coalesce(p_header->>'request_id', p_header->>'create_request_id')),
      ''
    )::uuid;
  exception when others then
    raise exception '생성 요청 ID가 필요합니다.';
  end;
  if v_request_id is null then
    raise exception '생성 요청 ID가 필요합니다.';
  end if;

  -- 헤더 필수·검증 (비금액)
  begin
    v_customer_id := nullif(trim(p_header->>'customer_id'), '')::uuid;
  exception when others then
    raise exception '고객 ID가 올바르지 않습니다.';
  end;
  if v_customer_id is null then
    raise exception '고객을 선택해 주세요.';
  end if;

  if not exists (
    select 1
    from public.customers c
    where c.id = v_customer_id
      and c.company_id = v_company_id
      and c.deleted_at is null
  ) then
    raise exception '현재 회사에 속한 고객이 아닙니다.';
  end if;

  if not (
    public.is_admin()
    or public.can_access_customer(v_customer_id)
  ) then
    raise exception '이 고객의 견적을 등록할 권한이 없습니다.';
  end if;

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
  if v_project_id is not null
     and not exists (
       select 1
       from public.projects p
       where p.id = v_project_id
         and p.company_id = v_company_id
         and p.deleted_at is null
     ) then
    raise exception '현재 회사에 속한 프로젝트가 아닙니다.';
  end if;

  begin
    v_assigned_employee_id := nullif(trim(p_header->>'assigned_employee_id'), '')::uuid;
  exception when others then
    raise exception '담당자 ID가 올바르지 않습니다.';
  end;
  if v_assigned_employee_id is not null
     and not exists (
       select 1
       from public.employees e
       where e.id = v_assigned_employee_id
         and e.company_id = v_company_id
         and e.is_active = true
     ) then
    raise exception '현재 회사의 활성 담당자가 아닙니다.';
  end if;

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
  if v_issued_at is null then
    v_issued_at := (current_timestamp at time zone 'Asia/Seoul')::date;
  end if;

  -- quote_number: NULL/공백이면 BEFORE INSERT 트리거가 YYYYMMDD-### 부여
  v_quote_number := nullif(trim(p_header->>'quote_number'), '');

  v_memo := nullif(p_header->>'memo', '');
  v_customer_message := nullif(p_header->>'customer_message', '');

  begin
    v_is_contract_quote := coalesce((p_header->>'is_contract_quote')::boolean, false);
  exception when others then
    v_is_contract_quote := false;
  end;

  -- 클라이언트 금액 (검증용; 저장은 서버 재계산값). 음수·비정상 값은 거부.
  begin
    v_client_total := round(coalesce(nullif(p_header->>'total_amount', '')::numeric, 0));
    v_discount := round(coalesce(nullif(p_header->>'discount_amount', '')::numeric, 0));
    v_client_lx := round(coalesce(nullif(p_header->>'lx_discount_amount', '')::numeric, 0));
    v_client_final := round(coalesce(nullif(p_header->>'final_amount', '')::numeric, 0));
    v_lx_discount_rate := coalesce(nullif(p_header->>'lx_discount_rate', '')::numeric, 0);
  exception when others then
    raise exception '견적 금액 형식이 올바르지 않습니다.';
  end;
  if v_client_total < 0 or v_discount < 0 or v_client_lx < 0 or v_client_final < 0 then
    raise exception '견적 금액·할인 값은 0 이상이어야 합니다.';
  end if;
  if v_lx_discount_rate < 0 or v_lx_discount_rate > 100 then
    raise exception 'LX 자재 할인율은 0~100 사이여야 합니다.';
  end if;
  v_lx_rate_clamped := least(100, greatest(0, round(v_lx_discount_rate::numeric, 2)));

  -- 항목 사전 검증
  select count(*)::integer into v_item_count
  from jsonb_array_elements(p_items) elem;
  if v_item_count <= 0 then
    raise exception '견적 항목은 1개 이상 필요합니다.';
  end if;

  select count(*)::integer into v_dup_ids
  from (
    select (elem->>'id')::uuid as id
    from jsonb_array_elements(p_items) elem
    where nullif(trim(elem->>'id'), '') is not null
    group by 1
    having count(*) > 1
  ) d;
  if v_dup_ids > 0 then
    raise exception '저장 항목 ID가 중복되었습니다.';
  end if;

  select count(*)::integer into v_existing_ids
  from jsonb_array_elements(p_items) elem
  join public.quote_items i
    on i.id = (elem->>'id')::uuid
  where nullif(trim(elem->>'id'), '') is not null;
  if v_existing_ids > 0 then
    raise exception '이미 사용 중인 견적 항목 ID는 재사용할 수 없습니다.';
  end if;

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

  select count(*)::integer into v_invalid_lx_rate
  from jsonb_array_elements(p_items) elem
  where nullif(trim(elem->>'lx_discount_type'), '') = 'fixed'
    and coalesce(nullif(elem->>'lx_discount_value', '')::numeric, 0) < 0;
  if v_invalid_lx_rate > 0 then
    raise exception 'LX 정액 할인은 0 이상이어야 합니다.';
  end if;

  select count(*)::integer into v_invalid_lx_rate
  from jsonb_array_elements(p_items) elem
  where coalesce(nullif(elem->>'amount', '')::numeric, 0) < 0
     or coalesce(nullif(elem->>'unit_price', '')::numeric, 0) < 0
     or coalesce(nullif(elem->>'lx_discount_base_amount', '')::numeric, 0) < 0;
  if v_invalid_lx_rate > 0 then
    raise exception '항목 금액·단가·LX 대상금액은 0 이상이어야 합니다.';
  end if;

  -- SERVER 재계산 (set-based; TS computeItemLxDiscountAmount / computeQuoteAmounts 와 동일)
  select
    coalesce(sum(n.amount), 0)::bigint,
    coalesce(sum(n.item_lx_discount), 0)::bigint,
    coalesce(sum(n.lx_base), 0)::bigint,
    coalesce(bool_or(n.is_lx), false)
  into v_calc_total, v_calc_lx, v_calc_lx_base, v_is_lx_material
  from (
    select
      c.amount,
      c.is_lx,
      c.lx_base,
      case
        when c.lx_base <= 0 then 0::numeric
        when c.lx_type = 'none' then 0::numeric
        when c.lx_type = 'rate' then
          round(
            c.lx_base
            * least(
              100,
              greatest(
                0,
                round(coalesce(c.lx_value, 0)::numeric, 2)
              )
            )
            / 100.0
          )
        when c.lx_type = 'fixed' then
          least(c.lx_base, greatest(0, round(coalesce(c.lx_value, 0)::numeric)))
        else
          -- null/empty/unknown → 견적 단위 할인율
          round(c.lx_base * v_lx_rate_clamped / 100.0)
      end as item_lx_discount
    from (
      select
        greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0))) as amount,
        case
          when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
          when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
            then nullif(trim(t.elem->>'cost_type'), '')
          else '기타'
        end as cost_type_norm,
        case
          when (
            case
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                then nullif(trim(t.elem->>'cost_type'), '')
              else '기타'
            end
          ) in ('자재', '시공+자재')
            then coalesce((t.elem->>'is_lx_material')::boolean, false)
          else false
        end as is_lx,
        case
          when not (
            case
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                then nullif(trim(t.elem->>'cost_type'), '')
              else '기타'
            end
          ) in ('자재', '시공+자재')
            or not coalesce((t.elem->>'is_lx_material')::boolean, false)
          then 0::numeric
          when (
            case
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                then nullif(trim(t.elem->>'cost_type'), '')
              else '기타'
            end
          ) = '자재'
          then greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0)))
          else least(
            greatest(0, round(coalesce(nullif(t.elem->>'lx_discount_base_amount', '')::numeric, 0))),
            greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0)))
          )
        end as lx_base,
        case
          when nullif(trim(t.elem->>'lx_discount_type'), '') in ('none', 'rate', 'fixed')
            then nullif(trim(t.elem->>'lx_discount_type'), '')
          else null
        end as lx_type,
        nullif(t.elem->>'lx_discount_value', '')::numeric as lx_value
      from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
    ) c
  ) n;

  if v_client_total <> v_calc_total then
    raise exception '항목 합계가 서버 계산과 일치하지 않습니다.';
  end if;

  if v_client_lx <> v_calc_lx then
    raise exception 'LX 할인금액이 서버 계산과 일치하지 않습니다.';
  end if;

  v_calc_final := greatest(0, v_calc_total - v_discount - v_calc_lx);

  if v_client_final <> v_calc_final then
    raise exception '최종금액이 서버 계산과 일치하지 않습니다.';
  end if;

  -- 특별할인만 총액 초과는 거부 (앱 resolveQuoteAmounts 와 동일; final은 0 클램프)
  if v_discount > v_calc_total then
    raise exception '특별할인금액이 총견적금액을 초과할 수 없습니다.';
  end if;

  -- 회사 VAT 기본값
  select c.quote_vat_input_mode, c.quote_vat_rate
    into v_company_vat_mode, v_company_vat_rate
  from public.companies c
  where c.id = v_company_id;

  v_company_vat_mode := coalesce(nullif(trim(v_company_vat_mode), ''), 'exclusive');
  if v_company_vat_mode not in ('exclusive', 'inclusive') then
    v_company_vat_mode := 'exclusive';
  end if;
  v_company_vat_rate := coalesce(v_company_vat_rate, 10);
  if v_company_vat_rate < 0 or v_company_vat_rate > 100 then
    v_company_vat_rate := 10;
  end if;

  -- VAT 키: 0개(회사 상속) 또는 5개(견적 예외+검증). 부분 키 거부.
  -- 신규 견적: vat_mode 는 exclusive|inclusive 만 (legacy null 불가)
  if p_header ? 'vat_mode' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'vat_rate' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'supply_amount' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'vat_amount' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'customer_total_amount' then v_vat_key_count := v_vat_key_count + 1; end if;

  if v_vat_key_count not in (0, 5) then
    raise exception
      '부가세 필드(vat_mode, vat_rate, supply_amount, vat_amount, customer_total_amount)는 모두 함께 전달해야 합니다.';
  end if;

  v_vat_provided := (v_vat_key_count = 5);

  if v_vat_provided then
    v_vat_mode := nullif(trim(p_header->>'vat_mode'), '');
    if v_vat_mode is null or v_vat_mode not in ('exclusive', 'inclusive') then
      raise exception '부가세 입력 방식이 올바르지 않습니다.';
    end if;

    begin
      v_vat_rate := nullif(trim(p_header->>'vat_rate'), '')::numeric;
    exception when others then
      raise exception '부가세율이 올바르지 않습니다.';
    end;
    if v_vat_rate is null or v_vat_rate < 0 or v_vat_rate > 100 then
      raise exception '부가세율은 0~100 사이여야 합니다.';
    end if;

    v_app_supply_amount := greatest(
      0,
      round(coalesce(nullif(p_header->>'supply_amount', '')::numeric, 0))
    );
    v_app_vat_amount := greatest(
      0,
      round(coalesce(nullif(p_header->>'vat_amount', '')::numeric, 0))
    );
    v_app_customer_total_amount := greatest(
      0,
      round(coalesce(nullif(p_header->>'customer_total_amount', '')::numeric, 0))
    );
  else
    v_vat_mode := v_company_vat_mode;
    v_vat_rate := v_company_vat_rate;
  end if;

  -- SQL VAT 계산 (서버 final 기준; 앱 금액 미신뢰)
  if v_vat_mode = 'exclusive' then
    v_supply_amount := v_calc_final;
    if coalesce(v_vat_rate, 0) = 0 then
      v_vat_amount := 0;
    else
      v_vat_amount := greatest(0, round((v_supply_amount * v_vat_rate) / 100.0));
    end if;
    v_customer_total_amount := v_supply_amount + v_vat_amount;
  else
    -- inclusive
    v_customer_total_amount := v_calc_final;
    if coalesce(v_vat_rate, 0) = 0 then
      v_supply_amount := v_customer_total_amount;
    else
      v_supply_amount := greatest(
        0,
        round(v_customer_total_amount / (1 + (v_vat_rate / 100.0)))
      );
    end if;
    v_vat_amount := v_customer_total_amount - v_supply_amount;
  end if;

  if v_customer_total_amount <> v_supply_amount + v_vat_amount then
    raise exception '부가세 금액 계산이 일치하지 않습니다.';
  end if;

  if v_vat_provided then
    if v_app_supply_amount <> v_supply_amount
       or v_app_vat_amount <> v_vat_amount
       or v_app_customer_total_amount <> v_customer_total_amount then
      raise exception
        '부가세 금액이 서버 계산과 일치하지 않습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.';
    end if;
  end if;

  -- Idempotency fingerprint (정규화된 헤더·항목)
  v_canonical := jsonb_build_array(
    v_company_id,
    v_customer_id,
    v_project_id,
    v_title,
    v_quote_type,
    v_quote_mode,
    v_status,
    v_calc_total,
    v_discount,
    v_lx_rate_clamped,
    v_calc_lx,
    v_calc_final,
    v_vat_mode,
    v_vat_rate,
    v_supply_amount,
    v_vat_amount,
    v_customer_total_amount,
    v_valid_until,
    v_issued_at,
    v_assigned_employee_id,
    v_is_lx_material,
    v_is_contract_quote,
    v_memo,
    v_customer_message,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            nullif(trim(n.elem->>'id'), ''),
            coalesce(nullif(trim(n.elem->>'trade_name'), ''), '미분류'),
            nullif(trim(n.elem->>'item_name'), ''),
            nullif(trim(n.elem->>'description'), ''),
            nullif(left(trim(coalesce(n.elem->>'remark', '')), 500), ''),
            nullif(n.elem->>'quantity', '')::numeric,
            nullif(trim(n.elem->>'unit'), ''),
            greatest(0, round(coalesce(nullif(n.elem->>'unit_price', '')::numeric, 0))),
            n.amount,
            n.cost_type_norm,
            n.is_lx,
            n.lx_base,
            n.lx_type,
            n.lx_value,
            coalesce(nullif(n.elem->>'sort_order', '')::integer, n.ord::integer - 1)
          )
          order by n.ord
        ),
        '[]'::jsonb
      )
      from (
        select
          t.elem,
          t.ord,
          greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0))) as amount,
          case
            when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
            when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
              then nullif(trim(t.elem->>'cost_type'), '')
            else '기타'
          end as cost_type_norm,
          case
            when (
              case
                when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
                when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                  then nullif(trim(t.elem->>'cost_type'), '')
                else '기타'
              end
            ) in ('자재', '시공+자재')
              then coalesce((t.elem->>'is_lx_material')::boolean, false)
            else false
          end as is_lx,
          case
            when not (
              case
                when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
                when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                  then nullif(trim(t.elem->>'cost_type'), '')
                else '기타'
              end
            ) in ('자재', '시공+자재')
              or not coalesce((t.elem->>'is_lx_material')::boolean, false)
            then 0::numeric
            when (
              case
                when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
                when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                  then nullif(trim(t.elem->>'cost_type'), '')
                else '기타'
              end
            ) = '자재'
            then greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0)))
            else least(
              greatest(0, round(coalesce(nullif(t.elem->>'lx_discount_base_amount', '')::numeric, 0))),
              greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0)))
            )
          end as lx_base,
          case
            when nullif(trim(t.elem->>'lx_discount_type'), '') in ('none', 'rate', 'fixed')
              then nullif(trim(t.elem->>'lx_discount_type'), '')
            else null
          end as lx_type,
          nullif(t.elem->>'lx_discount_value', '')::numeric as lx_value
        from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
      ) n
    )
  );

  v_hash := encode(
    extensions.digest(convert_to(v_canonical::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- 헤더 INSERT: idempotency 는 (company_id, created_by, create_request_id) 부분 unique index 기반.
  -- INSERT ... ON CONFLICT DO NOTHING — advisory lock 불필요 (DB 제약이 원자성 보장).
  insert into public.quotes (
    company_id,
    customer_id,
    project_id,
    quote_type,
    quote_mode,
    title,
    quote_number,
    version_number,
    status,
    total_amount,
    discount_amount,
    lx_discount_rate,
    lx_discount_amount,
    final_amount,
    vat_mode,
    vat_rate,
    supply_amount,
    vat_amount,
    customer_total_amount,
    valid_until,
    issued_at,
    assigned_employee_id,
    is_lx_material,
    is_contract_quote,
    customer_message,
    memo,
    create_request_id,
    create_request_hash,
    created_by,
    updated_by
  )
  values (
    v_company_id,
    v_customer_id,
    v_project_id,
    v_quote_type,
    v_quote_mode,
    v_title,
    v_quote_number,
    1,
    v_status,
    v_calc_total,
    v_discount,
    v_lx_rate_clamped,
    v_calc_lx,
    v_calc_final,
    v_vat_mode,
    v_vat_rate,
    v_supply_amount,
    v_vat_amount,
    v_customer_total_amount,
    v_valid_until,
    v_issued_at,
    v_assigned_employee_id,
    v_is_lx_material,
    false, -- 계약전환은 INSERT 성공 후 별도 처리
    v_customer_message,
    v_memo,
    v_request_id,
    v_hash,
    v_uid,
    v_uid
  )
  on conflict (company_id, created_by, create_request_id)
  where create_request_id is not null and deleted_at is null
  do nothing
  returning id
  into v_quote_id;

  if v_quote_id is not null then
    -- 새로 생성됨: 항목 set-based INSERT (client-provided id 보존; 다른 견적 항목은 절대 건드리지 않음)
    insert into public.quote_items (
      id,
      quote_id,
      company_id,
      trade_name,
      item_name,
      description,
      remark,
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
      coalesce(nullif(trim(n.elem->>'id'), '')::uuid, gen_random_uuid()),
      v_quote_id,
      v_company_id,
      coalesce(nullif(trim(n.elem->>'trade_name'), ''), '미분류'),
      nullif(trim(n.elem->>'item_name'), ''),
      nullif(trim(n.elem->>'description'), ''),
      nullif(left(trim(coalesce(n.elem->>'remark', '')), 500), ''),
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
    ) n
    order by n.ord;

    if v_is_contract_quote then
      update public.quotes
      set is_contract_quote = false
      where company_id = v_company_id
        and customer_id = v_customer_id
        and deleted_at is null
        and id <> v_quote_id
        and is_contract_quote = true;

      update public.quotes
      set is_contract_quote = true,
          status = '계약전환'
      where id = v_quote_id;
    end if;

    return jsonb_build_object(
      'quote_id', v_quote_id,
      'customer_id', v_customer_id,
      'company_id', v_company_id,
      'outcome', 'created',
      'total_amount', v_calc_total,
      'discount_amount', v_discount,
      'lx_discount_amount', v_calc_lx,
      'final_amount', v_calc_final,
      'vat_mode', v_vat_mode,
      'vat_rate', v_vat_rate,
      'supply_amount', v_supply_amount,
      'vat_amount', v_vat_amount,
      'customer_total_amount', v_customer_total_amount
    );
  end if;

  -- 충돌(동일 요청 재시도/재제출): 기존 행 조회 후 fingerprint 검증.
  -- 항목 재삽입 없음, 계약전환 재적용 없음.
  select
    q.id,
    q.customer_id,
    q.create_request_hash,
    q.total_amount,
    q.discount_amount,
    q.lx_discount_amount,
    q.final_amount,
    q.vat_mode,
    q.vat_rate,
    q.supply_amount,
    q.vat_amount,
    q.customer_total_amount
  into
    v_quote_id,
    v_row_customer_id,
    v_existing_hash,
    v_row_total,
    v_row_discount,
    v_row_lx,
    v_row_final,
    v_row_vat_mode,
    v_row_vat_rate,
    v_row_supply,
    v_row_vat_amount,
    v_row_customer_total
  from public.quotes q
  where q.company_id = v_company_id
    and q.created_by = v_uid
    and q.create_request_id = v_request_id
    and q.deleted_at is null;

  if not found then
    raise exception '견적 생성 요청을 처리하지 못했습니다. 다시 시도해 주세요.';
  end if;

  if v_existing_hash is distinct from v_hash then
    raise exception '동일한 생성 요청 ID로 다른 내용의 견적이 이미 있습니다.';
  end if;

  return jsonb_build_object(
    'quote_id', v_quote_id,
    'customer_id', v_row_customer_id,
    'company_id', v_company_id,
    'outcome', 'replayed',
    'total_amount', v_row_total,
    'discount_amount', v_row_discount,
    'lx_discount_amount', v_row_lx,
    'final_amount', v_row_final,
    'vat_mode', v_row_vat_mode,
    'vat_rate', v_row_vat_rate,
    'supply_amount', v_row_supply,
    'vat_amount', v_row_vat_amount,
    'customer_total_amount', v_row_customer_total
  );
end;
$$;

comment on function public.create_quote_with_items(jsonb, jsonb) is
  '견적 헤더+항목 원자적 생성. 서버 금액·VAT 재계산. INSERT ON CONFLICT 기반 create_request_id idempotency.
   결과는 slim(outcome: created|replayed). quote_items.updated_at 미사용.';

revoke all on function public.create_quote_with_items(jsonb, jsonb) from public;
revoke all on function public.create_quote_with_items(jsonb, jsonb) from anon;
grant execute on function public.create_quote_with_items(jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- C) 견적 + 항목 원자적 수정 (signature 동일, 서버 재계산·검증 추가)
-- -----------------------------------------------------------------------------
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
  v_client_total bigint;
  v_discount_amount bigint;
  v_client_lx bigint;
  v_client_final bigint;
  v_lx_discount_rate numeric;
  v_lx_rate_clamped numeric;
  v_calc_total bigint;
  v_calc_lx bigint;
  v_calc_lx_base bigint;
  v_calc_final bigint;
  v_is_lx_material boolean;
  v_memo text;
  v_customer_message text;
  v_invalid_cost integer;
  v_invalid_lx_base integer;
  v_invalid_lx_rate integer;
  v_vat_key_count integer := 0;
  v_vat_provided boolean := false;
  v_vat_mode text;
  v_vat_rate numeric;
  v_existing_vat_mode text;
  v_existing_vat_rate numeric;
  v_supply_amount bigint;
  v_vat_amount bigint;
  v_customer_total_amount bigint;
  v_app_supply_amount bigint;
  v_app_vat_amount bigint;
  v_app_customer_total_amount bigint;
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

  -- 2) quote 행 FOR UPDATE + 권한 (+ 기존 VAT snapshot)
  select q.company_id, q.deleted_at, q.vat_mode, q.vat_rate
    into v_company_id, v_quote_deleted_at, v_existing_vat_mode, v_existing_vat_rate
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
  if v_project_id is not null
     and not exists (
       select 1
       from public.projects p
       where p.id = v_project_id
         and p.company_id = v_company_id
         and p.deleted_at is null
     ) then
    raise exception '현재 회사에 속한 프로젝트가 아닙니다.';
  end if;

  begin
    v_assigned_employee_id := nullif(trim(p_header->>'assigned_employee_id'), '')::uuid;
  exception when others then
    raise exception '담당자 ID가 올바르지 않습니다.';
  end;
  if v_assigned_employee_id is not null
     and not exists (
       select 1
       from public.employees e
       where e.id = v_assigned_employee_id
         and e.company_id = v_company_id
         and e.is_active = true
     ) then
    raise exception '현재 회사의 활성 담당자가 아닙니다.';
  end if;

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

  -- 4) 클라이언트 금액 (검증용; 저장은 서버 재계산값). 음수·비정상 값은 거부.
  begin
    v_client_total := round(coalesce(nullif(p_header->>'total_amount', '')::numeric, 0));
    v_discount_amount := round(coalesce(nullif(p_header->>'discount_amount', '')::numeric, 0));
    v_client_lx := round(coalesce(nullif(p_header->>'lx_discount_amount', '')::numeric, 0));
    v_client_final := round(coalesce(nullif(p_header->>'final_amount', '')::numeric, 0));
    v_lx_discount_rate := coalesce(nullif(p_header->>'lx_discount_rate', '')::numeric, 0);
  exception when others then
    raise exception '견적 금액 형식이 올바르지 않습니다.';
  end;
  if v_client_total < 0 or v_discount_amount < 0 or v_client_lx < 0 or v_client_final < 0 then
    raise exception '견적 금액·할인 값은 0 이상이어야 합니다.';
  end if;
  if v_lx_discount_rate < 0 or v_lx_discount_rate > 100 then
    raise exception 'LX 자재 할인율은 0~100 사이여야 합니다.';
  end if;
  v_lx_rate_clamped := least(100, greatest(0, round(v_lx_discount_rate::numeric, 2)));

  v_memo := nullif(p_header->>'memo', '');
  v_customer_message := nullif(p_header->>'customer_message', '');

  v_removed := coalesce(p_removed_item_ids, '{}'::uuid[]);

  -- 5) 항목 ID 집합 검증 (데이터 변경 전)
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

  -- 6) cost_type / LX 필드 사전 검증 (정규화 후)
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

  select count(*)::integer into v_invalid_lx_rate
  from jsonb_array_elements(p_items) elem
  where nullif(trim(elem->>'lx_discount_type'), '') = 'fixed'
    and coalesce(nullif(elem->>'lx_discount_value', '')::numeric, 0) < 0;
  if v_invalid_lx_rate > 0 then
    raise exception 'LX 정액 할인은 0 이상이어야 합니다.';
  end if;

  select count(*)::integer into v_invalid_lx_rate
  from jsonb_array_elements(p_items) elem
  where coalesce(nullif(elem->>'amount', '')::numeric, 0) < 0
     or coalesce(nullif(elem->>'unit_price', '')::numeric, 0) < 0
     or coalesce(nullif(elem->>'lx_discount_base_amount', '')::numeric, 0) < 0;
  if v_invalid_lx_rate > 0 then
    raise exception '항목 금액·단가·LX 대상금액은 0 이상이어야 합니다.';
  end if;

  -- 7) SERVER 재계산 (create_quote_with_items 와 동일 수식; 클라이언트 값은 검증만)
  select
    coalesce(sum(n.amount), 0)::bigint,
    coalesce(sum(n.item_lx_discount), 0)::bigint,
    coalesce(sum(n.lx_base), 0)::bigint,
    coalesce(bool_or(n.is_lx), false)
  into v_calc_total, v_calc_lx, v_calc_lx_base, v_is_lx_material
  from (
    select
      c.amount,
      c.is_lx,
      c.lx_base,
      case
        when c.lx_base <= 0 then 0::numeric
        when c.lx_type = 'none' then 0::numeric
        when c.lx_type = 'rate' then
          round(
            c.lx_base
            * least(
              100,
              greatest(
                0,
                round(coalesce(c.lx_value, 0)::numeric, 2)
              )
            )
            / 100.0
          )
        when c.lx_type = 'fixed' then
          least(c.lx_base, greatest(0, round(coalesce(c.lx_value, 0)::numeric)))
        else
          round(c.lx_base * v_lx_rate_clamped / 100.0)
      end as item_lx_discount
    from (
      select
        greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0))) as amount,
        case
          when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
          when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
            then nullif(trim(t.elem->>'cost_type'), '')
          else '기타'
        end as cost_type_norm,
        case
          when (
            case
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                then nullif(trim(t.elem->>'cost_type'), '')
              else '기타'
            end
          ) in ('자재', '시공+자재')
            then coalesce((t.elem->>'is_lx_material')::boolean, false)
          else false
        end as is_lx,
        case
          when not (
            case
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                then nullif(trim(t.elem->>'cost_type'), '')
              else '기타'
            end
          ) in ('자재', '시공+자재')
            or not coalesce((t.elem->>'is_lx_material')::boolean, false)
          then 0::numeric
          when (
            case
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재+시공', '시공+자재') then '시공+자재'
              when nullif(trim(t.elem->>'cost_type'), '') in ('자재', '시공', '기타')
                then nullif(trim(t.elem->>'cost_type'), '')
              else '기타'
            end
          ) = '자재'
          then greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0)))
          else least(
            greatest(0, round(coalesce(nullif(t.elem->>'lx_discount_base_amount', '')::numeric, 0))),
            greatest(0, round(coalesce(nullif(t.elem->>'amount', '')::numeric, 0)))
          )
        end as lx_base,
        case
          when nullif(trim(t.elem->>'lx_discount_type'), '') in ('none', 'rate', 'fixed')
            then nullif(trim(t.elem->>'lx_discount_type'), '')
          else null
        end as lx_type,
        nullif(t.elem->>'lx_discount_value', '')::numeric as lx_value
      from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
    ) c
  ) n;

  if v_client_total <> v_calc_total then
    raise exception '항목 합계가 서버 계산과 일치하지 않습니다.';
  end if;

  if v_client_lx <> v_calc_lx then
    raise exception 'LX 할인금액이 서버 계산과 일치하지 않습니다.';
  end if;

  v_calc_final := greatest(0, v_calc_total - v_discount_amount - v_calc_lx);

  if v_client_final <> v_calc_final then
    raise exception '최종금액이 서버 계산과 일치하지 않습니다.';
  end if;

  if v_discount_amount > v_calc_total then
    raise exception '특별할인금액이 총견적금액을 초과할 수 없습니다.';
  end if;

  -- 8) VAT snapshot
  --    키 0개: 기존 vat_mode/rate + 새 calc_final 로 SQL 재계산
  --    키 5개: SQL 계산 후 앱 금액 검증
  --    키 1~4개: 예외(전체 rollback)
  v_vat_key_count := 0;
  if p_header ? 'vat_mode' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'vat_rate' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'supply_amount' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'vat_amount' then v_vat_key_count := v_vat_key_count + 1; end if;
  if p_header ? 'customer_total_amount' then v_vat_key_count := v_vat_key_count + 1; end if;

  if v_vat_key_count not in (0, 5) then
    raise exception
      '부가세 필드(vat_mode, vat_rate, supply_amount, vat_amount, customer_total_amount)는 모두 함께 전달해야 합니다.';
  end if;

  v_vat_provided := (v_vat_key_count = 5);

  if v_vat_provided then
    v_vat_mode := nullif(trim(p_header->>'vat_mode'), '');
    if v_vat_mode is not null and v_vat_mode not in ('exclusive', 'inclusive') then
      raise exception '부가세 입력 방식이 올바르지 않습니다.';
    end if;

    begin
      v_vat_rate := nullif(trim(p_header->>'vat_rate'), '')::numeric;
    exception when others then
      raise exception '부가세율이 올바르지 않습니다.';
    end;
    if v_vat_rate is not null and (v_vat_rate < 0 or v_vat_rate > 100) then
      raise exception '부가세율은 0~100 사이여야 합니다.';
    end if;

    if v_vat_mode in ('exclusive', 'inclusive') and v_vat_rate is null then
      raise exception '부가세율이 필요합니다.';
    end if;

    v_app_supply_amount := greatest(
      0,
      round(coalesce(nullif(p_header->>'supply_amount', '')::numeric, 0))
    );
    v_app_vat_amount := greatest(
      0,
      round(coalesce(nullif(p_header->>'vat_amount', '')::numeric, 0))
    );
    v_app_customer_total_amount := greatest(
      0,
      round(coalesce(nullif(p_header->>'customer_total_amount', '')::numeric, 0))
    );
  else
    -- legacy/기존 앱: 저장된 snapshot 모드·세율 유지, 금액만 서버 계산 final 기준으로 재계산
    v_vat_mode := nullif(trim(v_existing_vat_mode), '');
    if v_vat_mode is not null and v_vat_mode not in ('exclusive', 'inclusive') then
      v_vat_mode := null;
    end if;
    v_vat_rate := v_existing_vat_rate;
    if v_vat_mode in ('exclusive', 'inclusive')
       and (v_vat_rate is null or v_vat_rate < 0 or v_vat_rate > 100) then
      v_vat_rate := 10;
    end if;
    if v_vat_mode is null then
      v_vat_rate := null;
    end if;
  end if;

  -- SQL 단일 계산 (앱 금액을 신뢰하지 않음; 서버 calc_final 기준)
  if v_vat_mode is null then
    -- legacy: 공급가=고객최종=final, 부가세=0
    v_supply_amount := v_calc_final;
    v_vat_amount := 0;
    v_customer_total_amount := v_calc_final;
    v_vat_rate := null;
  elsif v_vat_mode = 'exclusive' then
    v_supply_amount := v_calc_final;
    if coalesce(v_vat_rate, 0) = 0 then
      v_vat_amount := 0;
    else
      v_vat_amount := greatest(0, round((v_supply_amount * v_vat_rate) / 100.0));
    end if;
    v_customer_total_amount := v_supply_amount + v_vat_amount;
  else
    -- inclusive
    v_customer_total_amount := v_calc_final;
    if coalesce(v_vat_rate, 0) = 0 then
      v_supply_amount := v_customer_total_amount;
    else
      v_supply_amount := greatest(
        0,
        round(v_customer_total_amount / (1 + (v_vat_rate / 100.0)))
      );
    end if;
    v_vat_amount := v_customer_total_amount - v_supply_amount;
  end if;

  if v_customer_total_amount <> v_supply_amount + v_vat_amount then
    raise exception '부가세 금액 계산이 일치하지 않습니다.';
  end if;

  if v_vat_provided then
    if v_app_supply_amount <> v_supply_amount
       or v_app_vat_amount <> v_vat_amount
       or v_app_customer_total_amount <> v_customer_total_amount then
      raise exception
        '부가세 금액이 서버 계산과 일치하지 않습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.';
    end if;
  end if;

  -- 9) 헤더 UPDATE (quotes.updated_at 유지). 금액·VAT 는 항상 SQL 계산 결과로 저장 (앱 값은 검증만)
  update public.quotes q
  set
    project_id = v_project_id,
    quote_type = v_quote_type,
    quote_mode = v_quote_mode,
    title = v_title,
    status = v_status,
    total_amount = v_calc_total,
    discount_amount = v_discount_amount,
    lx_discount_rate = v_lx_rate_clamped,
    lx_discount_amount = v_calc_lx,
    final_amount = v_calc_final,
    valid_until = v_valid_until,
    issued_at = v_issued_at,
    assigned_employee_id = v_assigned_employee_id,
    is_lx_material = v_is_lx_material,
    memo = v_memo,
    customer_message = v_customer_message,
    vat_mode = v_vat_mode,
    vat_rate = v_vat_rate,
    supply_amount = v_supply_amount,
    vat_amount = v_vat_amount,
    customer_total_amount = v_customer_total_amount,
    updated_by = v_uid,
    updated_at = now()
  where q.id = p_quote_id
    and q.deleted_at is null;

  get diagnostics v_header_updated = row_count;
  if v_header_updated <> 1 then
    raise exception '견적 수정에 실패했습니다.';
  end if;

  -- 10) 기존 항목 batch UPDATE (quote_items.updated_at 미사용)
  if coalesce(cardinality(v_incoming_ids), 0) > 0 then
    update public.quote_items i
    set
      trade_name = coalesce(nullif(trim(p.trade_name), ''), '미분류'),
      item_name = nullif(trim(p.item_name), ''),
      description = nullif(trim(p.description), ''),
      remark = nullif(left(trim(coalesce(p.remark, '')), 500), ''),
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
        elem->>'remark' as remark,
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

  -- 11) 신규 항목 set-based INSERT (id/created_at 은 테이블 DEFAULT 가능, updated_at 미사용)
  insert into public.quote_items (
    quote_id,
    company_id,
    trade_name,
    item_name,
    description,
    remark,
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
    nullif(left(trim(coalesce(n.elem->>'remark', '')), 500), ''),
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

  -- 12) 명시된 removed ID만 batch soft-delete (quote_items.updated_at 미사용)
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

  -- 13) 최종 활성 항목 수 > 0
  select count(*)::integer into v_active_after
  from public.quote_items i
  where i.quote_id = p_quote_id
    and i.deleted_at is null;

  if v_active_after <= 0 then
    raise exception '견적 항목은 1개 이상 필요합니다.';
  end if;

  -- 14) 결과 반환
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'trade_name', i.trade_name,
        'item_name', i.item_name,
        'description', i.description,
        'remark', i.remark,
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
    'total_amount', v_calc_total,
    'discount_amount', v_discount_amount,
    'lx_discount_amount', v_calc_lx,
    'final_amount', v_calc_final,
    'vat_mode', v_vat_mode,
    'vat_rate', v_vat_rate,
    'supply_amount', v_supply_amount,
    'vat_amount', v_vat_amount,
    'customer_total_amount', v_customer_total_amount
  );
end;
$$;

comment on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) is
  '견적 헤더+항목 원자적 수정. 항목 기준 서버 금액 재계산·검증(특별할인 초과 거부 포함). VAT는 SQL 계산(앱 금액 검증).
   부분 VAT 키는 거부. quote_items.updated_at 미사용.';

revoke all on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) from public;
revoke all on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.update_quote_with_items(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- D) 고객 공유: VAT snapshot 최소 노출 (토큰 필수, 권한 범위 동일)
-- -----------------------------------------------------------------------------
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
  where q.share_token = p_token
    and q.deleted_at is null
    and c.deleted_at is null;

  return result;
end;
$$;

comment on function public.get_quote_share_by_token(uuid) is
  '고객 공유 토큰 조회. VAT snapshot 필드 포함. 토큰 없으면 null.';

revoke all on function public.get_quote_share_by_token(uuid) from public;
grant execute on function public.get_quote_share_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
