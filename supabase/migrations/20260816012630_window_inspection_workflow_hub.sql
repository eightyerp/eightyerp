begin;

create table if not exists public.window_inspections (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  performed_by_user_id uuid not null references auth.users(id) on delete restrict,
  performed_by_employee_id uuid not null references public.employees(id) on delete restrict,
  inspection_status text not null default 'in_progress'
    check (inspection_status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_windows integer not null default 0 check (total_windows >= 0),
  status_counts jsonb not null default '{}'::jsonb,
  highest_status_level integer check (highest_status_level between 1 and 5),
  report_status text not null default 'draft'
    check (report_status in ('draft', 'reviewed', 'approved')),
  report_reference text,
  version bigint not null default 1 check (version > 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, client_request_id)
);

create index if not exists window_inspections_customer_idx
  on public.window_inspections(company_id, customer_id, completed_at desc);
create index if not exists window_inspections_project_idx
  on public.window_inspections(company_id, project_id, updated_at desc);

alter table public.quotes
  add column if not exists source_consultation_id uuid references public.customer_consult_logs(id) on delete set null,
  add column if not exists source_inspection_id uuid references public.window_inspections(id) on delete set null;

alter table public.customer_consult_logs
  add column if not exists source_project_id uuid references public.projects(id) on delete set null,
  add column if not exists source_inspection_id uuid references public.window_inspections(id) on delete set null;

create index if not exists customer_consult_logs_source_project_idx
  on public.customer_consult_logs(company_id, source_project_id);
create index if not exists customer_consult_logs_source_inspection_idx
  on public.customer_consult_logs(company_id, source_inspection_id);

create index if not exists quotes_source_consultation_idx
  on public.quotes(company_id, source_consultation_id);
create index if not exists quotes_source_inspection_idx
  on public.quotes(company_id, source_inspection_id);

create or replace function public.validate_window_workflow_source_chain()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_table_name = 'customer_consult_logs' then
    if new.source_project_id is null and new.source_inspection_id is null then return new; end if;
    if new.source_project_id is null or new.source_inspection_id is null or not exists (
      select 1 from public.window_inspections wi
      where wi.id = new.source_inspection_id and wi.company_id = new.company_id
        and wi.customer_id = new.customer_id and wi.project_id = new.source_project_id
    ) then raise exception 'invalid consultation workflow source chain' using errcode = '23514'; end if;
  elsif tg_table_name = 'quotes' then
    if new.source_consultation_id is null and new.source_inspection_id is null then return new; end if;
    if new.project_id is null or new.source_consultation_id is null or new.source_inspection_id is null
      or not exists (select 1 from public.window_inspections wi where wi.id = new.source_inspection_id and wi.company_id = new.company_id and wi.customer_id = new.customer_id and wi.project_id = new.project_id)
      or not exists (select 1 from public.customer_consult_logs cl where cl.id = new.source_consultation_id and cl.company_id = new.company_id and cl.customer_id = new.customer_id and cl.source_project_id = new.project_id and cl.source_inspection_id = new.source_inspection_id)
    then raise exception 'invalid quote workflow source chain' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

create trigger customer_consult_logs_validate_window_chain
before insert or update of customer_id, company_id, source_project_id, source_inspection_id on public.customer_consult_logs
for each row execute function public.validate_window_workflow_source_chain();
create trigger quotes_validate_window_chain
before insert or update of customer_id, project_id, company_id, source_consultation_id, source_inspection_id on public.quotes
for each row execute function public.validate_window_workflow_source_chain();

alter table public.window_inspections enable row level security;

create policy window_inspections_company_select
on public.window_inspections for select to authenticated
using (company_id = (select public.current_company_id()));

create policy window_inspections_company_insert
on public.window_inspections for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and performed_by_user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    join public.company_memberships m on m.user_id = p.id
      and m.company_id = window_inspections.company_id
      and m.employee_id = window_inspections.performed_by_employee_id
    where p.id = (select auth.uid())
      and p.employee_id = window_inspections.performed_by_employee_id
      and p.is_active = true
      and p.is_approved = true
      and p.approval_status = 'approved'
      and m.status = 'active'
  )
  and exists (
    select 1 from public.customers c
    join public.projects pr on pr.customer_id = c.id
    where c.id = window_inspections.customer_id and pr.id = window_inspections.project_id
      and c.company_id = window_inspections.company_id and pr.company_id = window_inspections.company_id
      and c.deleted_at is null and pr.deleted_at is null
  )
);

create policy window_inspections_company_update
on public.window_inspections for update to authenticated
using (
  company_id = (select public.current_company_id())
  and performed_by_user_id = (select auth.uid())
)
with check (
  company_id = (select public.current_company_id())
  and performed_by_user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    join public.company_memberships m on m.user_id = p.id
      and m.company_id = window_inspections.company_id
      and m.employee_id = window_inspections.performed_by_employee_id
    where p.id = (select auth.uid())
      and p.employee_id = window_inspections.performed_by_employee_id
      and p.is_active = true
      and p.is_approved = true
      and p.approval_status = 'approved'
      and m.status = 'active'
  )
  and exists (
    select 1 from public.customers c
    join public.projects pr on pr.customer_id = c.id
    where c.id = window_inspections.customer_id and pr.id = window_inspections.project_id
      and c.company_id = window_inspections.company_id and pr.company_id = window_inspections.company_id
      and c.deleted_at is null and pr.deleted_at is null
  )
);

grant select, insert, update on public.window_inspections to authenticated;

notify pgrst, 'reload schema';
commit;
