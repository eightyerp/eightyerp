-- =============================================================================
-- Migration 41 적용 후 검증 SQL (읽기·ROLLBACK 전용)
-- 대상: 20260803000041_contract_lifecycle.sql (이미 적용됨 — 재적용 금지)
--
-- ※ 대표 실행용 최신 경로:
--    supabase/verification/20260803000042_contract_lifecycle_verify.sql
-- 이 파일은 동일 내용의 호환 복사본입니다.
--
-- 스키마 근거:
--   customers: migrations/20260716000000 + company_id(20260803000010)
--             + types/database.ts Customer / CustomerInsert
--             → created_by / updated_by 없음
--   projects:  migrations/20260722000001 + company_id(20260803000011)
--   contracts / execution_budgets / RPCs: Migration 38 + 41
--
-- 포함:
--   A) 테이블·컬럼·인덱스·제약·RLS·RPC·권한 구조 검증
--   B) BEGIN~ROLLBACK 생애주기 (초안수정→확정→변경→추가→해지→복구)
--   C) ROLLBACK 후 임시 데이터 0건 확인
--
-- 금지: COMMIT, 운영 행 UPDATE/DELETE, 새 migration, Migration 41 수정
-- 금액 공식(RPC와 동일): contract_amount = supply_amount - discount_amount + vat_amount
--
-- 실행: Supabase SQL Editor에 이 파일 전체 1회 Run
-- 오류 시: 트랜잭션 aborted 면 `ROLLBACK;` 만 추가 실행 후 재실행
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) 구조 검증
-- ---------------------------------------------------------------------------
with expected_cols as (
  select unnest(array[
    'root_contract_id','parent_contract_id','contract_kind','revision_seq',
    'title','scope_summary','work_start_date','work_end_date','change_reason',
    'confirmed_at','confirmed_by','previous_contract_amount','delta_amount',
    'cumulative_contract_amount','terminated_at','termination_reason',
    'termination_fault','penalty_amount','received_amount','progress_amount',
    'refund_amount','outstanding_amount','termination_memo','restored_at',
    'restored_by','restore_reason','items_snapshot'
  ]) as column_name
),
col_ok as (
  select
    'col:contracts.' || e.column_name as check_item,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'contracts'
        and c.column_name = e.column_name
    ) as ok
  from expected_cols e
),
checks as (
  select * from (
    values
      ('table:contracts', to_regclass('public.contracts') is not null),
      ('table:contract_events', to_regclass('public.contract_events') is not null),
      ('col:execution_budgets.halted_at', exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='execution_budgets'
          and column_name='halted_at')),
      ('col:execution_budgets.halt_reason', exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='execution_budgets'
          and column_name='halt_reason')),
      ('idx:contracts_quote_id_not_null_uidx', exists (
        select 1 from pg_indexes
        where schemaname='public' and indexname='contracts_quote_id_not_null_uidx')),
      ('idx:contracts_root_contract_id_idx', exists (
        select 1 from pg_indexes
        where schemaname='public' and indexname='contracts_root_contract_id_idx')),
      ('idx:contracts_parent_contract_id_idx', exists (
        select 1 from pg_indexes
        where schemaname='public' and indexname='contracts_parent_contract_id_idx')),
      ('idx:contract_events_contract_created_idx', exists (
        select 1 from pg_indexes
        where schemaname='public' and indexname='contract_events_contract_created_idx')),
      ('idx:contract_events_root_created_idx', exists (
        select 1 from pg_indexes
        where schemaname='public' and indexname='contract_events_root_created_idx')),
      ('chk:contracts_status_check', exists (
        select 1 from pg_constraint
        where conrelid='public.contracts'::regclass
          and conname='contracts_status_check'
          and pg_get_constraintdef(oid) like '%draft%'
          and pg_get_constraintdef(oid) like '%active%')),
      ('chk:execution_budgets_status_halted', exists (
        select 1 from pg_constraint
        where conrelid='public.execution_budgets'::regclass
          and conname='execution_budgets_status_check'
          and pg_get_constraintdef(oid) like '%halted%')),
      ('rls:contract_events', exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='contract_events' and c.relrowsecurity)),
      ('policy:contract_events_select_erp', exists (
        select 1 from pg_policies
        where schemaname='public' and tablename='contract_events'
          and policyname='contract_events_select_erp')),
      ('policy:contract_events_company_guard', exists (
        select 1 from pg_policies
        where schemaname='public' and tablename='contract_events'
          and policyname='contract_events_company_guard')),
      ('rpc:confirm_contract(uuid)',
        to_regprocedure('public.confirm_contract(uuid)') is not null),
      ('rpc:update_contract_draft(uuid,jsonb)',
        to_regprocedure('public.update_contract_draft(uuid,jsonb)') is not null),
      ('rpc:create_contract_amendment(uuid,jsonb)',
        to_regprocedure('public.create_contract_amendment(uuid,jsonb)') is not null),
      ('rpc:create_contract_addition(uuid,jsonb)',
        to_regprocedure('public.create_contract_addition(uuid,jsonb)') is not null),
      ('rpc:confirm_contract_amendment(uuid)',
        to_regprocedure('public.confirm_contract_amendment(uuid)') is not null),
      ('rpc:confirm_contract_addition(uuid)',
        to_regprocedure('public.confirm_contract_addition(uuid)') is not null),
      ('rpc:terminate_contract(uuid,jsonb)',
        to_regprocedure('public.terminate_contract(uuid,jsonb)') is not null),
      ('rpc:restore_terminated_contract(uuid,text)',
        to_regprocedure('public.restore_terminated_contract(uuid,text)') is not null),
      ('priv:confirm_contract EXECUTE authenticated',
        has_function_privilege('authenticated','public.confirm_contract(uuid)','EXECUTE')),
      ('priv:terminate_contract NO EXECUTE public',
        not has_function_privilege('public','public.terminate_contract(uuid,jsonb)','EXECUTE')),
      ('priv:restore NO EXECUTE public',
        not has_function_privilege('public','public.restore_terminated_contract(uuid,text)','EXECUTE'))
  ) as v(check_item, ok)
  union all
  select check_item, ok from col_ok
)
select
  'A_structure' as phase,
  check_item,
  ok,
  count(*) filter (where not ok) over () as fail_count,
  case
    when bool_and(ok) over () then 'structure OK'
    else 'structure FAILED'
  end as verdict
from checks
order by ok asc, check_item;

-- ---------------------------------------------------------------------------
-- B) 생애주기 흐름 (임시 데이터만, 반드시 ROLLBACK)
-- ---------------------------------------------------------------------------
begin;

do $$
declare
  v_marker text := 'M41-VERIFY-' || replace(gen_random_uuid()::text, '-', '');
  v_admin_id uuid;
  v_admin_role text;
  v_employee_id uuid;
  v_company_id uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_draft_id uuid;
  v_root_id uuid;
  v_amend_id uuid;
  v_add_id uuid;
  v_budget_id uuid;
  v_result jsonb;
  v_row public.contracts%rowtype;
  v_budget public.execution_budgets%rowtype;
  v_evt_count integer;
  v_supply bigint;
  v_vat bigint;
  v_discount bigint;
  v_amount bigint;
  v_phone text;
begin
  select
    p.id, m.role, m.employee_id, p.active_company_id
  into v_admin_id, v_admin_role, v_employee_id, v_company_id
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id
   and m.company_id = p.active_company_id
   and m.status = 'active'
  join public.companies c
    on c.id = p.active_company_id
   and c.status = 'active'
  where m.role in ('owner', 'director', 'admin')
    and p.is_active is true
    and p.is_approved is true
    and p.approval_status = 'approved'
    and p.active_company_id is not null
  order by p.id
  limit 1;

  if v_admin_id is null or v_company_id is null then
    raise exception '검증 중단: active_company 가 있는 활성 관리자가 없습니다.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  if auth.uid() is distinct from v_admin_id then
    raise exception '검증 중단: auth.uid() 설정 실패';
  end if;
  if public.current_company_id() is distinct from v_company_id then
    raise exception '검증 중단: current_company_id 불일치';
  end if;
  if not public.is_admin() then
    raise exception '검증 중단: is_admin()=false';
  end if;

  -- customers: created_by/updated_by 없음 (CustomerInsert / CRM migration 기준)
  v_phone := '070' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.customers (
    company_id,
    name,
    phone,
    status,
    assigned_employee_id
  ) values (
    v_company_id,
    v_marker || '-customer',
    v_phone,
    '신규',
    v_employee_id
  )
  returning id into v_customer_id;

  insert into public.projects (
    customer_id,
    name,
    address,
    status,
    assigned_employee_id,
    company_id,
    created_by,
    updated_by
  ) values (
    v_customer_id,
    v_marker || '-project',
    'verify-only',
    '준비',
    v_employee_id,
    v_company_id,
    v_admin_id,
    v_admin_id
  )
  returning id into v_project_id;

  -- Production contracts are RPC-only after the company-scope hardening.
  -- Seed the rollback-only fixture as the verifier owner, then return to the
  -- authenticated caller for every lifecycle RPC assertion below.
  execute 'reset role';
  insert into public.contracts (
    company_id, customer_id, quote_id, project_id,
    contract_number, contract_date, status,
    supply_amount, vat_amount, discount_amount, contract_amount,
    assigned_employee_id, created_by, updated_by,
    contract_kind, revision_seq, title
  ) values (
    v_company_id, v_customer_id, null, v_project_id,
    null, (current_timestamp at time zone 'Asia/Seoul')::date, 'draft',
    10000000, 1000000, 0, 11000000,
    v_employee_id, v_admin_id, v_admin_id,
    'original', 0, v_marker || '-root'
  )
  returning id into v_draft_id;
  execute 'set local role authenticated';

  if v_draft_id is null then
    raise exception '초안 계약 INSERT 실패';
  end if;

  select * into v_row from public.contracts where id = v_draft_id;
  if v_row.company_id is distinct from v_company_id then
    raise exception 'company_id 불일치';
  end if;

  v_supply := 20000000;
  v_vat := 2000000;
  v_discount := 1000000;
  v_amount := v_supply - v_discount + v_vat;

  v_result := public.update_contract_draft(
    v_draft_id,
    jsonb_build_object(
      'title', v_marker || '-root-updated',
      'scope_summary', 'verify scope',
      'supply_amount', v_supply::text,
      'vat_amount', v_vat::text,
      'discount_amount', v_discount::text,
      'contract_amount', v_amount::text,
      'change_reason', 'draft update verify'
    )
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'update_contract_draft 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_draft_id;
  if v_row.supply_amount is distinct from v_supply
     or v_row.vat_amount is distinct from v_vat
     or v_row.discount_amount is distinct from v_discount
     or v_row.contract_amount is distinct from v_amount then
    raise exception '초안 금액 불일치 supply=% vat=% disc=% amt=%',
      v_row.supply_amount, v_row.vat_amount, v_row.discount_amount, v_row.contract_amount;
  end if;
  if v_row.contract_amount <> v_row.supply_amount - v_row.discount_amount + v_row.vat_amount then
    raise exception '금액 공식 불일치';
  end if;

  v_result := public.confirm_contract(v_draft_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'confirm_contract 실패: %', v_result;
  end if;
  select * into v_row from public.contracts where id = v_draft_id;
  if v_row.status is distinct from 'confirmed' then
    raise exception '확정 후 status=%', v_row.status;
  end if;
  v_root_id := v_draft_id;

  v_result := public.confirm_contract(v_root_id);
  if coalesce((v_result->>'already_confirmed')::boolean, false) is not true then
    raise exception '중복 확정 멱등 실패: %', v_result;
  end if;

  execute 'reset role';
  insert into public.execution_budgets (
    company_id, contract_id, project_id, customer_id,
    status, estimated_total_cost, created_by, updated_by
  ) values (
    v_company_id, v_root_id, v_project_id, v_customer_id,
    'draft', null, v_admin_id, v_admin_id
  )
  returning id into v_budget_id;
  execute 'set local role authenticated';

  v_supply := 30000000;
  v_vat := 3000000;
  v_discount := 0;
  v_amount := v_supply - v_discount + v_vat;

  v_result := public.create_contract_amendment(
    v_root_id,
    jsonb_build_object(
      'title', v_marker || '-amend-1',
      'change_reason', 'amendment verify',
      'supply_amount', v_supply::text,
      'vat_amount', v_vat::text,
      'discount_amount', v_discount::text,
      'contract_amount', v_amount::text
    )
  );
  v_amend_id := nullif(v_result->>'contract_id', '')::uuid;
  if v_amend_id is null then
    raise exception 'create_contract_amendment 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_amend_id;
  if v_row.contract_kind is distinct from 'amendment'
     or v_row.revision_seq is distinct from 1
     or v_row.status is distinct from 'draft'
     or v_row.root_contract_id is distinct from v_root_id
     or v_row.quote_id is not null then
    raise exception '변경계약 메타 오류: %', to_jsonb(v_row);
  end if;
  if v_row.previous_contract_amount is distinct from 21000000
     or v_row.delta_amount is distinct from (33000000 - 21000000)
     or v_row.cumulative_contract_amount is distinct from 33000000 then
    raise exception '변경계약 누적/증감 오류 prev=% delta=% cum=%',
      v_row.previous_contract_amount, v_row.delta_amount, v_row.cumulative_contract_amount;
  end if;

  select status into v_row.status from public.contracts where id = v_root_id;
  if v_row.status is distinct from 'amending' then
    raise exception '원계약 status=% (expected amending)', v_row.status;
  end if;

  select contract_amount into v_amount from public.contracts where id = v_root_id;
  if v_amount is distinct from 21000000 then
    raise exception '변경 확정 전 원계약 금액이 변경됨: %', v_amount;
  end if;

  v_result := public.confirm_contract_amendment(v_amend_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'confirm_contract_amendment 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_root_id;
  if v_row.status is distinct from 'confirmed'
     or v_row.contract_amount is distinct from 33000000
     or v_row.cumulative_contract_amount is distinct from 33000000 then
    raise exception '변경 확정 후 원계약 갱신 실패: %', to_jsonb(v_row);
  end if;
  if v_row.supply_amount is distinct from 20000000
     or v_row.vat_amount is distinct from 2000000
     or v_row.discount_amount is distinct from 1000000 then
    raise exception '변경 확정 후 원계약 공급가/부가세/할인 스냅샷이 깨짐: %', to_jsonb(v_row);
  end if;

  v_supply := 5000000;
  v_vat := 500000;
  v_discount := 0;
  v_amount := v_supply - v_discount + v_vat;

  v_result := public.create_contract_addition(
    v_root_id,
    jsonb_build_object(
      'title', v_marker || '-add-1',
      'change_reason', 'addition verify',
      'supply_amount', v_supply::text,
      'vat_amount', v_vat::text,
      'discount_amount', v_discount::text,
      'contract_amount', v_amount::text
    )
  );
  v_add_id := nullif(v_result->>'contract_id', '')::uuid;
  if v_add_id is null then
    raise exception 'create_contract_addition 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_add_id;
  if v_row.contract_kind is distinct from 'addition'
     or v_row.revision_seq is distinct from 1
     or v_row.delta_amount is distinct from 5500000
     or v_row.cumulative_contract_amount is distinct from (33000000 + 5500000) then
    raise exception '추가계약 차수/누적 오류: %', to_jsonb(v_row);
  end if;

  select contract_amount into v_amount from public.contracts where id = v_root_id;
  if v_amount is distinct from 33000000 then
    raise exception '추가 확정 전 원계약 금액 변경됨: %', v_amount;
  end if;

  v_result := public.confirm_contract_addition(v_add_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'confirm_contract_addition 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_root_id;
  if v_row.contract_amount is distinct from 33000000 then
    raise exception '추가 확정 후 원계약 금액이 바뀌면 안 됨: %', v_row.contract_amount;
  end if;
  if v_row.cumulative_contract_amount is distinct from 38500000 then
    raise exception '추가 확정 후 누적=% (expected 38500000)', v_row.cumulative_contract_amount;
  end if;
  if v_row.status is distinct from 'confirmed' then
    raise exception '추가 확정 후 원계약 status=%', v_row.status;
  end if;

  v_result := public.terminate_contract(
    v_root_id,
    jsonb_build_object(
      'reason', 'm41 verify terminate',
      'fault', 'mutual',
      'memo', v_marker,
      'penalty_amount', '0',
      'received_amount', '1000000',
      'progress_amount', '500000',
      'refund_amount', '0',
      'outstanding_amount', '0'
    )
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'terminate_contract 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_root_id;
  if v_row.status is distinct from 'terminated'
     or v_row.termination_reason is distinct from 'm41 verify terminate'
     or v_row.termination_fault is distinct from 'mutual'
     or v_row.received_amount is distinct from 1000000 then
    raise exception '해지 필드 오류: %', to_jsonb(v_row);
  end if;

  select * into v_budget from public.execution_budgets where id = v_budget_id;
  if v_budget.status is distinct from 'halted' or v_budget.halted_at is null then
    raise exception '실행예산 halted 실패: %', to_jsonb(v_budget);
  end if;

  v_result := public.terminate_contract(
    v_root_id,
    jsonb_build_object('reason', 'again')
  );
  if coalesce((v_result->>'already_terminated')::boolean, false) is not true then
    raise exception '해지 멱등 실패: %', v_result;
  end if;

  begin
    perform public.create_contract_amendment(
      v_root_id,
      jsonb_build_object(
        'change_reason', 'should fail',
        'supply_amount', '1',
        'vat_amount', '0',
        'discount_amount', '0',
        'contract_amount', '1'
      )
    );
    raise exception '해지 후 변경계약이 허용되면 안 됨';
  exception
    when others then
      if sqlerrm like '%해지 후 변경계약이 허용%' then
        raise;
      end if;
      null;
  end;

  v_result := public.restore_terminated_contract(v_root_id, 'm41 verify restore');
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'restore_terminated_contract 실패: %', v_result;
  end if;

  select * into v_row from public.contracts where id = v_root_id;
  if v_row.status is distinct from 'confirmed'
     or v_row.restored_at is null
     or v_row.restore_reason is distinct from 'm41 verify restore' then
    raise exception '복구 실패: %', to_jsonb(v_row);
  end if;

  select * into v_budget from public.execution_budgets where id = v_budget_id;
  if v_budget.status is distinct from 'confirmed' or v_budget.halted_at is not null then
    raise exception '복구 후 예산 상태 오류: %', to_jsonb(v_budget);
  end if;

  select count(*)::int into v_evt_count
  from public.contract_events
  where root_contract_id = v_root_id
     or contract_id in (v_root_id, v_amend_id, v_add_id);

  if v_evt_count < 6 then
    raise exception '이력 이벤트 부족: %', v_evt_count;
  end if;

  perform set_config('app.m41_marker', v_marker, true);
  perform set_config('app.m41_root_id', v_root_id::text, true);
  perform set_config('app.m41_amend_id', v_amend_id::text, true);
  perform set_config('app.m41_add_id', v_add_id::text, true);
  perform set_config('app.m41_customer_id', v_customer_id::text, true);
  perform set_config('app.m41_flow_ok', 'true', true);

  raise notice 'M41_FLOW_OK marker=% root=% amend=% add=% events=%',
    v_marker, v_root_id, v_amend_id, v_add_id, v_evt_count;
end $$;

select
  'B_in_txn_flow' as phase,
  current_setting('app.m41_flow_ok', true) as flow_ok,
  current_setting('app.m41_marker', true) as marker,
  current_setting('app.m41_root_id', true) as root_contract_id,
  current_setting('app.m41_amend_id', true) as amendment_id,
  current_setting('app.m41_add_id', true) as addition_id,
  (
    select jsonb_build_object(
      'status', c.status,
      'contract_kind', c.contract_kind,
      'company_id', c.company_id,
      'supply_amount', c.supply_amount,
      'vat_amount', c.vat_amount,
      'discount_amount', c.discount_amount,
      'contract_amount', c.contract_amount,
      'cumulative_contract_amount', c.cumulative_contract_amount,
      'snapshot_formula',
        c.supply_amount - c.discount_amount + c.vat_amount,
      'display_vs_snapshot_note',
        'amendment 확정 후 display contract_amount != supply-discount+vat 는 Migration 41 설계'
    )
    from public.contracts c
    where c.id = nullif(current_setting('app.m41_root_id', true), '')::uuid
  ) as root_snapshot,
  (
    select count(*)::int
    from public.contracts c
    where c.root_contract_id = nullif(current_setting('app.m41_root_id', true), '')::uuid
      and c.contract_kind = 'amendment'
  ) as amendment_count,
  (
    select count(*)::int
    from public.contracts c
    where c.root_contract_id = nullif(current_setting('app.m41_root_id', true), '')::uuid
      and c.contract_kind = 'addition'
  ) as addition_count,
  (
    select count(*)::int
    from public.contract_events e
    where e.root_contract_id = nullif(current_setting('app.m41_root_id', true), '')::uuid
  ) as event_count;

rollback;

select
  'C_post_rollback' as phase,
  (
    select count(*)::int
    from public.customers c
    where c.name like 'M41-VERIFY-%'
  ) as temp_customers_remaining,
  (
    select count(*)::int
    from public.projects p
    where p.name like 'M41-VERIFY-%'
  ) as temp_projects_remaining,
  (
    select count(*)::int
    from public.contracts c
    where c.title like 'M41-VERIFY-%'
  ) as temp_contracts_remaining,
  (
    select count(*)::int
    from public.contract_events e
    where e.reason like 'm41 verify%'
       or e.reason = 'draft update verify'
       or e.reason = 'amendment verify'
       or e.reason = 'addition verify'
  ) as temp_events_remaining,
  (
    (
      select count(*)::int from public.customers c where c.name like 'M41-VERIFY-%'
    ) = 0
    and (
      select count(*)::int from public.projects p where p.name like 'M41-VERIFY-%'
    ) = 0
    and (
      select count(*)::int from public.contracts c where c.title like 'M41-VERIFY-%'
    ) = 0
    and (
      select count(*)::int
      from public.contract_events e
      where e.reason like 'm41 verify%'
         or e.reason = 'draft update verify'
         or e.reason = 'amendment verify'
         or e.reason = 'addition verify'
    ) = 0
  ) as residue_clean;
