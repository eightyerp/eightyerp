-- =============================================================================
-- Eighty ERP — 견적관리 1차 완성 (컬럼 보강 + 권한 RLS + 30MB)
-- 파일: 20260726000001_quotes_management_v1.sql
--
-- 전제: 20260724000001 등으로 가능. 없으면 CREATE IF NOT EXISTS로 생성.
-- 안전: CRM/자재/스케줄 DROP 없음. 재실행 가능.
-- =============================================================================

create or replace function public.touch_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 역할 헬퍼 (이미 있으면 덮어쓰기 동일 정의)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'super_admin') from public.profiles
     where id = auth.uid() and is_active = true),
    false
  );
$$;

create or replace function public.is_manager_or_above()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('manager', 'admin', 'super_admin') from public.profiles
     where id = auth.uid() and is_active = true),
    false
  );
$$;

create or replace function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select employee_id from public.profiles
  where id = auth.uid() and is_active = true;
$$;

create or replace function public.current_employee_team_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select e.team_id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where p.id = auth.uid() and p.is_active = true;
$$;

-- ---------------------------------------------------------------------------
-- quotes (없으면 생성, 있으면 보강)
-- ---------------------------------------------------------------------------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid,
  quote_group_id uuid not null default gen_random_uuid(),
  parent_quote_id uuid,
  quote_type text not null,
  title text not null,
  quote_number text,
  version_number integer not null default 1,
  status text not null default '작성중',
  total_amount bigint not null default 0,
  discount_amount bigint not null default 0,
  final_amount bigint not null default 0,
  valid_until date,
  issued_at date,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  assigned_employee_id uuid,
  is_lx_material boolean not null default false,
  is_contract_quote boolean not null default false,
  customer_message text,
  memo text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

alter table public.quotes add column if not exists customer_message text;
alter table public.quotes add column if not exists quote_group_id uuid;
alter table public.quotes add column if not exists parent_quote_id uuid;
alter table public.quotes add column if not exists memo text;
alter table public.quotes add column if not exists is_lx_material boolean not null default false;
alter table public.quotes add column if not exists is_contract_quote boolean not null default false;

update public.quotes set quote_group_id = coalesce(quote_group_id, id) where quote_group_id is null;

-- ---------------------------------------------------------------------------
-- quote_files soft delete + quote_items soft delete
-- ---------------------------------------------------------------------------
create table if not exists public.quote_files (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  file_type text not null,
  file_path text not null,
  file_name text not null,
  original_file_name text,
  mime_type text,
  file_size bigint,
  is_primary boolean not null default false,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

alter table public.quote_files add column if not exists deleted_at timestamptz;
alter table public.quote_files add column if not exists deleted_by uuid references auth.users (id) on delete set null;

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  trade_name text not null,
  item_name text,
  description text,
  quantity numeric,
  unit text,
  unit_price bigint not null default 0,
  amount bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.quote_items add column if not exists deleted_at timestamptz;

create table if not exists public.quote_send_logs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  guide_message text,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 견적 접근: admin 전체 / manager 동팀 / staff 본인담당(견적 또는 고객)
-- ---------------------------------------------------------------------------
create or replace function public.can_access_quote(p_quote_id uuid)
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
      from public.quotes q
      left join public.customers c on c.id = q.customer_id
      left join public.employees assignee on assignee.id = q.assigned_employee_id
      left join public.employees cust_assignee on cust_assignee.id = c.assigned_employee_id
      where q.id = p_quote_id
        and (
          q.created_by = auth.uid()
          or q.assigned_employee_id = public.current_employee_id()
          or c.assigned_employee_id = public.current_employee_id()
          or (
            public.is_manager_or_above()
            and not public.is_admin()
            and public.current_employee_team_id() is not null
            and (
              assignee.team_id = public.current_employee_team_id()
              or cust_assignee.team_id = public.current_employee_team_id()
            )
          )
        )
    );
$$;

grant execute on function public.can_access_quote(uuid) to authenticated;

alter table public.quotes enable row level security;
alter table public.quote_files enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_send_logs enable row level security;

drop policy if exists "staff_quotes_select" on public.quotes;
create policy "staff_quotes_select" on public.quotes
  for select to authenticated
  using (
    auth.uid() is not null
    and (
      public.is_admin()
      or created_by = auth.uid()
      or assigned_employee_id = public.current_employee_id()
      or exists (
        select 1 from public.customers c
        where c.id = customer_id
          and c.assigned_employee_id = public.current_employee_id()
      )
      or (
        public.is_manager_or_above()
        and not public.is_admin()
        and public.current_employee_team_id() is not null
        and (
          exists (
            select 1 from public.employees e
            where e.id = assigned_employee_id
              and e.team_id = public.current_employee_team_id()
          )
          or exists (
            select 1 from public.customers c
            join public.employees e on e.id = c.assigned_employee_id
            where c.id = customer_id
              and e.team_id = public.current_employee_team_id()
          )
        )
      )
    )
  );

drop policy if exists "staff_quotes_insert" on public.quotes;
create policy "staff_quotes_insert" on public.quotes
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_quotes_update" on public.quotes;
create policy "staff_quotes_update" on public.quotes
  for update to authenticated
  using (auth.uid() is not null and public.can_access_quote(id))
  with check (auth.uid() is not null and public.can_access_quote(id));

drop policy if exists "staff_quote_files_select" on public.quote_files;
create policy "staff_quote_files_select" on public.quote_files
  for select to authenticated
  using (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_files_insert" on public.quote_files;
create policy "staff_quote_files_insert" on public.quote_files
  for insert to authenticated
  with check (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_files_update" on public.quote_files;
create policy "staff_quote_files_update" on public.quote_files
  for update to authenticated
  using (auth.uid() is not null and public.can_access_quote(quote_id))
  with check (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_items_select" on public.quote_items;
create policy "staff_quote_items_select" on public.quote_items
  for select to authenticated
  using (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_items_insert" on public.quote_items;
create policy "staff_quote_items_insert" on public.quote_items
  for insert to authenticated
  with check (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_items_update" on public.quote_items;
create policy "staff_quote_items_update" on public.quote_items
  for update to authenticated
  using (auth.uid() is not null and public.can_access_quote(quote_id))
  with check (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_send_logs_select" on public.quote_send_logs;
create policy "staff_quote_send_logs_select" on public.quote_send_logs
  for select to authenticated
  using (auth.uid() is not null and public.can_access_quote(quote_id));

drop policy if exists "staff_quote_send_logs_insert" on public.quote_send_logs;
create policy "staff_quote_send_logs_insert" on public.quote_send_logs
  for insert to authenticated
  with check (auth.uid() is not null and public.can_access_quote(quote_id));

grant select, insert, update on public.quotes to authenticated;
grant select, insert, update on public.quote_files to authenticated;
grant select, insert, update on public.quote_items to authenticated;
grant select, insert on public.quote_send_logs to authenticated;

-- Storage 30MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-files',
  'quote-files',
  false,
  31457280,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff_quote_files_storage_select" on storage.objects;
create policy "staff_quote_files_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-files' and auth.uid() is not null);

drop policy if exists "staff_quote_files_storage_insert" on storage.objects;
create policy "staff_quote_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quote-files' and auth.uid() is not null);

drop policy if exists "staff_quote_files_storage_update" on storage.objects;
create policy "staff_quote_files_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'quote-files' and auth.uid() is not null)
  with check (bucket_id = 'quote-files' and auth.uid() is not null);

drop policy if exists "staff_quote_files_storage_delete" on storage.objects;
create policy "staff_quote_files_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quote-files' and auth.uid() is not null);

notify pgrst, 'reload schema';
