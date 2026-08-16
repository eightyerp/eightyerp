-- =============================================================================
-- Eighty ERP — 견적 project/customer 무결성 + 점검·상담 source 원자 연결
--
-- 범위:
--   1) 모든 quotes INSERT/UPDATE에서 project.company/customer 일치 강제
--   2) 연결된 workflow source와 customer/project/company 영구 ID 불변
--   3) 견적 헤더+항목+inspection/consultation source를 단일 RPC transaction으로 저장
--
-- 안전:
--   - 기존 적용 migration 수정 없음
--   - 테이블/컬럼 추가·삭제 및 기존 행 자동 보정 없음
--   - 기존 활성 행이 잘못 연결돼 있으면 적용을 중단하고 수동 검토
-- =============================================================================

begin;

do $preflight$
begin
  if exists (
    select 1
    from public.quotes q
    left join public.projects p on p.id = q.project_id
    where q.deleted_at is null
      and q.project_id is not null
      and (
        p.id is null
        or p.company_id is distinct from q.company_id
        or p.customer_id is distinct from q.customer_id
        or p.deleted_at is not null
      )
  ) then
    raise exception
      'existing quote/project identity mismatch requires review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.quotes q
    where q.deleted_at is null
      and (
        (q.source_consultation_id is null)
        <> (q.source_inspection_id is null)
        or (
          q.source_consultation_id is not null
          and not exists (
            select 1
            from public.window_inspections wi
            join public.customer_consult_logs cl
              on cl.id = q.source_consultation_id
             and cl.company_id = wi.company_id
             and cl.customer_id = wi.customer_id
             and cl.source_project_id = wi.project_id
             and cl.source_inspection_id = wi.id
            where wi.id = q.source_inspection_id
              and wi.company_id = q.company_id
              and wi.customer_id = q.customer_id
              and wi.project_id = q.project_id
          )
        )
      )
  ) then
    raise exception
      'existing quote workflow source mismatch requires review'
      using errcode = '23514';
  end if;
end;
$preflight$;

create or replace function public.validate_quote_project_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.project_id is not null
     and not exists (
       select 1
       from public.projects p
       where p.id = new.project_id
         and p.company_id = new.company_id
         and p.customer_id = new.customer_id
         and p.deleted_at is null
     ) then
    raise exception '견적과 현장 연결 정보가 올바르지 않습니다.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

comment on function public.validate_quote_project_identity() is
  'quotes.project_id는 같은 company_id/customer_id의 활성 현장만 허용한다.';

drop trigger if exists quotes_00_validate_project_identity on public.quotes;
create trigger quotes_00_validate_project_identity
before insert or update of project_id, company_id, customer_id
on public.quotes
for each row execute function public.validate_quote_project_identity();

revoke all on function public.validate_quote_project_identity()
from public, anon, authenticated, service_role;

create or replace function public.lock_quote_workflow_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.source_consultation_id is not null
     or old.source_inspection_id is not null then
    if new.company_id is distinct from old.company_id
       or new.customer_id is distinct from old.customer_id
       or new.project_id is distinct from old.project_id
       or new.source_consultation_id
            is distinct from old.source_consultation_id
       or new.source_inspection_id
            is distinct from old.source_inspection_id then
      raise exception '이미 연결된 점검·상담 이력은 변경할 수 없습니다.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.lock_quote_workflow_source() is
  'source가 연결된 quote의 company/customer/project/consultation/inspection 영구 ID 변경을 차단한다.';

drop trigger if exists quotes_01_lock_workflow_source on public.quotes;
create trigger quotes_01_lock_workflow_source
before update of
  company_id,
  customer_id,
  project_id,
  source_consultation_id,
  source_inspection_id
on public.quotes
for each row execute function public.lock_quote_workflow_source();

revoke all on function public.lock_quote_workflow_source()
from public, anon, authenticated, service_role;

create or replace function public.create_quote_with_workflow_context(
  p_header jsonb,
  p_items jsonb,
  p_source_consultation_id uuid,
  p_source_inspection_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_quote_id uuid;
  v_result jsonb;
  v_outcome text;
  v_row_company_id uuid;
  v_row_customer_id uuid;
  v_row_project_id uuid;
  v_row_created_by uuid;
  v_existing_consultation_id uuid;
  v_existing_inspection_id uuid;
  v_updated integer;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.';
  end if;

  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception '견적 정보가 올바르지 않습니다.';
  end if;

  if p_source_consultation_id is null
     or p_source_inspection_id is null then
    raise exception '점검·상담 연결 정보가 필요합니다.';
  end if;

  begin
    v_customer_id := nullif(btrim(p_header->>'customer_id'), '')::uuid;
    v_project_id := nullif(btrim(p_header->>'project_id'), '')::uuid;
  exception when others then
    raise exception '견적 연결 ID가 올바르지 않습니다.';
  end;

  if v_customer_id is null or v_project_id is null then
    raise exception '고객과 현장 정보가 필요합니다.';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null
     or not coalesce(public.is_company_member(v_company_id), false) then
    raise exception '회사 권한을 확인할 수 없습니다.';
  end if;

  if not (
    coalesce(public.is_admin(), false)
    or coalesce(public.can_access_customer(v_customer_id), false)
  ) then
    raise exception '이 고객의 견적을 등록할 권한이 없습니다.';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = v_project_id
      and p.company_id = v_company_id
      and p.customer_id = v_customer_id
      and p.deleted_at is null
  ) then
    raise exception '견적과 현장 연결 정보가 올바르지 않습니다.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.window_inspections wi
    join public.customer_consult_logs cl
      on cl.id = p_source_consultation_id
     and cl.company_id = wi.company_id
     and cl.customer_id = wi.customer_id
     and cl.source_project_id = wi.project_id
     and cl.source_inspection_id = wi.id
    where wi.id = p_source_inspection_id
      and wi.company_id = v_company_id
      and wi.customer_id = v_customer_id
      and wi.project_id = v_project_id
  ) then
    raise exception '점검·상담 연결 정보가 올바르지 않습니다.'
      using errcode = '23514';
  end if;

  -- 기존 원자 생성 RPC와 source UPDATE가 이 함수 호출 한 transaction에 포함된다.
  v_result := public.create_quote_with_items(p_header, p_items);

  begin
    v_quote_id := nullif(btrim(v_result->>'quote_id'), '')::uuid;
  exception when others then
    raise exception '견적 생성 결과가 올바르지 않습니다.';
  end;

  v_outcome := v_result->>'outcome';
  if v_quote_id is null or v_outcome not in ('created', 'replayed') then
    raise exception '견적 생성 결과가 올바르지 않습니다.';
  end if;

  select
    q.company_id,
    q.customer_id,
    q.project_id,
    q.created_by,
    q.source_consultation_id,
    q.source_inspection_id
  into
    v_row_company_id,
    v_row_customer_id,
    v_row_project_id,
    v_row_created_by,
    v_existing_consultation_id,
    v_existing_inspection_id
  from public.quotes q
  where q.id = v_quote_id
    and q.deleted_at is null
  for update;

  if not found
     or v_row_company_id is distinct from v_company_id
     or v_row_customer_id is distinct from v_customer_id
     or v_row_project_id is distinct from v_project_id
     or v_row_created_by is distinct from v_uid then
    raise exception '생성된 견적의 연결 정보를 확인할 수 없습니다.';
  end if;

  if v_outcome = 'replayed' then
    if v_existing_consultation_id
         is distinct from p_source_consultation_id
       or v_existing_inspection_id
         is distinct from p_source_inspection_id then
      raise exception
        '동일 생성 요청의 점검·상담 연결 정보가 일치하지 않습니다.'
        using errcode = '23514';
    end if;

    return v_result || jsonb_build_object(
      'source_consultation_id', v_existing_consultation_id,
      'source_inspection_id', v_existing_inspection_id
    );
  end if;

  if v_existing_consultation_id is not null
     or v_existing_inspection_id is not null then
    raise exception '신규 견적의 연결 상태가 올바르지 않습니다.';
  end if;

  update public.quotes q
  set
    source_consultation_id = p_source_consultation_id,
    source_inspection_id = p_source_inspection_id,
    updated_by = v_uid,
    updated_at = now()
  where q.id = v_quote_id
    and q.company_id = v_company_id
    and q.customer_id = v_customer_id
    and q.project_id = v_project_id
    and q.created_by = v_uid
    and q.source_consultation_id is null
    and q.source_inspection_id is null;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception '견적 업무 연결을 저장하지 못했습니다.';
  end if;

  -- quotes_validate_window_chain trigger가 최종 source chain을 재검증한다.
  return v_result || jsonb_build_object(
    'source_consultation_id', p_source_consultation_id,
    'source_inspection_id', p_source_inspection_id
  );
end;
$function$;

comment on function public.create_quote_with_workflow_context(
  jsonb,
  jsonb,
  uuid,
  uuid
) is
  '견적 헤더+항목+project/inspection/consultation source를 단일 DB transaction으로 생성한다.';

revoke all on function public.create_quote_with_workflow_context(
  jsonb,
  jsonb,
  uuid,
  uuid
) from public, anon, service_role;

grant execute on function public.create_quote_with_workflow_context(
  jsonb,
  jsonb,
  uuid,
  uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;
