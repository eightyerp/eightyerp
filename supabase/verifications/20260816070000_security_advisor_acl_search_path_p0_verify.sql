-- Eighty ERP — verify Security Advisor P0 ACL/search_path hardening
-- Read-only verification. Throws if expected ACL or public-entry behavior regresses.

do $$
declare
  v_oid oid;
  v_config text;
  v_anon boolean;
  v_authenticated boolean;
  v_public_execute boolean;
  v_target text;
  v_search_target text;
begin
  -- authenticated-only helper matrix
  foreach v_target in array array[
    'public.normalize_employee_phone(text)',
    'public.can_access_customer(uuid)',
    'public.can_access_project(uuid)',
    'public.current_employee_id()',
    'public.current_employee_team_id()',
    'public.current_profile_role()',
    'public.is_admin()',
    'public.is_erp_user()',
    'public.is_manager_or_above()',
    'public.lookup_company_customer_phone_duplicates(text,uuid)',
    'public.quote_storage_path_quote_id(text)',
    'public.transition_quote_to_contract(uuid,text,uuid,text,text,uuid,date,text)'
  ] loop
    v_oid := to_regprocedure(v_target);
    if v_oid is null then
      raise exception 'SECURITY_VERIFY missing function: %', v_target;
    end if;

    select
      has_function_privilege('anon', v_oid, 'EXECUTE'),
      has_function_privilege('authenticated', v_oid, 'EXECUTE'),
      exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
    into v_anon, v_authenticated, v_public_execute
    from pg_proc p
    where p.oid = v_oid;

    if v_anon then
      raise exception 'SECURITY_VERIFY anon EXECUTE still allowed: %', v_target;
    end if;
    if not v_authenticated then
      raise exception 'SECURITY_VERIFY authenticated EXECUTE missing: %', v_target;
    end if;
    if v_public_execute then
      raise exception 'SECURITY_VERIFY PUBLIC EXECUTE still allowed: %', v_target;
    end if;
  end loop;

  -- Advisor mutable search_path targets
  foreach v_search_target in array array[
    'public.set_updated_at()',
    'public.touch_updated_at_column()',
    'public.normalize_employee_phone(text)',
    'public.prevent_employee_delete()'
  ] loop
    v_oid := to_regprocedure(v_search_target);
    if v_oid is null then
      raise exception 'SECURITY_VERIFY missing search_path function: %', v_search_target;
    end if;

    select array_to_string(p.proconfig, ',')
      into v_config
    from pg_proc p
    where p.oid = v_oid;

    if coalesce(v_config, '') not like '%search_path=pg_catalog, public%' then
      raise exception 'SECURITY_VERIFY fixed search_path missing: % config=%', v_search_target, v_config;
    end if;
  end loop;

  -- Public entrypoints intentionally preserved. These are regression sentinels:
  -- invitation before login, public quote token, and public shared business-card storage.
  foreach v_target in array array[
    'public.get_company_employee_invitation(text)',
    'public.get_quote_share_by_token(uuid)',
    'public.employee_card_path_is_shared(text)'
  ] loop
    v_oid := to_regprocedure(v_target);
    if v_oid is null then
      raise exception 'SECURITY_VERIFY missing intentional public function: %', v_target;
    end if;
    if not has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception 'SECURITY_VERIFY intentional anon entrypoint lost: %', v_target;
    end if;
  end loop;
end $$;

select jsonb_build_object(
  'result', 'PASS',
  'authenticated_only_helpers', 12,
  'fixed_search_path_functions', 4,
  'intentional_anon_entrypoints_preserved', 3,
  'persistent_data_changes', 0
) as security_advisor_p0_verify;
