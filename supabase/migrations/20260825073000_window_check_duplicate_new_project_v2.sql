-- =============================================================================
-- Eighty ERP — Window Check duplicate-customer flow v2
--
-- Goal
--   * Keep one CRM customer per active same-company normalized phone number.
--   * Let an authorized Window Check employee explicitly choose either:
--       - reuse_customer : reuse the current customer/project behavior
--       - new_project    : create a new pre-contract project for that same customer
--   * Never let a field employee bypass another employee's customer access by creating a
--     duplicate customer row with the same phone number.
--
-- Safety
--   * Additive RPC only. No UPDATE/DELETE/backfill.
--   * Production application requires separate approval.
-- =============================================================================

begin;

create or replace function public.create_window_check_customer_project_v2(
  p_name text,
  p_phone text,
  p_address text default null,
  p_project_name text default null,
  p_duplicate_mode text default 'reuse_customer'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_role text;
  v_mode text := lower(btrim(coalesce(p_duplicate_mode, 'reuse_customer')));
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_project_name text := nullif(btrim(coalesce(p_project_name, '')), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_customer public.customers%rowtype;
  v_project public.projects%rowtype;
  v_can_access_duplicate boolean := false;
begin
  if v_mode not in ('reuse_customer', 'new_project') then
    raise exception using
      errcode = '22023',
      message = '지원하지 않는 중복고객 처리 방식입니다.';
  end if;

  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  if not public.is_erp_user() then
    raise exception using errcode = '42501', message = 'ERP 사용 권한을 확인할 수 없습니다.';
  end if;

  v_company_id := public.current_company_id();
  v_employee_id := public.current_employee_id();
  v_role := public.current_company_role();

  if v_company_id is null or v_employee_id is null then
    raise exception using errcode = '42501', message = '활성 회사 또는 직원 정보를 확인할 수 없습니다.';
  end if;
  if not exists (
    select 1
    from public.employees employee_row
    where employee_row.id = v_employee_id
      and employee_row.company_id = v_company_id
      and employee_row.is_active = true
      and employee_row.merged_into_employee_id is null
  ) then
    raise exception using errcode = '42501', message = '활성 직원 정보를 확인할 수 없습니다.';
  end if;

  if v_name = '' then
    raise exception using errcode = '22023', message = '고객명을 입력해 주세요.';
  end if;
  if char_length(v_name) > 100 then
    raise exception using errcode = '22023', message = '고객명이 너무 깁니다.';
  end if;
  if length(v_digits) not in (10, 11) then
    raise exception using errcode = '22023', message = '연락처를 정확히 입력해 주세요.';
  end if;
  if v_address is not null and char_length(v_address) > 300 then
    raise exception using errcode = '22023', message = '주소가 너무 깁니다.';
  end if;

  -- If this phone does not exist, delegate to the already-audited v1 path.
  select customer_row.*
  into v_customer
  from public.customers customer_row
  where customer_row.company_id = v_company_id
    and customer_row.deleted_at is null
    and regexp_replace(coalesce(customer_row.phone, ''), '\D', '', 'g') = v_digits
  order by customer_row.created_at desc
  limit 1;

  if not found then
    return public.create_window_check_customer_project(
      p_name,
      p_phone,
      p_address,
      p_project_name
    );
  end if;

  v_can_access_duplicate :=
    v_role in ('owner', 'director', 'admin')
    or v_customer.assigned_employee_id = v_employee_id;

  if not v_can_access_duplicate then
    begin
      insert into public.audit_logs (
        company_id,
        entity_type,
        entity_id,
        action,
        actor_id,
        payload
      ) values (
        v_company_id,
        'customer',
        null,
        'window_check_duplicate_blocked',
        auth.uid(),
        jsonb_build_object(
          'source', 'window_check_v2',
          'reason', 'phone_duplicate_outside_scope',
          'requested_mode', v_mode
        )
      );
    exception when others then
      null;
    end;

    return jsonb_build_object(
      'status', 'duplicate_blocked',
      'message', '같은 연락처의 고객이 이미 등록되어 있습니다. 담당자 또는 관리자 확인 후 진행해 주세요.',
      'allowed_actions', jsonb_build_array('manager_review'),
      'customer', null,
      'project', null
    );
  end if;

  if v_mode = 'reuse_customer' then
    return public.create_window_check_customer_project(
      p_name,
      p_phone,
      p_address,
      p_project_name
    ) || jsonb_build_object(
      'duplicate_detected', true,
      'duplicate_mode', 'reuse_customer',
      'allowed_actions', jsonb_build_array('reuse_customer', 'new_project')
    );
  end if;

  -- Explicitly requested new_project: create a new pre-contract site under the same accessible
  -- CRM customer even when that customer already has one or more projects.
  v_project_name := coalesce(
    v_project_name,
    v_address,
    v_customer.name || ' 추가 현장'
  );

  insert into public.projects (
    company_id,
    customer_id,
    name,
    address,
    status,
    assigned_employee_id,
    created_by,
    updated_by
  ) values (
    v_company_id,
    v_customer.id,
    v_project_name,
    coalesce(v_address, v_customer.address),
    '준비',
    coalesce(v_customer.assigned_employee_id, v_employee_id),
    auth.uid(),
    auth.uid()
  )
  returning * into v_project;

  begin
    insert into public.customer_activities (
      company_id,
      customer_id,
      activity_type,
      content,
      employee_id,
      created_by
    ) values (
      v_company_id,
      v_customer.id,
      '메모',
      'Window Check 앱에서 기존 고객의 새 점검 현장을 생성했습니다.',
      v_employee_id,
      auth.uid()
    );
  exception when others then
    null;
  end;

  begin
    insert into public.audit_logs (
      company_id,
      entity_type,
      entity_id,
      action,
      actor_id,
      payload
    ) values (
      v_company_id,
      'project',
      v_project.id,
      'window_check_project_create',
      auth.uid(),
      jsonb_build_object(
        'source', 'window_check_v2',
        'customer_id', v_customer.id,
        'duplicate_detected', true,
        'duplicate_mode', 'new_project',
        'lifecycle', 'pre_contract'
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'status', 'project_created',
    'message', '기존 ERP 고객에 새 점검 현장을 등록했습니다.',
    'duplicate_detected', true,
    'duplicate_mode', 'new_project',
    'allowed_actions', jsonb_build_array('reuse_customer', 'new_project'),
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'company_id', v_customer.company_id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'address', coalesce(v_customer.address, ''),
      'assigned_employee_id', v_customer.assigned_employee_id
    ),
    'project', jsonb_build_object(
      'id', v_project.id,
      'company_id', v_project.company_id,
      'customer_id', v_project.customer_id,
      'name', v_project.name,
      'address', coalesce(v_project.address, ''),
      'status', v_project.status,
      'assigned_employee_id', v_project.assigned_employee_id
    )
  );
end;
$$;

revoke all on function public.create_window_check_customer_project_v2(text, text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_window_check_customer_project_v2(text, text, text, text, text)
to authenticated;

comment on function public.create_window_check_customer_project_v2(text, text, text, text, text) is
  'Window Check duplicate-safe registration v2. Keeps a single active CRM customer per same-company phone and allows an authorized employee to reuse that customer or explicitly create a new pre-contract project. Cross-assignee duplicates remain privacy-blocked.';

notify pgrst, 'reload schema';

commit;
