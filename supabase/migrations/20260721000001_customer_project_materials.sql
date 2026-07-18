-- =============================================================================
-- Eighty ERP — 고객/현장별 자재 선택·관리
-- 파일: 20260721000001_customer_project_materials.sql
--
-- 전제: customers, material_categories, material_catalog 존재
-- 제외: 고객 승인, can_access_customer
-- 안전: CRM/분류/카탈로그 DROP 없음. 재실행 가능.
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
-- 1) project_materials
-- ---------------------------------------------------------------------------
create table if not exists public.project_materials (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid,
  catalog_material_id uuid references public.material_catalog (id) on delete set null,
  category_id uuid not null references public.material_categories (id),
  space_name text,
  brand text,
  product_name text not null,
  model_number text,
  color text,
  specification text,
  application_location text,
  quantity numeric,
  unit text,
  unit_price bigint not null default 0,
  additional_price bigint not null default 0,
  supplier text,
  delivery_expected_at date,
  staff_note text,
  site_note text,
  cover_image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text,
  constraint project_materials_unit_price_check check (unit_price >= 0),
  constraint project_materials_additional_price_check check (additional_price >= 0)
);

-- 이전 migration(base_price)과 공존 시 컬럼만 보강 (DROP 없음)
alter table public.project_materials
  add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.project_materials
  add column if not exists project_id uuid;
alter table public.project_materials
  add column if not exists catalog_material_id uuid references public.material_catalog (id) on delete set null;
alter table public.project_materials
  add column if not exists category_id uuid references public.material_categories (id);
alter table public.project_materials
  add column if not exists space_name text;
alter table public.project_materials
  add column if not exists brand text;
alter table public.project_materials
  add column if not exists product_name text;
alter table public.project_materials
  add column if not exists model_number text;
alter table public.project_materials
  add column if not exists color text;
alter table public.project_materials
  add column if not exists specification text;
alter table public.project_materials
  add column if not exists application_location text;
alter table public.project_materials
  add column if not exists quantity numeric;
alter table public.project_materials
  add column if not exists unit text;
alter table public.project_materials
  add column if not exists unit_price bigint not null default 0;
alter table public.project_materials
  add column if not exists additional_price bigint not null default 0;
alter table public.project_materials
  add column if not exists supplier text;
alter table public.project_materials
  add column if not exists delivery_expected_at date;
alter table public.project_materials
  add column if not exists staff_note text;
alter table public.project_materials
  add column if not exists site_note text;
alter table public.project_materials
  add column if not exists cover_image_path text;
alter table public.project_materials
  add column if not exists sort_order integer not null default 0;
alter table public.project_materials
  add column if not exists is_active boolean not null default true;
alter table public.project_materials
  add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.project_materials
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.project_materials
  add column if not exists created_at timestamptz not null default now();
alter table public.project_materials
  add column if not exists updated_at timestamptz not null default now();
alter table public.project_materials
  add column if not exists deleted_at timestamptz;
alter table public.project_materials
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.project_materials
  add column if not exists delete_reason text;

-- 레거시 base_price → unit_price 백필 (컬럼이 있을 때만)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_materials'
      and column_name = 'base_price'
  ) then
    execute $sql$
      update public.project_materials
      set unit_price = coalesce(unit_price, 0)
      where unit_price = 0 and base_price is not null and base_price > 0
    $sql$;
    execute $sql$
      update public.project_materials
      set unit_price = base_price
      where (unit_price is null or unit_price = 0)
        and base_price is not null
    $sql$;
  end if;
end $$;

-- projects 있을 때만 FK
do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'project_materials_project_id_fkey'
     ) then
    alter table public.project_materials
      add constraint project_materials_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
end $$;

create index if not exists project_materials_customer_idx
  on public.project_materials (customer_id)
  where deleted_at is null;

create index if not exists project_materials_project_idx
  on public.project_materials (project_id)
  where deleted_at is null;

create index if not exists project_materials_category_idx
  on public.project_materials (category_id);

create index if not exists project_materials_sort_idx
  on public.project_materials (customer_id, sort_order);

drop trigger if exists project_materials_touch_updated_at on public.project_materials;
create trigger project_materials_touch_updated_at
  before update on public.project_materials
  for each row
  execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2) project_material_images
-- ---------------------------------------------------------------------------
create table if not exists public.project_material_images (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.project_materials (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_material_images
  add column if not exists file_size bigint;
alter table public.project_material_images
  add column if not exists is_cover boolean not null default false;
alter table public.project_material_images
  add column if not exists sort_order integer not null default 0;
alter table public.project_material_images
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists project_material_images_material_idx
  on public.project_material_images (material_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.project_materials enable row level security;
alter table public.project_material_images enable row level security;

drop policy if exists "staff_project_materials_select" on public.project_materials;
create policy "staff_project_materials_select" on public.project_materials
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_project_materials_insert" on public.project_materials;
create policy "staff_project_materials_insert" on public.project_materials
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_project_materials_update" on public.project_materials;
create policy "staff_project_materials_update" on public.project_materials
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_project_material_images_select" on public.project_material_images;
create policy "staff_project_material_images_select" on public.project_material_images
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_project_material_images_insert" on public.project_material_images;
create policy "staff_project_material_images_insert" on public.project_material_images
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_project_material_images_update" on public.project_material_images;
create policy "staff_project_material_images_update" on public.project_material_images
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_project_material_images_delete" on public.project_material_images;
create policy "staff_project_material_images_delete" on public.project_material_images
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update on public.project_materials to authenticated;
grant select, insert, update, delete on public.project_material_images to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Storage: project-materials (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-materials',
  'project-materials',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff_project_materials_storage_select" on storage.objects;
create policy "staff_project_materials_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-materials' and auth.uid() is not null);

drop policy if exists "staff_project_materials_storage_insert" on storage.objects;
create policy "staff_project_materials_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-materials' and auth.uid() is not null);

drop policy if exists "staff_project_materials_storage_update" on storage.objects;
create policy "staff_project_materials_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-materials' and auth.uid() is not null)
  with check (bucket_id = 'project-materials' and auth.uid() is not null);

drop policy if exists "staff_project_materials_storage_delete" on storage.objects;
create policy "staff_project_materials_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-materials' and auth.uid() is not null);

notify pgrst, 'reload schema';
