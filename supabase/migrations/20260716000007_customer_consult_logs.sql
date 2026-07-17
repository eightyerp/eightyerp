-- Eighty ERP CRM: dedicated consultation logs for customer detail timeline
-- Non-destructive. Does not drop existing tables or columns.

create table if not exists public.customer_consult_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  consult_type text not null
    check (consult_type in ('전화', '방문', '카카오톡', '문자', '이메일', '기타')),
  consult_content text not null,
  next_contact_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_consult_logs_customer_id_idx
  on public.customer_consult_logs (customer_id);

create index if not exists customer_consult_logs_created_at_idx
  on public.customer_consult_logs (created_at desc);

create index if not exists customer_consult_logs_next_contact_date_idx
  on public.customer_consult_logs (next_contact_date);

alter table public.customer_consult_logs enable row level security;

drop policy if exists "customer_consult_logs_select" on public.customer_consult_logs;
create policy "customer_consult_logs_select" on public.customer_consult_logs
  for select to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_consult_logs_insert" on public.customer_consult_logs;
create policy "customer_consult_logs_insert" on public.customer_consult_logs
  for insert to authenticated
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_consult_logs_update" on public.customer_consult_logs;
create policy "customer_consult_logs_update" on public.customer_consult_logs
  for update to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_consult_logs_delete" on public.customer_consult_logs;
create policy "customer_consult_logs_delete" on public.customer_consult_logs
  for delete to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';
