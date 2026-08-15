-- 에잇티 창호체크 개발 프로젝트 전용 migration
-- 적용 대상: 별도 Supabase 프로젝트(eighty-window-check-dev)
-- 적용 금지: 운영 ERP 프로젝트(eighty-erp)

begin;

create extension if not exists pgcrypto;

create or replace function public.window_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.window_staff_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  erp_employee_id uuid,
  employee_name text not null,
  team_name text,
  position_name text,
  role text not null default 'employee'
    check (role in ('owner', 'director', 'admin', 'manager', 'employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id),
  unique (company_id, erp_employee_id)
);

create table if not exists public.window_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  erp_customer_id uuid,
  erp_project_id uuid,
  created_by uuid not null references auth.users(id),
  assigned_user_id uuid references auth.users(id),
  erp_assigned_employee_id uuid,
  status text not null default 'draft'
    check (status in (
      'draft', 'uploading', 'analysis_pending', 'analysis_in_progress',
      'staff_review', 'confirmed', 'report_issued', 'closed', 'cancelled'
    )),
  inspection_date timestamptz not null default now(),
  consent_confirmed boolean not null default false,
  consent_confirmed_at timestamptz,
  app_version text,
  customer_display_name text,
  site_display_name text,
  site_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.window_inspection_locations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  company_id uuid not null,
  location_name text not null,
  location_order integer not null default 0,
  window_type text,
  extension_status text,
  estimated_years_in_use text,
  orientation text,
  floor_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, location_order),
  unique (inspection_id, location_name)
);

create table if not exists public.window_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  company_id uuid not null,
  uploaded_by uuid not null references auth.users(id),
  photo_category text not null
    check (photo_category in (
      'whole_window', 'frame_corner', 'glass', 'lower_rail', 'handle_lock',
      'upper_frame', 'left_side', 'right_side', 'sealant', 'condensation',
      'insulated_glass_fogging', 'external_water_leak', 'drainage',
      'mold_corrosion', 'frame_damage', 'hardware_damage', 'other'
    )),
  original_storage_path text not null,
  analysis_storage_path text,
  thumbnail_storage_path text,
  file_hash text,
  perceptual_hash text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  file_size bigint check (file_size is null or file_size > 0),
  mime_type text check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  captured_at timestamptz,
  employee_description text,
  selected_for_analysis boolean not null default true,
  upload_status text not null default 'local_draft'
    check (upload_status in (
      'local_draft', 'waiting_for_network', 'compressing', 'uploading',
      'uploaded', 'queued_for_analysis', 'analyzing', 'completed',
      'needs_retake', 'failed'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.window_location_symptoms (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  company_id uuid not null,
  years_in_use text,
  draft_level text,
  condensation_frequency text,
  condensation_location jsonb not null default '[]'::jsonb,
  indoor_temperature numeric(5,2),
  indoor_humidity numeric(5,2) check (indoor_humidity is null or (indoor_humidity >= 0 and indoor_humidity <= 100)),
  water_leak_condition text,
  water_leak_location jsonb not null default '[]'::jsonb,
  opening_condition text,
  lock_condition text,
  noise_level text,
  mold_status text,
  previous_repair text,
  employee_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id)
);

create table if not exists public.window_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  company_id uuid not null,
  requested_by uuid not null references auth.users(id),
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'validating', 'processing', 'completed', 'needs_retake', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  prompt_version text not null default 'window-v1',
  schema_version text not null default '1.0',
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists public.window_ai_results (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null unique references public.window_analysis_jobs(id) on delete cascade,
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  company_id uuid not null,
  model_name text not null,
  prompt_version text not null,
  schema_version text not null,
  raw_result_json jsonb not null,
  validated_result_json jsonb not null,
  openai_response_id text,
  input_photo_count integer not null default 0 check (input_photo_count >= 0),
  processing_time_ms integer check (processing_time_ms is null or processing_time_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost numeric(14,6) check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.window_staff_reviews (
  id uuid primary key default gen_random_uuid(),
  ai_result_id uuid not null references public.window_ai_results(id) on delete restrict,
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  company_id uuid not null,
  reviewed_by uuid not null references auth.users(id),
  review_status text not null default 'draft'
    check (review_status in ('draft', 'confirmed', 'reopened')),
  correction_type text
    check (correction_type is null or correction_type in ('accurate', 'partially_corrected', 'incorrect', 'not_judgable')),
  final_result_json jsonb not null default '{}'::jsonb,
  correction_reason text,
  customer_comment text,
  internal_comment text,
  final_grade text,
  recommended_action text,
  quote_required boolean not null default false,
  revisit_required boolean not null default false,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ai_result_id, reviewed_by)
);

create table if not exists public.window_actual_actions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  company_id uuid not null,
  action_type text not null
    check (action_type in (
      'cleaning', 'sash_adjustment', 'hardware_replacement', 'sealant_repair',
      'external_caulk_repair', 'drainage_repair', 'glass_replacement',
      'full_window_replacement', 'wall_repair', 'no_action', 'other'
    )),
  action_description text,
  action_date date,
  handled_by uuid references auth.users(id),
  result_after_action text,
  recurrence_status text,
  followup_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.window_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  company_id uuid not null,
  report_number text not null,
  report_version integer not null default 1 check (report_version > 0),
  generated_by uuid not null references auth.users(id),
  report_storage_path text not null,
  erp_quote_id uuid,
  quote_display_name text,
  issued_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  send_channel text,
  created_at timestamptz not null default now(),
  unique (company_id, report_number, report_version)
);

create table if not exists public.window_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  developer_prompt text not null,
  schema_version text not null,
  status text not null default 'draft'
    check (status in ('draft', 'testing', 'approved', 'active', 'retired', 'rolled_back')),
  change_summary text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  activated_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.window_diagnosis_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  category text not null,
  rule_text text not null,
  priority integer not null default 100,
  version text not null,
  active boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_key, version)
);

create table if not exists public.window_evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  ai_result_id uuid not null references public.window_ai_results(id) on delete restrict,
  staff_review_id uuid not null references public.window_staff_reviews(id) on delete restrict,
  actual_action_id uuid references public.window_actual_actions(id) on delete set null,
  company_id uuid not null,
  anonymized boolean not null default false,
  approved_for_evaluation boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  evaluation_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (ai_result_id, staff_review_id)
);

create table if not exists public.window_daily_metrics (
  metric_date date not null,
  company_id uuid not null,
  inspections_count integer not null default 0,
  locations_count integer not null default 0,
  photos_count integer not null default 0,
  analyses_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  retake_count integer not null default 0,
  employee_correction_count integer not null default 0,
  not_judgable_count integer not null default 0,
  average_processing_time numeric(12,2),
  estimated_ai_cost numeric(14,6),
  created_at timestamptz not null default now(),
  primary key (metric_date, company_id)
);

create table if not exists public.window_audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata_without_personal_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.window_app_content_versions (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  version text not null,
  content_json jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'testing', 'approved', 'active', 'retired', 'rolled_back')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (content_type, version)
);

create index if not exists idx_window_memberships_user_active
  on public.window_staff_memberships (user_id, active);
create index if not exists idx_window_inspections_company_date
  on public.window_inspections (company_id, inspection_date desc)
  where deleted_at is null;
create index if not exists idx_window_inspections_created_by
  on public.window_inspections (created_by, updated_at desc)
  where deleted_at is null;
create index if not exists idx_window_locations_inspection
  on public.window_inspection_locations (inspection_id, location_order);
create index if not exists idx_window_photos_location_category
  on public.window_inspection_photos (location_id, photo_category, created_at)
  where deleted_at is null;
create index if not exists idx_window_photos_hash
  on public.window_inspection_photos (company_id, file_hash)
  where deleted_at is null and file_hash is not null;
create index if not exists idx_window_jobs_status_retry
  on public.window_analysis_jobs (status, next_retry_at, queued_at);
create index if not exists idx_window_ai_results_location
  on public.window_ai_results (location_id, created_at desc);
create index if not exists idx_window_reviews_inspection
  on public.window_staff_reviews (inspection_id, confirmed, updated_at desc);
create index if not exists idx_window_reports_inspection
  on public.window_reports (inspection_id, issued_at desc);
create index if not exists idx_window_audit_company_date
  on public.window_audit_logs (company_id, created_at desc);

create or replace function public.window_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.company_id
  from public.window_staff_memberships m
  where m.user_id = auth.uid()
    and m.active = true
  order by m.created_at
  limit 1;
$$;

create or replace function public.window_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.window_staff_memberships m
  where m.user_id = auth.uid()
    and m.active = true
  order by m.created_at
  limit 1;
$$;

create or replace function public.window_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.window_current_role() in ('owner', 'director', 'admin', 'manager'), false);
$$;

create or replace function public.window_can_access_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.window_inspections i
    join public.window_staff_memberships m
      on m.company_id = i.company_id
     and m.user_id = auth.uid()
     and m.active = true
    where i.id = p_inspection_id
      and i.deleted_at is null
      and (
        m.role in ('owner', 'director', 'admin', 'manager')
        or i.created_by = auth.uid()
        or i.assigned_user_id = auth.uid()
      )
  );
$$;

create or replace function public.window_can_manage_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.window_staff_memberships m
    where m.user_id = auth.uid()
      and m.company_id = p_company_id
      and m.active = true
      and m.role in ('owner', 'director', 'admin', 'manager')
  );
$$;

grant execute on function public.window_current_company_id() to authenticated;
grant execute on function public.window_current_role() to authenticated;
grant execute on function public.window_is_admin() to authenticated;
grant execute on function public.window_can_access_inspection(uuid) to authenticated;
grant execute on function public.window_can_manage_company(uuid) to authenticated;

alter table public.window_staff_memberships enable row level security;
alter table public.window_inspections enable row level security;
alter table public.window_inspection_locations enable row level security;
alter table public.window_inspection_photos enable row level security;
alter table public.window_location_symptoms enable row level security;
alter table public.window_analysis_jobs enable row level security;
alter table public.window_ai_results enable row level security;
alter table public.window_staff_reviews enable row level security;
alter table public.window_actual_actions enable row level security;
alter table public.window_reports enable row level security;
alter table public.window_prompt_versions enable row level security;
alter table public.window_diagnosis_rules enable row level security;
alter table public.window_evaluation_cases enable row level security;
alter table public.window_daily_metrics enable row level security;
alter table public.window_audit_logs enable row level security;
alter table public.window_app_content_versions enable row level security;

create policy window_memberships_select_self_or_admin
on public.window_staff_memberships
for select to authenticated
using (
  user_id = auth.uid()
  or public.window_can_manage_company(company_id)
);

create policy window_inspections_select
on public.window_inspections
for select to authenticated
using (public.window_can_access_inspection(id));

create policy window_inspections_insert
on public.window_inspections
for insert to authenticated
with check (
  created_by = auth.uid()
  and company_id = public.window_current_company_id()
  and exists (
    select 1 from public.window_staff_memberships m
    where m.user_id = auth.uid() and m.company_id = company_id and m.active = true
  )
);

create policy window_inspections_update
on public.window_inspections
for update to authenticated
using (public.window_can_access_inspection(id))
with check (public.window_can_access_inspection(id));

create policy window_inspections_delete_admin
on public.window_inspections
for delete to authenticated
using (public.window_can_manage_company(company_id));

create policy window_locations_select
on public.window_inspection_locations
for select to authenticated
using (public.window_can_access_inspection(inspection_id));

create policy window_locations_insert
on public.window_inspection_locations
for insert to authenticated
with check (
  company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_locations_update
on public.window_inspection_locations
for update to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy window_locations_delete
on public.window_inspection_locations
for delete to authenticated
using (public.window_can_access_inspection(inspection_id));

create policy window_photos_select
on public.window_inspection_photos
for select to authenticated
using (deleted_at is null and public.window_can_access_inspection(inspection_id));

create policy window_photos_insert
on public.window_inspection_photos
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_photos_update
on public.window_inspection_photos
for update to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy window_photos_delete_admin
on public.window_inspection_photos
for delete to authenticated
using (public.window_can_manage_company(company_id));

create policy window_symptoms_all
on public.window_location_symptoms
for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (
  company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_jobs_select
on public.window_analysis_jobs
for select to authenticated
using (public.window_can_access_inspection(inspection_id));

create policy window_jobs_insert
on public.window_analysis_jobs
for insert to authenticated
with check (
  requested_by = auth.uid()
  and company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_jobs_update_admin_or_requester
on public.window_analysis_jobs
for update to authenticated
using (
  public.window_can_manage_company(company_id)
  or requested_by = auth.uid()
)
with check (
  public.window_can_manage_company(company_id)
  or requested_by = auth.uid()
);

create policy window_ai_results_select
on public.window_ai_results
for select to authenticated
using (public.window_can_access_inspection(inspection_id));

create policy window_reviews_select
on public.window_staff_reviews
for select to authenticated
using (public.window_can_access_inspection(inspection_id));

create policy window_reviews_insert
on public.window_staff_reviews
for insert to authenticated
with check (
  reviewed_by = auth.uid()
  and company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_reviews_update
on public.window_staff_reviews
for update to authenticated
using (
  reviewed_by = auth.uid()
  or public.window_can_manage_company(company_id)
)
with check (
  reviewed_by = auth.uid()
  or public.window_can_manage_company(company_id)
);

create policy window_actual_actions_all
on public.window_actual_actions
for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (
  company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_reports_select
on public.window_reports
for select to authenticated
using (public.window_can_access_inspection(inspection_id));

create policy window_reports_insert
on public.window_reports
for insert to authenticated
with check (
  generated_by = auth.uid()
  and company_id = public.window_current_company_id()
  and public.window_can_access_inspection(inspection_id)
);

create policy window_reports_update
on public.window_reports
for update to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy window_prompt_versions_select
on public.window_prompt_versions
for select to authenticated
using (status = 'active' or public.window_is_admin());

create policy window_prompt_versions_manage
on public.window_prompt_versions
for all to authenticated
using (public.window_is_admin())
with check (public.window_is_admin());

create policy window_diagnosis_rules_select
on public.window_diagnosis_rules
for select to authenticated
using (active = true or public.window_is_admin());

create policy window_diagnosis_rules_manage
on public.window_diagnosis_rules
for all to authenticated
using (public.window_is_admin())
with check (public.window_is_admin());

create policy window_evaluation_cases_admin
on public.window_evaluation_cases
for all to authenticated
using (public.window_can_manage_company(company_id))
with check (public.window_can_manage_company(company_id));

create policy window_daily_metrics_admin
on public.window_daily_metrics
for select to authenticated
using (public.window_can_manage_company(company_id));

create policy window_audit_logs_admin
on public.window_audit_logs
for select to authenticated
using (public.window_can_manage_company(company_id));

create policy window_content_select
on public.window_app_content_versions
for select to authenticated
using (status = 'active' or public.window_is_admin());

create policy window_content_manage
on public.window_app_content_versions
for all to authenticated
using (public.window_is_admin())
with check (public.window_is_admin());

create trigger trg_window_memberships_updated_at
before update on public.window_staff_memberships
for each row execute function public.window_set_updated_at();
create trigger trg_window_inspections_updated_at
before update on public.window_inspections
for each row execute function public.window_set_updated_at();
create trigger trg_window_locations_updated_at
before update on public.window_inspection_locations
for each row execute function public.window_set_updated_at();
create trigger trg_window_photos_updated_at
before update on public.window_inspection_photos
for each row execute function public.window_set_updated_at();
create trigger trg_window_symptoms_updated_at
before update on public.window_location_symptoms
for each row execute function public.window_set_updated_at();
create trigger trg_window_jobs_updated_at
before update on public.window_analysis_jobs
for each row execute function public.window_set_updated_at();
create trigger trg_window_reviews_updated_at
before update on public.window_staff_reviews
for each row execute function public.window_set_updated_at();
create trigger trg_window_actions_updated_at
before update on public.window_actual_actions
for each row execute function public.window_set_updated_at();
create trigger trg_window_rules_updated_at
before update on public.window_diagnosis_rules
for each row execute function public.window_set_updated_at();

commit;
