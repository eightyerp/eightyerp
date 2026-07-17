-- Eighty ERP CRM v3: customer detail fields, activity result, contact helpers, team RLS

-- ---------------------------------------------------------------------------
-- 1) Additional customer detail columns (non-destructive)
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists additional_phone text,
  add column if not exists apartment_name text,
  add column if not exists unit_number text,
  add column if not exists last_contact_at timestamptz,
  add column if not exists consultation_result text;

create index if not exists customers_last_contact_at_idx
  on public.customers (last_contact_at desc);

-- Backfill last_contact_at from latest activity when available
update public.customers c
set last_contact_at = a.max_created
from (
  select customer_id, max(created_at) as max_created
  from public.customer_activities
  group by customer_id
) a
where c.id = a.customer_id
  and c.last_contact_at is null;

-- ---------------------------------------------------------------------------
-- 2) Enrich customer_activities
-- ---------------------------------------------------------------------------
alter table public.customer_activities
  add column if not exists result text,
  add column if not exists next_contact_at date,
  add column if not exists previous_assignee_id uuid references public.employees (id) on delete set null,
  add column if not exists new_assignee_id uuid references public.employees (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3) Team-scoped access helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select employee_id
  from public.profiles
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.current_employee_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.team_id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where p.id = auth.uid()
    and p.is_active = true
$$;

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.customers c
      left join public.employees assignee on assignee.id = c.assigned_employee_id
      where c.id = p_customer_id
        and (
          c.assigned_employee_id = public.current_employee_id()
          or (
            public.current_employee_team_id() is not null
            and assignee.team_id = public.current_employee_team_id()
          )
          or c.assigned_employee_id is null
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 4) Tighten customers RLS for staff/team while keeping admin full access
-- ---------------------------------------------------------------------------
drop policy if exists "customers_select_active_or_admin" on public.customers;
create policy "customers_select_active_or_admin" on public.customers
  for select to authenticated
  using (
    (
      deleted_at is null
      and (
        public.is_admin()
        or assigned_employee_id = public.current_employee_id()
        or assigned_employee_id is null
        or exists (
          select 1
          from public.employees assignee
          where assignee.id = assigned_employee_id
            and assignee.team_id is not null
            and assignee.team_id = public.current_employee_team_id()
        )
      )
    )
    or public.is_admin()
  );

drop policy if exists "customers_update_staff" on public.customers;
create policy "customers_update_staff" on public.customers
  for update to authenticated
  using (
    deleted_at is null
    and not public.is_admin()
    and (
      assigned_employee_id = public.current_employee_id()
      or assigned_employee_id is null
      or exists (
        select 1
        from public.employees assignee
        where assignee.id = assigned_employee_id
          and assignee.team_id is not null
          and assignee.team_id = public.current_employee_team_id()
      )
    )
  )
  with check (
    deleted_at is null
    and deleted_by is null
    and delete_reason is null
  );

-- ---------------------------------------------------------------------------
-- 5) Contact schedule helper view for dashboard cards
-- ---------------------------------------------------------------------------
create or replace view public.customer_contact_schedule as
select
  c.id,
  c.name,
  c.phone,
  c.status,
  c.assigned_employee_id,
  c.next_contact_at,
  c.last_contact_at,
  case
    when c.next_contact_at is null then 'none'
    when c.next_contact_at < current_date then 'overdue'
    when c.next_contact_at = current_date then 'today'
    when c.next_contact_at <= current_date + 3 then 'soon'
    when c.next_contact_at <= date_trunc('week', current_date)::date + 6 then 'this_week'
    else 'later'
  end as contact_bucket
from public.customers c
where c.deleted_at is null;

grant select on public.customer_contact_schedule to authenticated;

notify pgrst, 'reload schema';
