-- =============================================================================
-- Eighty ERP — 내부 직원용 마감자재 카탈로그 1단계
-- 파일: 20260718000001_staff_material_catalog.sql
--
-- 범위:
--   - material_catalog / material_catalog_images
--   - private storage bucket: material-catalog
--   - authenticated 직원 CRUD( soft delete만, hard DELETE 정책 없음 )
--
-- 제외: 고객 승인, 토큰, 고객 포털, 현장 자재
-- 안전: customers 등 기존 CRM 테이블/데이터를 수정·삭제하지 않음
-- 전제: 다른 public 함수/테이블 존재를 가정하지 않음 (auth.users 제외)
-- 재실행: 가능하도록 IF NOT EXISTS / DROP POLICY IF EXISTS 사용
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) updated_at 트리거 함수 (이 migration 전용 — 외부 함수 의존 없음)
-- ---------------------------------------------------------------------------
create or replace function public.touch_material_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) material_catalog
-- ---------------------------------------------------------------------------
create table if not exists public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  subtype text,
  brand text,
  product_name text not null,
  model_number text,
  color text,
  specification text,
  unit text default '개',
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
  constraint material_catalog_trade_check check (
    trade in (
      '창호','바닥재','도배','타일','필름','도어','중문','주방가구','붙박이장',
      '욕실','수전','도기','샤워부스','조명','스위치','콘센트','커튼','블라인드',
      '에어컨','환기','가전','도장','목공','철거','확장','전기','기타'
    )
  ),
  constraint material_catalog_subtype_check check (
    subtype is null
    or subtype in (
      '강마루','원목마루','합판마루','강화마루','장판',
      '포세린타일','데코타일','카펫타일','기타'
    )
  ),
  constraint material_catalog_base_price_check check (base_price >= 0)
);

create index if not exists material_catalog_trade_idx
  on public.material_catalog (trade);

create index if not exists material_catalog_brand_idx
  on public.material_catalog (brand);

create index if not exists material_catalog_subtype_idx
  on public.material_catalog (subtype);

create index if not exists material_catalog_favorite_idx
  on public.material_catalog (is_favorite)
  where deleted_at is null;

create index if not exists material_catalog_active_idx
  on public.material_catalog (deleted_at, is_active);

create index if not exists material_catalog_created_at_idx
  on public.material_catalog (created_at desc);

drop trigger if exists material_catalog_touch_updated_at on public.material_catalog;
create trigger material_catalog_touch_updated_at
  before update on public.material_catalog
  for each row
  execute function public.touch_material_catalog_updated_at();

-- ---------------------------------------------------------------------------
-- 3) material_catalog_images
-- ---------------------------------------------------------------------------
create table if not exists public.material_catalog_images (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null
    references public.material_catalog (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists material_catalog_images_material_idx
  on public.material_catalog_images (material_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4) RLS — authenticated 전원 조회/등록/수정(soft delete). hard DELETE 없음
-- ---------------------------------------------------------------------------
alter table public.material_catalog enable row level security;
alter table public.material_catalog_images enable row level security;

-- 목록 필터(deleted_at)는 앱에서 적용. soft delete RETURNING이 막히지 않도록
-- deleted_at 조건은 SELECT 정책에 넣지 않는다.
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

-- hard DELETE 정책 의도적으로 미생성 (soft delete = UPDATE)

drop policy if exists "staff_material_catalog_images_select" on public.material_catalog_images;
create policy "staff_material_catalog_images_select" on public.material_catalog_images
  for select to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.material_catalog c
      where c.id = material_id
        and c.deleted_at is null
    )
  );

drop policy if exists "staff_material_catalog_images_insert" on public.material_catalog_images;
create policy "staff_material_catalog_images_insert" on public.material_catalog_images
  for insert to authenticated
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.material_catalog c
      where c.id = material_id
        and c.deleted_at is null
    )
  );

drop policy if exists "staff_material_catalog_images_update" on public.material_catalog_images;
create policy "staff_material_catalog_images_update" on public.material_catalog_images
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- 이미지 행 정리용 (카탈로그 soft delete와 별개)
drop policy if exists "staff_material_catalog_images_delete" on public.material_catalog_images;
create policy "staff_material_catalog_images_delete" on public.material_catalog_images
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update on public.material_catalog to authenticated;
grant select, insert, update, delete on public.material_catalog_images to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Storage bucket: material-catalog (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-catalog',
  'material-catalog',
  false,
  10485760, -- 10MB
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
