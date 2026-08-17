-- =============================================================================
-- Eighty ERP — Window Check operational snapshot / media foundation v1
-- File: 20260818030000_window_check_operational_storage_v1.sql
--
-- IMPORTANT
--   - ERP Auth remains the only employee Auth source.
--   - This migration is prepared in a Draft PR only.
--   - Do not apply to Production until the mobile E2E sync contract is approved.
--   - New privileged helpers live in a non-exposed private schema, never as public RPCs.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Non-exposed helper schema
-- ---------------------------------------------------------------------------
create schema if not exists erp_private;
revoke all on schema erp_private from public, anon, authenticated;
grant usage on schema erp_private to authenticated, service_role;
revoke create on schema erp_private from authenticated;

-- ---------------------------------------------------------------------------
-- 1) Window inspection access helpers
-- Read: ERP admins, the actual inspector, or a user who can access the customer.
-- Write: the actual inspector only. Admin/backfill work must use service_role.
-- ---------------------------------------------------------------------------
create or replace function erp_private.can_access_window_inspection(
  p_inspection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and p_inspection_id is not null
    and public.is_erp_user()
    and exists (
      select 1
      from public.window_inspections wi
      where wi.id = p_inspection_id
        and wi.company_id = public.current_company_id()
        and (
          public.is_admin()
          or wi.performed_by_user_id = auth.uid()
          or public.can_access_customer(wi.customer_id)
        )
    ),
    false
  );
$$;

create or replace function erp_private.can_write_window_inspection(
  p_inspection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and p_inspection_id is not null
    and public.is_erp_user()
    and exists (
      select 1
      from public.window_inspections wi
      where wi.id = p_inspection_id
        and wi.company_id = public.current_company_id()
        and wi.performed_by_user_id = auth.uid()
        and wi.performed_by_employee_id = public.current_employee_id()
    ),
    false
  );
$$;

revoke all on function erp_private.can_access_window_inspection(uuid) from public, anon;
revoke all on function erp_private.can_write_window_inspection(uuid) from public, anon;
grant execute on function erp_private.can_access_window_inspection(uuid) to authenticated, service_role;
grant execute on function erp_private.can_write_window_inspection(uuid) to authenticated, service_role;

-- Keep Window Check list/detail visibility aligned with ERP customer RLS.
alter policy window_inspections_company_select
on public.window_inspections
using (
  company_id = (select public.current_company_id())
  and (
    (select public.is_admin())
    or performed_by_user_id = (select auth.uid())
    or public.can_access_customer(customer_id)
  )
);

-- Useful operational lookup/FK indexes. Existing customer/project composite indexes remain.
create index if not exists window_inspections_performer_user_idx
  on public.window_inspections(performed_by_user_id, updated_at desc);
create index if not exists window_inspections_performer_employee_idx
  on public.window_inspections(performed_by_employee_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2) Cross-table company guard for immutable Window Check child records
-- ---------------------------------------------------------------------------
create or replace function erp_private.validate_window_inspection_child_company()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.inspection_id is null or new.company_id is null or not exists (
    select 1
    from public.window_inspections wi
    where wi.id = new.inspection_id
      and wi.company_id = new.company_id
  ) then
    raise exception 'window inspection child company mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function erp_private.validate_window_inspection_child_company() from public, anon;
grant execute on function erp_private.validate_window_inspection_child_company() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Immutable employee-approved structured snapshot
-- Device-local content:// and file:// references are forbidden server-side.
-- ---------------------------------------------------------------------------
create table if not exists public.window_inspection_snapshots (
  inspection_id uuid primary key
    references public.window_inspections(id) on delete cascade,
  company_id uuid not null
    references public.companies(id) on delete restrict,
  snapshot_version integer not null default 1
    check (snapshot_version > 0),
  schema_version text not null default 'window-check-approved-v1'
    check (length(trim(schema_version)) between 1 and 100),
  payload_json jsonb not null
    check (jsonb_typeof(payload_json) = 'object'),
  payload_sha256 text not null
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  approval_input_sha256 text not null
    check (approval_input_sha256 ~ '^[0-9a-f]{64}$'),
  approved_by_user_id uuid not null
    references auth.users(id) on delete restrict,
  approved_by_employee_id uuid not null
    references public.employees(id) on delete restrict,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (payload_json::text not ilike '%content://%'),
  check (payload_json::text not ilike '%file://%')
);

create index if not exists window_inspection_snapshots_company_approved_idx
  on public.window_inspection_snapshots(company_id, approved_at desc);
create index if not exists window_inspection_snapshots_approved_user_idx
  on public.window_inspection_snapshots(approved_by_user_id);
create index if not exists window_inspection_snapshots_approved_employee_idx
  on public.window_inspection_snapshots(approved_by_employee_id);

create trigger window_inspection_snapshots_validate_company
before insert or update of inspection_id, company_id
on public.window_inspection_snapshots
for each row execute function erp_private.validate_window_inspection_child_company();

alter table public.window_inspection_snapshots enable row level security;

create policy window_inspection_snapshots_select
on public.window_inspection_snapshots
for select to authenticated
using (
  company_id = (select public.current_company_id())
  and erp_private.can_access_window_inspection(inspection_id)
);

create policy window_inspection_snapshots_insert
on public.window_inspection_snapshots
for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and approved_by_user_id = (select auth.uid())
  and approved_by_employee_id = (select public.current_employee_id())
  and erp_private.can_write_window_inspection(inspection_id)
);

revoke all on public.window_inspection_snapshots from anon;
grant select, insert on public.window_inspection_snapshots to authenticated;
grant select, insert, update, delete on public.window_inspection_snapshots to service_role;

-- ---------------------------------------------------------------------------
-- 4) Immutable operational photo metadata
-- photo_slot_key is stable per approved inspection (location/type/sequence).
-- ---------------------------------------------------------------------------
create table if not exists public.window_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null
    references public.window_inspections(id) on delete cascade,
  company_id uuid not null
    references public.companies(id) on delete restrict,
  photo_slot_key text not null
    check (length(trim(photo_slot_key)) between 1 and 300),
  photo_kind text not null
    check (photo_kind in ('capture', 'evidence')),
  category text not null
    check (length(trim(category)) between 1 and 100),
  sequence integer not null default 0
    check (sequence >= 0),
  storage_path text not null unique
    check (length(trim(storage_path)) between 1 and 1000),
  byte_sha256 text not null
    check (byte_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null
    check (byte_size > 0 and byte_size <= 26214400),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  captured_at timestamptz,
  rotation_degrees integer not null default 0
    check (rotation_degrees in (0, 90, 180, 270)),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_by_user_id uuid not null
    references auth.users(id) on delete restrict,
  created_by_employee_id uuid not null
    references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (inspection_id, photo_slot_key),
  check (
    storage_path like
      company_id::text || '/' || inspection_id::text || '/photos/%'
  )
);

create index if not exists window_inspection_photos_inspection_idx
  on public.window_inspection_photos(company_id, inspection_id, created_at);
create index if not exists window_inspection_photos_created_user_idx
  on public.window_inspection_photos(created_by_user_id);
create index if not exists window_inspection_photos_created_employee_idx
  on public.window_inspection_photos(created_by_employee_id);

create trigger window_inspection_photos_validate_company
before insert or update of inspection_id, company_id
on public.window_inspection_photos
for each row execute function erp_private.validate_window_inspection_child_company();

alter table public.window_inspection_photos enable row level security;

create policy window_inspection_photos_select
on public.window_inspection_photos
for select to authenticated
using (
  company_id = (select public.current_company_id())
  and erp_private.can_access_window_inspection(inspection_id)
);

create policy window_inspection_photos_insert
on public.window_inspection_photos
for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and created_by_user_id = (select auth.uid())
  and created_by_employee_id = (select public.current_employee_id())
  and erp_private.can_write_window_inspection(inspection_id)
);

revoke all on public.window_inspection_photos from anon;
grant select, insert on public.window_inspection_photos to authenticated;
grant select, insert, update, delete on public.window_inspection_photos to service_role;

-- ---------------------------------------------------------------------------
-- 5) Immutable customer-report metadata / version chain
-- One stable report number may have multiple immutable versions.
-- ---------------------------------------------------------------------------
create table if not exists public.window_inspection_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null
    references public.window_inspections(id) on delete cascade,
  company_id uuid not null
    references public.companies(id) on delete restrict,
  report_number text not null
    check (length(trim(report_number)) between 1 and 100),
  report_version integer not null default 1
    check (report_version > 0),
  storage_path text not null unique
    check (length(trim(storage_path)) between 1 and 1000),
  pdf_sha256 text not null
    check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_payload_sha256 text not null
    check (snapshot_payload_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count is null or page_count > 0),
  generated_by_user_id uuid not null
    references auth.users(id) on delete restrict,
  generated_by_employee_id uuid not null
    references public.employees(id) on delete restrict,
  issued_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (inspection_id, report_version),
  unique (company_id, report_number, report_version),
  check (
    storage_path like
      company_id::text || '/' || inspection_id::text || '/reports/%'
  )
);

create index if not exists window_inspection_reports_inspection_idx
  on public.window_inspection_reports(company_id, inspection_id, report_version desc);
create index if not exists window_inspection_reports_generated_user_idx
  on public.window_inspection_reports(generated_by_user_id);
create index if not exists window_inspection_reports_generated_employee_idx
  on public.window_inspection_reports(generated_by_employee_id);

create trigger window_inspection_reports_validate_company
before insert or update of inspection_id, company_id
on public.window_inspection_reports
for each row execute function erp_private.validate_window_inspection_child_company();

create or replace function erp_private.validate_window_inspection_report_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.window_inspection_snapshots s
    where s.inspection_id = new.inspection_id
      and s.company_id = new.company_id
      and s.payload_sha256 = new.snapshot_payload_sha256
  ) then
    raise exception 'window inspection report snapshot mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function erp_private.validate_window_inspection_report_snapshot() from public, anon;
grant execute on function erp_private.validate_window_inspection_report_snapshot() to authenticated, service_role;

create trigger window_inspection_reports_validate_snapshot
before insert or update of inspection_id, company_id, snapshot_payload_sha256
on public.window_inspection_reports
for each row execute function erp_private.validate_window_inspection_report_snapshot();

alter table public.window_inspection_reports enable row level security;

create policy window_inspection_reports_select
on public.window_inspection_reports
for select to authenticated
using (
  company_id = (select public.current_company_id())
  and erp_private.can_access_window_inspection(inspection_id)
);

create policy window_inspection_reports_insert
on public.window_inspection_reports
for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and generated_by_user_id = (select auth.uid())
  and generated_by_employee_id = (select public.current_employee_id())
  and erp_private.can_write_window_inspection(inspection_id)
);

revoke all on public.window_inspection_reports from anon;
grant select, insert on public.window_inspection_reports to authenticated;
grant select, insert, update, delete on public.window_inspection_reports to service_role;

-- ---------------------------------------------------------------------------
-- 6) Private Storage buckets
-- New immutable objects only: no authenticated UPDATE/DELETE and no upsert.
-- ---------------------------------------------------------------------------
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'window-inspection-private',
    'window-inspection-private',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'window-report-private',
    'window-report-private',
    false,
    20971520,
    array['application/pdf']::text[]
  )
on conflict (id) do nothing;

create or replace function erp_private.window_storage_path_uuid(
  p_object_name text,
  p_position integer
)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_position between 1 and 10
      and split_part(p_object_name, '/', p_position) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then split_part(p_object_name, '/', p_position)::uuid
    else null
  end;
$$;

revoke all on function erp_private.window_storage_path_uuid(text, integer) from public, anon;
grant execute on function erp_private.window_storage_path_uuid(text, integer) to authenticated, service_role;

create policy window_inspection_storage_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'window-inspection-private'
  and split_part(name, '/', 3) = 'photos'
  and erp_private.window_storage_path_uuid(name, 1) = (select public.current_company_id())
  and erp_private.can_access_window_inspection(
    erp_private.window_storage_path_uuid(name, 2)
  )
);

create policy window_inspection_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'window-inspection-private'
  and split_part(name, '/', 3) = 'photos'
  and erp_private.window_storage_path_uuid(name, 1) = (select public.current_company_id())
  and erp_private.can_write_window_inspection(
    erp_private.window_storage_path_uuid(name, 2)
  )
);

create policy window_report_storage_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'window-report-private'
  and split_part(name, '/', 3) = 'reports'
  and erp_private.window_storage_path_uuid(name, 1) = (select public.current_company_id())
  and erp_private.can_access_window_inspection(
    erp_private.window_storage_path_uuid(name, 2)
  )
);

create policy window_report_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'window-report-private'
  and split_part(name, '/', 3) = 'reports'
  and erp_private.window_storage_path_uuid(name, 1) = (select public.current_company_id())
  and erp_private.can_write_window_inspection(
    erp_private.window_storage_path_uuid(name, 2)
  )
);

-- ---------------------------------------------------------------------------
-- 7) Migration assertions
-- ---------------------------------------------------------------------------
do $$
declare
  v_bucket_count integer;
  v_rls_count integer;
  v_public_helper_count integer;
begin
  select count(*)::integer
  into v_bucket_count
  from storage.buckets b
  where (
      b.id = 'window-inspection-private'
      and b.public = false
      and b.file_size_limit = 26214400
    )
    or (
      b.id = 'window-report-private'
      and b.public = false
      and b.file_size_limit = 20971520
    );

  if v_bucket_count <> 2 then
    raise exception 'Window Check private Storage bucket verification failed';
  end if;

  select count(*)::integer
  into v_rls_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'window_inspection_snapshots',
      'window_inspection_photos',
      'window_inspection_reports'
    )
    and c.relrowsecurity = true;

  if v_rls_count <> 3 then
    raise exception 'Window Check detail RLS verification failed';
  end if;

  select count(*)::integer
  into v_public_helper_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'can_access_window_inspection',
      'can_write_window_inspection',
      'validate_window_inspection_child_company',
      'validate_window_inspection_report_snapshot',
      'window_storage_path_uuid'
    );

  if v_public_helper_count <> 0 then
    raise exception 'Window Check helper unexpectedly exposed in public schema';
  end if;

  if has_schema_privilege('anon', 'erp_private', 'USAGE') then
    raise exception 'anon has USAGE on erp_private schema';
  end if;

  if has_function_privilege(
    'anon', 'erp_private.can_access_window_inspection(uuid)', 'EXECUTE'
  ) then
    raise exception 'anon can execute private Window Check access helper';
  end if;

  if has_function_privilege(
    'anon', 'erp_private.can_write_window_inspection(uuid)', 'EXECUTE'
  ) then
    raise exception 'anon can execute private Window Check write helper';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
