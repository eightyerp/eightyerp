-- =============================================================================
-- Eighty ERP — 자재분류 → 자재제품 (2단계) 단순화
-- 파일: 20260719000001_material_categories_and_catalog.sql
--
-- 범위: material_categories, material_catalog, material_catalog_images,
--       storage bucket material-catalog
-- 제외: 고객 승인, 하위유형(subcategory/subtype)
-- 안전: CRM/고객 데이터 미수정. 기존 컬럼 DROP 없음. 단독 실행 가능.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) updated_at 헬퍼 (이 migration 전용)
-- ---------------------------------------------------------------------------
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
-- 1) material_categories
-- ---------------------------------------------------------------------------
create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

create index if not exists material_categories_sort_idx
  on public.material_categories (sort_order, name);

create index if not exists material_categories_active_idx
  on public.material_categories (is_active)
  where deleted_at is null;

drop trigger if exists material_categories_touch_updated_at on public.material_categories;
create trigger material_categories_touch_updated_at
  before update on public.material_categories
  for each row
  execute function public.touch_updated_at_column();

-- Seed (이름 기준 중복 방지 — soft-deleted 포함 동일 name 재삽입 안 함)
insert into public.material_categories (name, code, sort_order, is_active)
select s.name, s.code, s.sort_order, true
from (
  values
    ('창호', 'window', 10),
    ('바닥재', 'flooring', 20),
    ('도배', 'wallpaper', 30),
    ('타일', 'tile', 40),
    ('필름', 'film', 50),
    ('도어', 'door', 60),
    ('중문', 'middle_door', 70),
    ('주방가구', 'kitchen', 80),
    ('붙박이장', 'built_in', 90),
    ('욕실', 'bathroom', 100),
    ('수전', 'faucet', 110),
    ('도기', 'sanitary', 120),
    ('샤워부스', 'shower_booth', 130),
    ('조명', 'lighting', 140),
    ('스위치', 'switch', 150),
    ('콘센트', 'outlet', 160),
    ('커튼', 'curtain', 170),
    ('블라인드', 'blind', 180),
    ('에어컨', 'aircon', 190),
    ('환기', 'ventilation', 200),
    ('가전', 'appliance', 210),
    ('도장', 'paint', 220),
    ('목공', 'woodwork', 230),
    ('철거', 'demolition', 240),
    ('확장', 'extension', 250),
    ('전기', 'electric', 260),
    ('기타', 'etc', 270)
) as s(name, code, sort_order)
where not exists (
  select 1
  from public.material_categories c
  where c.name = s.name
);

-- ---------------------------------------------------------------------------
-- 2) material_catalog (category_id 기반 — trade/subtype 컬럼은 생성하지 않음)
-- ---------------------------------------------------------------------------
create table if not exists public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.material_categories (id),
  brand text,
  product_name text not null,
  model_number text,
  color text,
  specification text,
  unit text,
  base_price bigint not null default 0,
  supplier text,
  description text,
  cover_image_path text,
  is_favorite boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text,
  constraint material_catalog_base_price_check check (base_price >= 0)
);

-- 기존에 다른 스키마로 생성된 경우 컬럼만 보강 (DROP 없음)
alter table public.material_catalog
  add column if not exists category_id uuid references public.material_categories (id);

alter table public.material_catalog
  add column if not exists brand text;

alter table public.material_catalog
  add column if not exists product_name text;

alter table public.material_catalog
  add column if not exists model_number text;

alter table public.material_catalog
  add column if not exists color text;

alter table public.material_catalog
  add column if not exists specification text;

alter table public.material_catalog
  add column if not exists unit text;

alter table public.material_catalog
  add column if not exists base_price bigint not null default 0;

alter table public.material_catalog
  add column if not exists supplier text;

alter table public.material_catalog
  add column if not exists description text;

alter table public.material_catalog
  add column if not exists cover_image_path text;

alter table public.material_catalog
  add column if not exists is_favorite boolean not null default false;

alter table public.material_catalog
  add column if not exists is_active boolean not null default true;

alter table public.material_catalog
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.material_catalog
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

alter table public.material_catalog
  add column if not exists created_at timestamptz not null default now();

alter table public.material_catalog
  add column if not exists updated_at timestamptz not null default now();

alter table public.material_catalog
  add column if not exists deleted_at timestamptz;

alter table public.material_catalog
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

alter table public.material_catalog
  add column if not exists delete_reason text;

-- 레거시 trade 컬럼이 있으면 경우 분류명으로 category_id 백필 (컬럼은 유지)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'material_catalog'
      and column_name = 'trade'
  ) then
    update public.material_catalog mc
    set category_id = c.id
    from public.material_categories c
    where mc.category_id is null
      and mc.trade is not null
      and c.name = mc.trade
      and c.deleted_at is null;
  end if;
end $$;

-- category_id가 아직 null인 행 → '기타'로 연결
update public.material_catalog mc
set category_id = c.id
from public.material_categories c
where mc.category_id is null
  and c.name = '기타'
  and c.deleted_at is null;

create index if not exists material_catalog_category_idx
  on public.material_catalog (category_id);

create index if not exists material_catalog_brand_idx
  on public.material_catalog (brand);

create index if not exists material_catalog_favorite_idx
  on public.material_catalog (is_favorite)
  where deleted_at is null;

create index if not exists material_catalog_created_at_idx
  on public.material_catalog (created_at desc);

drop trigger if exists material_catalog_touch_updated_at on public.material_catalog;
create trigger material_catalog_touch_updated_at
  before update on public.material_catalog
  for each row
  execute function public.touch_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) material_catalog_images
-- ---------------------------------------------------------------------------
create table if not exists public.material_catalog_images (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.material_catalog (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.material_catalog_images
  add column if not exists file_size bigint;

alter table public.material_catalog_images
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.material_catalog_images
  add column if not exists is_cover boolean not null default false;

alter table public.material_catalog_images
  add column if not exists sort_order integer not null default 0;

create index if not exists material_catalog_images_material_idx
  on public.material_catalog_images (material_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
alter table public.material_categories enable row level security;
alter table public.material_catalog enable row level security;
alter table public.material_catalog_images enable row level security;

-- categories
drop policy if exists "staff_material_categories_select" on public.material_categories;
create policy "staff_material_categories_select" on public.material_categories
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_material_categories_insert" on public.material_categories;
create policy "staff_material_categories_insert" on public.material_categories
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_material_categories_update" on public.material_categories;
create policy "staff_material_categories_update" on public.material_categories
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- catalog
drop policy if exists "staff_material_catalog_select" on public.material_catalog;
create policy "staff_material_catalog_select" on public.material_catalog
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_material_catalog_insert" on public.material_catalog;
create policy "staff_material_catalog_insert" on public.material_catalog
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_material_catalog_update" on public.material_catalog;
create policy "staff_material_catalog_update" on public.material_catalog
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- images
drop policy if exists "staff_material_catalog_images_select" on public.material_catalog_images;
create policy "staff_material_catalog_images_select" on public.material_catalog_images
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_material_catalog_images_insert" on public.material_catalog_images;
create policy "staff_material_catalog_images_insert" on public.material_catalog_images
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_material_catalog_images_update" on public.material_catalog_images;
create policy "staff_material_catalog_images_update" on public.material_catalog_images
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_material_catalog_images_delete" on public.material_catalog_images;
create policy "staff_material_catalog_images_delete" on public.material_catalog_images
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update on public.material_categories to authenticated;
grant select, insert, update on public.material_catalog to authenticated;
grant select, insert, update, delete on public.material_catalog_images to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Storage: material-catalog (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-catalog',
  'material-catalog',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff_material_catalog_storage_select" on storage.objects;
create policy "staff_material_catalog_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'material-catalog' and auth.uid() is not null);

drop policy if exists "staff_material_catalog_storage_insert" on storage.objects;
create policy "staff_material_catalog_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'material-catalog' and auth.uid() is not null);

drop policy if exists "staff_material_catalog_storage_update" on storage.objects;
create policy "staff_material_catalog_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'material-catalog' and auth.uid() is not null)
  with check (bucket_id = 'material-catalog' and auth.uid() is not null);

drop policy if exists "staff_material_catalog_storage_delete" on storage.objects;
create policy "staff_material_catalog_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'material-catalog' and auth.uid() is not null);

notify pgrst, 'reload schema';
