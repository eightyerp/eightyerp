-- Align legacy contract lifecycle wrapper ACLs with the authenticated-only
-- API contract enforced by the Employee Master company-scope verifier.

begin;

do $contract_lifecycle_wrapper_acl$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.confirm_contract_amendment(uuid)',
    'public.confirm_contract_addition(uuid)',
    'public.create_contract_amendment(uuid,jsonb)',
    'public.create_contract_addition(uuid,jsonb)'
  ]
  loop
    if pg_catalog.to_regprocedure(v_signature) is not null then
      execute pg_catalog.format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_signature
      );
      execute pg_catalog.format(
        'grant execute on function %s to authenticated',
        v_signature
      );
    end if;
  end loop;
end;
$contract_lifecycle_wrapper_acl$;

commit;
