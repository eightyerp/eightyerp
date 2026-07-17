-- Eighty ERP CRM v2: soft delete, profiles, expanded status, checklists, activities, audit, RLS

-- ---------------------------------------------------------------------------
-- 1) Expand customer_status enum (keep existing values, add new ones)
-- ---------------------------------------------------------------------------
do $$ begin alter type public.customer_status add value if not exists '1차 연락완료'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '실측예약'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '견적작성중'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '계약협의'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '계약완료'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '시공예정'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '시공중'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '연락두절'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.customer_status add value if not exists '취소'; exception when duplicate_object then null; end $$;

-- Migrate legacy status label without deleting existing rows
update public.customers
set status = '계약완료'
where status::text = '계약';

-- ---------------------------------------------------------------------------
-- 2) Soft delete columns on customers
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists delete_reason text;

create index if not exists customers_deleted_at_idx
  on public.customers (deleted_at);

create index if not exists customers_next_contact_at_idx
  on public.customers (next_contact_at);

-- ---------------------------------------------------------------------------
-- 3) profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  role text not null default 'staff'
    check (role in ('super_admin', 'admin', 'manager', 'staff')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_employee_id_idx on public.profiles (employee_id);
create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create staff profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, is_active)
  values (new.id, 'staff', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: link auth user to employee + role (run after creating Auth user)
create or replace function public.link_profile_to_employee(
  p_user_id uuid,
  p_employee_name text,
  p_role text default 'staff',
  p_permissions jsonb default '{}'::jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_profile public.profiles;
begin
  if p_role not in ('super_admin', 'admin', 'manager', 'staff') then
    raise exception 'invalid role: %', p_role;
  end if;

  select id into v_employee_id
  from public.employees
  where name = p_employee_name
  order by sort_order
  limit 1;

  if v_employee_id is null then
    raise exception 'employee not found: %', p_employee_name;
  end if;

  insert into public.profiles (id, employee_id, role, permissions, is_active)
  values (p_user_id, v_employee_id, p_role, coalesce(p_permissions, '{}'::jsonb), true)
  on conflict (id) do update
    set employee_id = excluded.employee_id,
        role = excluded.role,
        permissions = excluded.permissions,
        is_active = true,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

-- Recommended role seeds (execute after Auth users exist):
-- select public.link_profile_to_employee('<user-uuid>', '이응세', 'super_admin');
-- select public.link_profile_to_employee('<user-uuid>', '김설화', 'super_admin');
-- select public.link_profile_to_employee('<user-uuid>', '김정아', 'manager', '{"can_manage_windows": true, "can_edit_customers": true}'::jsonb);

-- ---------------------------------------------------------------------------
-- 4) audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) customer_checklists
-- ---------------------------------------------------------------------------
create table if not exists public.customer_checklists (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  checklist_type text not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_checklists_unique unique (customer_id, checklist_type)
);

create index if not exists customer_checklists_customer_id_idx
  on public.customer_checklists (customer_id);

drop trigger if exists customer_checklists_set_updated_at on public.customer_checklists;
create trigger customer_checklists_set_updated_at
  before update on public.customer_checklists
  for each row execute function public.set_updated_at();

-- Seed checklist rows for every new customer
create or replace function public.seed_customer_checklists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_checklists (customer_id, checklist_type, sort_order)
  values
    (new.id, '신규문의 확인', 1),
    (new.id, '1차 해피콜', 2),
    (new.id, '상담내용 등록', 3),
    (new.id, '방문/실측 일정 확정', 4),
    (new.id, '견적서 작성', 5),
    (new.id, '견적서 발송', 6),
    (new.id, '고객 피드백 확인', 7),
    (new.id, '계약 여부 확인', 8),
    (new.id, '계약금 확인', 9),
    (new.id, '현장 인계', 10)
  on conflict (customer_id, checklist_type) do nothing;
  return new;
end;
$$;

drop trigger if exists customers_seed_checklists on public.customers;
create trigger customers_seed_checklists
  after insert on public.customers
  for each row execute function public.seed_customer_checklists();

-- Backfill checklists for existing customers
insert into public.customer_checklists (customer_id, checklist_type, sort_order)
select c.id, x.checklist_type, x.sort_order
from public.customers c
cross join (
  values
    ('신규문의 확인', 1),
    ('1차 해피콜', 2),
    ('상담내용 등록', 3),
    ('방문/실측 일정 확정', 4),
    ('견적서 작성', 5),
    ('견적서 발송', 6),
    ('고객 피드백 확인', 7),
    ('계약 여부 확인', 8),
    ('계약금 확인', 9),
    ('현장 인계', 10)
) as x(checklist_type, sort_order)
on conflict (customer_id, checklist_type) do nothing;

-- ---------------------------------------------------------------------------
-- 6) customer_activities
-- ---------------------------------------------------------------------------
create table if not exists public.customer_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  activity_type text not null,
  content text,
  previous_status text,
  new_status text,
  employee_id uuid references public.employees (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_activities_customer_id_idx
  on public.customer_activities (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7) Role helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'super_admin')
     from public.profiles
     where id = auth.uid()
       and is_active = true),
    false
  );
$$;

create or replace function public.is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('manager', 'admin', 'super_admin')
     from public.profiles
     where id = auth.uid()
       and is_active = true),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 8) RLS updates
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.customer_checklists enable row level security;
alter table public.customer_activities enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (public.is_admin() or id = auth.uid());

-- audit_logs: authenticated insert own actions; admins read all; users read own
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs
  for select to authenticated
  using (actor_id = auth.uid() or public.is_admin());

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin());

-- customers: replace broad policies with soft-delete aware ones
drop policy if exists "customers_select_authenticated" on public.customers;
drop policy if exists "customers_insert_authenticated" on public.customers;
drop policy if exists "customers_update_authenticated" on public.customers;
drop policy if exists "customers_delete_authenticated" on public.customers;

create policy "customers_select_active_or_admin" on public.customers
  for select to authenticated
  using (deleted_at is null or public.is_admin());

create policy "customers_insert_authenticated" on public.customers
  for insert to authenticated
  with check (true);

-- Non-admins can update active customers but cannot set soft-delete fields
create policy "customers_update_staff" on public.customers
  for update to authenticated
  using (deleted_at is null and not public.is_admin())
  with check (
    deleted_at is null
    and deleted_by is null
    and delete_reason is null
  );

-- Admins can update anything including soft delete / restore
create policy "customers_update_admin" on public.customers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Hard delete only for admins (permanent delete from trash)
create policy "customers_delete_admin_only" on public.customers
  for delete to authenticated
  using (public.is_admin() and deleted_at is not null);

-- checklists
drop policy if exists "customer_checklists_select" on public.customer_checklists;
create policy "customer_checklists_select" on public.customer_checklists
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = customer_id
        and (c.deleted_at is null or public.is_admin())
    )
  );

drop policy if exists "customer_checklists_insert" on public.customer_checklists;
create policy "customer_checklists_insert" on public.customer_checklists
  for insert to authenticated
  with check (true);

drop policy if exists "customer_checklists_update" on public.customer_checklists;
create policy "customer_checklists_update" on public.customer_checklists
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "customer_checklists_delete" on public.customer_checklists;
create policy "customer_checklists_delete" on public.customer_checklists
  for delete to authenticated
  using (public.is_admin());

-- activities
drop policy if exists "customer_activities_select" on public.customer_activities;
create policy "customer_activities_select" on public.customer_activities
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = customer_id
        and (c.deleted_at is null or public.is_admin())
    )
  );

drop policy if exists "customer_activities_insert" on public.customer_activities;
create policy "customer_activities_insert" on public.customer_activities
  for insert to authenticated
  with check (true);

drop policy if exists "customer_activities_update" on public.customer_activities;
create policy "customer_activities_update" on public.customer_activities
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "customer_activities_delete" on public.customer_activities;
create policy "customer_activities_delete" on public.customer_activities
  for delete to authenticated
  using (public.is_admin());

-- Grants
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.customer_checklists to authenticated;
grant select, insert, update, delete on public.customer_activities to authenticated;

notify pgrst, 'reload schema';
