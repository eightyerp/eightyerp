-- =============================================================================
-- Eighty ERP — Window Check quick customer + project registration
--
-- Purpose
--   - One authenticated RPC round-trip from Window Check.
--   - Create/reuse the ERP CRM customer master and a pre-contract `준비` project.
--   - Keep ERP/CRM as the only customer/project source of truth.
--   - Never expose another employee's duplicate customer details.
--   - Surface newly created Window Check customer/site events in CRM activity.
--   - Preserve actor/source traceability in ERP audit_logs without making audit
--     or timeline logging a failure dependency for the primary workflow.
--
-- Safety
--   - No existing row UPDATE/DELETE/backfill.
--   - SECURITY DEFINER with explicit current-company/current-employee checks.
--   - authenticated only; anon/public revoked.
--   - Existing same-company phone match is reused only when the caller may access it.
--   - New customers are assigned to the current authenticated employee.
-- =============================================================================

begin;

create or replace function public.create_window_check_customer_project(
  p_name text,
  p_phone text,
  p_address text default null,
  p_project_name text default null
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
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_project_name text := nullif(btrim(coalesce(p_project_name, '')), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_customer public.customers%rowtype;
  v_project public.projects%rowtype;
  v_can_access_duplicate boolean := false;
  v_project_created boolean := false;
begin
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

  v_phone := case
    when length(v_digits) = 11 then
      substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 4) || '-' || substr(v_digits, 8, 4)
    else
      substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7, 4)
  end;

  -- Same-company duplicate detection uses phone digits so historical formatting
  -- differences do not create a second CRM customer.
  select customer_row.*
  into v_customer
  from public.customers customer_row
  where customer_row.company_id = v_company_id
    and customer_row.deleted_at is null
    and regexp_replace(coalesce(customer_row.phone, ''), '\D', '', 'g') = v_digits
  order by customer_row.created_at desc
  limit 1;

  if found then
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
            'source', 'window_check',
            'reason', 'phone_duplicate_outside_scope'
          )
        );
      exception when others then
        null;
      end;

      return jsonb_build_object(
        'status', 'duplicate_blocked',
        'message', '같은 연락처의 고객이 이미 등록되어 있습니다. 담당자 또는 관리자에게 확인해 주세요.',
        'customer', null,
        'project', null
      );
    end if;

    select project_row.*
    into v_project
    from public.projects project_row
    where project_row.company_id = v_company_id
      and project_row.customer_id = v_customer.id
      and project_row.deleted_at is null
    order by project_row.updated_at desc, project_row.created_at desc
    limit 1;

    if not found then
      v_project_name := coalesce(
        v_project_name,
        nullif(v_address, ''),
        nullif(v_customer.address, ''),
        v_customer.name || ' 현장'
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
      v_project_created := true;
    end if;

    if v_project_created then
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
          'Window Check 앱에서 점검 현장을 생성했습니다.',
          v_employee_id,
          auth.uid()
        );
      exception when others then
        null;
      end;
    end if;

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
        case
          when v_project_created then 'window_check_project_create'
          else 'window_check_customer_project_reuse'
        end,
        auth.uid(),
        jsonb_build_object(
          'source', 'window_check',
          'customer_id', v_customer.id,
          'project_created', v_project_created
        )
      );
    exception when others then
      -- Match the web ERP writeAuditLog behavior: audit logging is important for
      -- traceability but must not invite duplicate customer/project creation.
      null;
    end;

    return jsonb_build_object(
      'status', 'reused',
      'message', '기존 ERP 고객을 연결했습니다.',
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
  end if;

  begin
    insert into public.customers (
      company_id,
      name,
      phone,
      address,
      consultation_type,
      status,
      assigned_employee_id,
      interest_items,
      source_channel
    ) values (
      v_company_id,
      v_name,
      v_phone,
      v_address,
      '창호'::public.consultation_type,
      '신규'::public.customer_status,
      v_employee_id,
      array['창호']::text[],
      'window_check'
    )
    returning * into v_customer;
  exception
    when unique_violation then
      -- Fail closed without leaking cross-company/customer information. A retry
      -- after searching ERP can resolve an actual same-company race.
      return jsonb_build_object(
        'status', 'duplicate_blocked',
        'message', '같은 연락처의 고객이 이미 등록되어 있을 수 있습니다. ERP 고객 검색에서 확인해 주세요.',
        'customer', null,
        'project', null
      );
  end;

  v_project_name := coalesce(
    v_project_name,
    v_address,
    v_name || ' 현장'
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
    v_address,
    '준비',
    v_employee_id,
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
      'Window Check 앱에서 고객과 점검 현장을 등록했습니다.',
      v_employee_id,
      auth.uid()
    );
  exception when others then
    -- Customer registration remains authoritative if optional CRM timeline
    -- logging is temporarily unavailable.
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
    ) values
      (
        v_company_id,
        'customer',
        v_customer.id,
        'window_check_customer_create',
        auth.uid(),
        jsonb_build_object(
          'source', 'window_check',
          'project_id', v_project.id,
          'assigned_employee_id', v_employee_id
        )
      ),
      (
        v_company_id,
        'project',
        v_project.id,
        'window_check_project_create',
        auth.uid(),
        jsonb_build_object(
          'source', 'window_check',
          'customer_id', v_customer.id,
          'lifecycle', 'pre_contract'
        )
      );
  exception when others then
    -- Primary registration remains authoritative even if the optional audit
    -- subsystem is temporarily unavailable.
    null;
  end;

  return jsonb_build_object(
    'status', 'created',
    'message', '고객과 점검 현장을 ERP에 등록했습니다.',
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

revoke all on function public.create_window_check_customer_project(text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_window_check_customer_project(text, text, text, text)
to authenticated;

comment on function public.create_window_check_customer_project(text, text, text, text) is
  'Window Check authenticated quick registration. Atomically creates/reuses CRM customer + pre-contract project; duplicate details are access-scoped; new Window Check events are visible in CRM activity and audit trails are non-blocking.';

notify pgrst, 'reload schema';

commit;
