-- =============================================================================
-- Eighty ERP — 견적관리(quotes) + 자재 note 간소화
-- 파일: 20260724000001_quotes_and_simple_materials.sql
--
-- 안전: 기존 customer_quotes / CRM / 카탈로그 DROP·수정 없음
-- 기존 migration 수정 없음. 재실행 가능.
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

-- ---------------------------------------------------------------------------
-- 0) project_materials.note (자재 간소화용, 기존 컬럼 유지)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.project_materials') is not null then
    alter table public.project_materials
      add column if not exists note text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) quotes
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
  memo text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

alter table public.quotes add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.quotes add column if not exists project_id uuid;
alter table public.quotes add column if not exists quote_group_id uuid;
alter table public.quotes add column if not exists parent_quote_id uuid;
alter table public.quotes add column if not exists quote_type text;
alter table public.quotes add column if not exists title text;
alter table public.quotes add column if not exists quote_number text;
alter table public.quotes add column if not exists version_number integer not null default 1;
alter table public.quotes add column if not exists status text not null default '작성중';
alter table public.quotes add column if not exists total_amount bigint not null default 0;
alter table public.quotes add column if not exists discount_amount bigint not null default 0;
alter table public.quotes add column if not exists final_amount bigint not null default 0;
alter table public.quotes add column if not exists valid_until date;
alter table public.quotes add column if not exists issued_at date;
alter table public.quotes add column if not exists sent_at timestamptz;
alter table public.quotes add column if not exists sent_by uuid references auth.users (id) on delete set null;
alter table public.quotes add column if not exists assigned_employee_id uuid;
alter table public.quotes add column if not exists is_lx_material boolean not null default false;
alter table public.quotes add column if not exists is_contract_quote boolean not null default false;
alter table public.quotes add column if not exists memo text;
alter table public.quotes add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.quotes add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.quotes add column if not exists created_at timestamptz not null default now();
alter table public.quotes add column if not exists updated_at timestamptz not null default now();
alter table public.quotes add column if not exists deleted_at timestamptz;
alter table public.quotes add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.quotes add column if not exists delete_reason text;

update public.quotes set quote_group_id = id where quote_group_id is null;
alter table public.quotes alter column quote_group_id set default gen_random_uuid();

do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'quotes_project_id_fkey'
     ) then
    alter table public.quotes
      add constraint quotes_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$
begin
  if to_regclass('public.employees') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'quotes_assigned_employee_id_fkey'
     ) then
    alter table public.quotes
      add constraint quotes_assigned_employee_id_fkey
      foreign key (assigned_employee_id) references public.employees (id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotes_parent_quote_id_fkey'
  ) then
    alter table public.quotes
      add constraint quotes_parent_quote_id_fkey
      foreign key (parent_quote_id) references public.quotes (id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotes_quote_type_check'
  ) then
    alter table public.quotes
      add constraint quotes_quote_type_check
      check (quote_type in ('창호', '인테리어', '기타'));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotes_status_check'
  ) then
    alter table public.quotes
      add constraint quotes_status_check
      check (status in (
        '작성중', '검토중', '발송완료', '수정요청',
        '승인', '계약전환', '만료', '취소'
      ));
  end if;
exception when others then null;
end $$;

create index if not exists quotes_customer_idx
  on public.quotes (customer_id, created_at desc)
  where deleted_at is null;

create index if not exists quotes_group_idx
  on public.quotes (quote_group_id, version_number desc);

create index if not exists quotes_status_idx
  on public.quotes (status)
  where deleted_at is null;

create index if not exists quotes_type_idx
  on public.quotes (quote_type)
  where deleted_at is null;

create index if not exists quotes_contract_idx
  on public.quotes (customer_id, is_contract_quote)
  where deleted_at is null and is_contract_quote = true;

drop trigger if exists quotes_touch_updated_at on public.quotes;
create trigger quotes_touch_updated_at
  before update on public.quotes
  for each row
  execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2) quote_files
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
  created_at timestamptz not null default now()
);

alter table public.quote_files add column if not exists quote_id uuid references public.quotes (id) on delete cascade;
alter table public.quote_files add column if not exists file_type text;
alter table public.quote_files add column if not exists file_path text;
alter table public.quote_files add column if not exists file_name text;
alter table public.quote_files add column if not exists original_file_name text;
alter table public.quote_files add column if not exists mime_type text;
alter table public.quote_files add column if not exists file_size bigint;
alter table public.quote_files add column if not exists is_primary boolean not null default false;
alter table public.quote_files add column if not exists uploaded_by uuid references auth.users (id) on delete set null;
alter table public.quote_files add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quote_files_file_type_check'
  ) then
    alter table public.quote_files
      add constraint quote_files_file_type_check
      check (file_type in ('pdf', 'xls', 'xlsx'));
  end if;
exception when others then null;
end $$;

create index if not exists quote_files_quote_idx
  on public.quote_files (quote_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) quote_items (공종별 금액)
-- ---------------------------------------------------------------------------
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
  updated_at timestamptz not null default now()
);

alter table public.quote_items add column if not exists quote_id uuid references public.quotes (id) on delete cascade;
alter table public.quote_items add column if not exists trade_name text;
alter table public.quote_items add column if not exists item_name text;
alter table public.quote_items add column if not exists description text;
alter table public.quote_items add column if not exists quantity numeric;
alter table public.quote_items add column if not exists unit text;
alter table public.quote_items add column if not exists unit_price bigint not null default 0;
alter table public.quote_items add column if not exists amount bigint not null default 0;
alter table public.quote_items add column if not exists sort_order integer not null default 0;
alter table public.quote_items add column if not exists created_at timestamptz not null default now();
alter table public.quote_items add column if not exists updated_at timestamptz not null default now();

create index if not exists quote_items_quote_idx
  on public.quote_items (quote_id, sort_order);

drop trigger if exists quote_items_touch_updated_at on public.quote_items;
create trigger quote_items_touch_updated_at
  before update on public.quote_items
  for each row
  execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) quote_send_logs (발송 이력, 카카오 API 없음)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_send_logs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  guide_message text,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.quote_send_logs add column if not exists quote_id uuid references public.quotes (id) on delete cascade;
alter table public.quote_send_logs add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.quote_send_logs add column if not exists guide_message text;
alter table public.quote_send_logs add column if not exists note text;
alter table public.quote_send_logs add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.quote_send_logs add column if not exists created_at timestamptz not null default now();

create index if not exists quote_send_logs_quote_idx
  on public.quote_send_logs (quote_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
alter table public.quotes enable row level security;
alter table public.quote_files enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_send_logs enable row level security;

drop policy if exists "staff_quotes_select" on public.quotes;
create policy "staff_quotes_select" on public.quotes
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_quotes_insert" on public.quotes;
create policy "staff_quotes_insert" on public.quotes
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_quotes_update" on public.quotes;
create policy "staff_quotes_update" on public.quotes
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_quote_files_select" on public.quote_files;
create policy "staff_quote_files_select" on public.quote_files
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_quote_files_insert" on public.quote_files;
create policy "staff_quote_files_insert" on public.quote_files
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_quote_files_update" on public.quote_files;
create policy "staff_quote_files_update" on public.quote_files
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_quote_files_delete" on public.quote_files;
create policy "staff_quote_files_delete" on public.quote_files
  for delete to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_quote_items_select" on public.quote_items;
create policy "staff_quote_items_select" on public.quote_items
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_quote_items_insert" on public.quote_items;
create policy "staff_quote_items_insert" on public.quote_items
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_quote_items_update" on public.quote_items;
create policy "staff_quote_items_update" on public.quote_items
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_quote_items_delete" on public.quote_items;
create policy "staff_quote_items_delete" on public.quote_items
  for delete to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_quote_send_logs_select" on public.quote_send_logs;
create policy "staff_quote_send_logs_select" on public.quote_send_logs
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_quote_send_logs_insert" on public.quote_send_logs;
create policy "staff_quote_send_logs_insert" on public.quote_send_logs
  for insert to authenticated
  with check (auth.uid() is not null);

grant select, insert, update on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_files to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
grant select, insert on public.quote_send_logs to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Storage: quote-files (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-files',
  'quote-files',
  false,
  52428800,
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
