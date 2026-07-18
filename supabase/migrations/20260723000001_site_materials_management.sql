-- =============================================================================
-- Eighty ERP — 현장 자재 운영(발주·이력·템플릿·복원)
-- 파일: 20260723000001_site_materials_management.sql
--
-- 전제: project_materials, project_material_images 존재
-- 제외: 고객 승인, can_access_customer, service role
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
-- 1) project_materials 발주·납기 컬럼
-- ---------------------------------------------------------------------------
alter table public.project_materials
  add column if not exists order_status text;
alter table public.project_materials
  add column if not exists ordered_at timestamptz;
alter table public.project_materials
  add column if not exists ordered_by uuid references auth.users (id) on delete set null;
alter table public.project_materials
  add column if not exists expected_delivery_at date;
alter table public.project_materials
  add column if not exists delivered_at date;
alter table public.project_materials
  add column if not exists order_note text;

-- 레거시 delivery_expected_at → expected_delivery_at 백필
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_materials'
      and column_name = 'delivery_expected_at'
  ) then
    execute $sql$
      update public.project_materials
      set expected_delivery_at = coalesce(expected_delivery_at, delivery_expected_at)
      where expected_delivery_at is null
        and delivery_expected_at is not null
    $sql$;
  end if;
end $$;

update public.project_materials
set order_status = '미발주'
where order_status is null or order_status = '';

alter table public.project_materials
  alter column order_status set default '미발주';

do $$
begin
  alter table public.project_materials
    alter column order_status set not null;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_materials_order_status_check'
  ) then
    alter table public.project_materials
      add constraint project_materials_order_status_check
      check (order_status in ('미발주', '발주대기', '발주완료', '입고완료', '취소'));
  end if;
exception when others then null;
end $$;

create index if not exists project_materials_order_status_idx
  on public.project_materials (order_status)
  where deleted_at is null;

create index if not exists project_materials_expected_delivery_idx
  on public.project_materials (expected_delivery_at)
  where deleted_at is null;

-- projects 공사 시작일 (납기 위험 비교용, 선택)
do $$
begin
  if to_regclass('public.projects') is not null then
    execute 'alter table public.projects add column if not exists construction_start_at date';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) project_material_history (삭제 불가)
-- ---------------------------------------------------------------------------
create table if not exists public.project_material_history (
  id uuid primary key default gen_random_uuid(),
  project_material_id uuid not null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table public.project_material_history
  add column if not exists project_material_id uuid;
alter table public.project_material_history
  add column if not exists customer_id uuid references public.customers (id) on delete cascade;
alter table public.project_material_history
  add column if not exists project_id uuid;
alter table public.project_material_history
  add column if not exists action text;
alter table public.project_material_history
  add column if not exists before_data jsonb;
alter table public.project_material_history
  add column if not exists after_data jsonb;
alter table public.project_material_history
  add column if not exists reason text;
alter table public.project_material_history
  add column if not exists changed_by uuid references auth.users (id) on delete set null;
alter table public.project_material_history
  add column if not exists changed_at timestamptz not null default now();

create index if not exists project_material_history_material_idx
  on public.project_material_history (project_material_id, changed_at desc);

create index if not exists project_material_history_customer_idx
  on public.project_material_history (customer_id, changed_at desc);

alter table public.project_material_history enable row level security;

drop policy if exists "staff_project_material_history_select" on public.project_material_history;
create policy "staff_project_material_history_select"
  on public.project_material_history
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_project_material_history_insert" on public.project_material_history;
create policy "staff_project_material_history_insert"
  on public.project_material_history
  for insert to authenticated
  with check (auth.uid() is not null);

-- UPDATE/DELETE 정책 없음 → 이력 변경·삭제 불가
revoke update, delete on public.project_material_history from authenticated;
grant select, insert on public.project_material_history to authenticated;

-- ---------------------------------------------------------------------------
-- 3) material_templates / material_template_items
-- ---------------------------------------------------------------------------
create table if not exists public.material_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

alter table public.material_templates
  add column if not exists name text;
alter table public.material_templates
  add column if not exists description text;
alter table public.material_templates
  add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.material_templates
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.material_templates
  add column if not exists created_at timestamptz not null default now();
alter table public.material_templates
  add column if not exists updated_at timestamptz not null default now();
alter table public.material_templates
  add column if not exists deleted_at timestamptz;
alter table public.material_templates
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.material_templates
  add column if not exists delete_reason text;

drop trigger if exists material_templates_touch_updated_at on public.material_templates;
create trigger material_templates_touch_updated_at
  before update on public.material_templates
  for each row
  execute function public.touch_updated_at_column();

create table if not exists public.material_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.material_templates (id) on delete cascade,
  sort_order integer not null default 0,
  item_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.material_template_items
  add column if not exists template_id uuid references public.material_templates (id) on delete cascade;
alter table public.material_template_items
  add column if not exists sort_order integer not null default 0;
alter table public.material_template_items
  add column if not exists item_data jsonb not null default '{}'::jsonb;
alter table public.material_template_items
  add column if not exists created_at timestamptz not null default now();

create index if not exists material_templates_active_idx
  on public.material_templates (name)
  where deleted_at is null;

create index if not exists material_template_items_template_idx
  on public.material_template_items (template_id, sort_order);

alter table public.material_templates enable row level security;
alter table public.material_template_items enable row level security;

drop policy if exists "staff_material_templates_select" on public.material_templates;
create policy "staff_material_templates_select" on public.material_templates
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_material_templates_insert" on public.material_templates;
create policy "staff_material_templates_insert" on public.material_templates
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_material_templates_update" on public.material_templates;
create policy "staff_material_templates_update" on public.material_templates
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_material_template_items_select" on public.material_template_items;
create policy "staff_material_template_items_select" on public.material_template_items
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_material_template_items_insert" on public.material_template_items;
create policy "staff_material_template_items_insert" on public.material_template_items
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "staff_material_template_items_update" on public.material_template_items;
create policy "staff_material_template_items_update" on public.material_template_items
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "staff_material_template_items_delete" on public.material_template_items;
create policy "staff_material_template_items_delete" on public.material_template_items
  for delete to authenticated
  using (auth.uid() is not null);

grant select, insert, update on public.material_templates to authenticated;
grant select, insert, update, delete on public.material_template_items to authenticated;

notify pgrst, 'reload schema';
