begin;

revoke insert, update on public.window_inspections from authenticated;

drop trigger if exists quotes_validate_window_chain on public.quotes;
drop trigger if exists customer_consult_logs_validate_window_chain on public.customer_consult_logs;
drop function if exists public.validate_window_workflow_source_chain();

drop index if exists public.quotes_source_consultation_idx;
drop index if exists public.quotes_source_inspection_idx;
alter table public.quotes
  drop column if exists source_consultation_id,
  drop column if exists source_inspection_id;

drop index if exists public.customer_consult_logs_source_project_idx;
drop index if exists public.customer_consult_logs_source_inspection_idx;
alter table public.customer_consult_logs
  drop column if exists source_project_id,
  drop column if exists source_inspection_id;

drop policy if exists window_inspections_company_update on public.window_inspections;
drop policy if exists window_inspections_company_insert on public.window_inspections;
drop policy if exists window_inspections_company_select on public.window_inspections;
drop index if exists public.window_inspections_project_idx;
drop index if exists public.window_inspections_customer_idx;
drop table if exists public.window_inspections;

notify pgrst, 'reload schema';
commit;
