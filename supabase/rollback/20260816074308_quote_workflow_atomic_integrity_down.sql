-- Emergency rollback for 20260816074308_quote_workflow_atomic_integrity.sql
-- Application must be rolled back to the pre-wrapper version first.
-- Existing quote/source rows are preserved.

begin;

revoke execute on function public.create_quote_with_workflow_context(
  jsonb,
  jsonb,
  uuid,
  uuid
) from authenticated;

drop function if exists public.create_quote_with_workflow_context(
  jsonb,
  jsonb,
  uuid,
  uuid
);

drop trigger if exists quotes_01_lock_workflow_source on public.quotes;
drop function if exists public.lock_quote_workflow_source();

drop trigger if exists quotes_00_validate_project_identity on public.quotes;
drop function if exists public.validate_quote_project_identity();

notify pgrst, 'reload schema';

commit;
