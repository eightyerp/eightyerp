-- EIGHTY Window Check development backend v0.3.0
-- Guarded for project ref bnscmhkrjruguwfbutnm by external deployment script.
-- This migration MUST NOT be applied to ERP production project zhihbyarqpkudqyomcxv.

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

create table if not exists public.window_employee_links (
  id uuid primary key default gen_random_uuid(),
  company_external_id uuid,
  window_auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  erp_employee_id uuid,
  employee_name text not null check (length(trim(employee_name)) > 0),
  team_name text,
  position_name text,
  role text not null default 'employee'
    check (role in ('employee','manager','admin','owner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.window_inspections (
  id uuid primary key default gen_random_uuid(),
  external_company_id uuid,
  external_customer_id uuid,
  external_project_id uuid,
  created_by uuid not null references auth.users(id),
  assigned_employee_id uuid references auth.users(id),
  status text not null default 'draft'
    check (status in (
      'draft','capturing','uploading','analysis_queued','analyzing',
      'retake_required','staff_review','ready_to_issue','issued',
      'closed','deleted'
    )),
  inspection_date timestamptz not null default now(),
  customer_display_name text,
  site_display_name text not null,
  address_summary text,
  building text,
  unit text,
  consent_confirmed boolean not null default false,
  consent_confirmed_at timestamptz,
  app_version text not null default '0.3.0-dev',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.window_inspection_locations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_name text not null,
  location_order integer not null default 0 check (location_order >= 0),
  orientation text,
  indoor_temperature numeric(5,2),
  indoor_humidity numeric(5,2) check (indoor_humidity is null or indoor_humidity between 0 and 100),
  employee_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, location_order)
);

create table if not exists public.window_units (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  unit_name text not null,
  unit_order integer not null default 0 check (unit_order >= 0),
  window_type text,
  interior_or_exterior text,
  single_or_double text,
  extension_status text,
  estimated_years_in_use text,
  brand text,
  model_name text,
  frame_material text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (location_id, unit_order)
);

create table if not exists public.window_unit_measurements (
  id uuid primary key default gen_random_uuid(),
  window_unit_id uuid not null unique references public.window_units(id) on delete cascade,
  width_mm integer check (width_mm is null or width_mm > 0),
  height_mm integer check (height_mm is null or height_mm > 0),
  quantity integer not null default 1 check (quantity > 0),
  opening_type text,
  glass_spec text,
  color text,
  demolition_required boolean,
  lifting_required boolean,
  exterior_caulk_required boolean,
  interior_finish_required boolean,
  insect_screen_required boolean,
  measurement_note text,
  measured_by uuid references auth.users(id),
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.window_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  category text not null check (category in (
    'whole_window','frame_corner','glass','lower_rail','handle_lock',
    'upper_frame','left_side','right_side','sealant','condensation',
    'insulated_glass_fogging','external_water_leak','drainage',
    'mold_corrosion','frame_damage','hardware_damage','wall_joint','other'
  )),
  sequence integer not null default 0 check (sequence >= 0),
  original_storage_path text not null,
  analysis_storage_path text,
  thumbnail_storage_path text,
  file_hash text not null,
  perceptual_hash text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text not null default 'image/jpeg',
  captured_at timestamptz,
  employee_description text,
  occurrence_condition text,
  selected_for_analysis boolean not null default true,
  upload_status text not null default 'uploaded'
    check (upload_status in (
      'local_draft','waiting_for_network','compressing','uploading',
      'uploaded','analysis_queued','analyzing','completed',
      'retake_required','failed'
    )),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(window_unit_id, category, sequence)
);

create table if not exists public.window_unit_symptoms (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null unique references public.window_units(id) on delete cascade,
  years_in_use text,
  draft_level text,
  condensation_frequency text,
  condensation_locations jsonb not null default '[]'::jsonb,
  fogging_suspected boolean,
  leak_frequency text,
  leak_weather_condition text,
  leak_locations jsonb not null default '[]'::jsonb,
  active_water_visible boolean,
  opening_condition text,
  lock_condition text,
  noise_level text,
  mold_status text,
  previous_repairs jsonb not null default '[]'::jsonb,
  employee_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.window_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued','validating','processing','completed','needs_retake','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  prompt_version text not null default 'window-v1',
  schema_version text not null default '1.0',
  model_name text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  error_code text,
  error_message text
);

create table if not exists public.window_ai_results (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null unique references public.window_analysis_jobs(id) on delete cascade,
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  model_name text not null,
  prompt_version text not null,
  schema_version text not null,
  raw_result_json jsonb not null,
  validated_result_json jsonb not null,
  openai_response_id text,
  input_photo_count integer not null default 0,
  processing_time_ms integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(12,6),
  created_at timestamptz not null default now()
);

create table if not exists public.window_staff_reviews (
  id uuid primary key default gen_random_uuid(),
  ai_result_id uuid not null unique references public.window_ai_results(id) on delete cascade,
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  reviewed_by uuid not null references auth.users(id),
  correction_type text not null
    check (correction_type in ('accurate','partially_corrected','incorrect','not_judgable')),
  final_result_json jsonb not null,
  final_grade text not null,
  recommended_actions jsonb not null default '[]'::jsonb,
  customer_comment text,
  internal_comment text,
  quote_required boolean not null default false,
  measurement_required boolean not null default false,
  revisit_required boolean not null default false,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.window_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  report_number text not null,
  report_version integer not null default 1 check (report_version > 0),
  report_snapshot_json jsonb not null,
  generated_by uuid not null references auth.users(id),
  report_storage_path text not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (inspection_id, report_version),
  unique (report_number)
);

create table if not exists public.window_report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.window_reports(id) on delete cascade,
  attachment_type text not null check (attachment_type in ('quote','photo','other')),
  external_quote_id uuid,
  file_name text not null,
  storage_path text,
  external_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.window_report_send_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.window_reports(id) on delete cascade,
  sent_by uuid not null references auth.users(id),
  channel text not null,
  recipient_summary text,
  sent_at timestamptz not null default now(),
  send_status text not null default 'shared'
    check (send_status in ('shared','sent','failed','unknown')),
  error_message text
);

create table if not exists public.window_actual_actions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  action_type text not null check (action_type in (
    'cleaning','sash_adjustment','hardware_replacement','sealant_repair',
    'external_caulk_repair','drainage_repair','glass_replacement',
    'full_window_replacement','wall_repair','no_action','other'
  )),
  action_description text not null,
  action_date date,
  handled_by uuid references auth.users(id),
  result_after_action text,
  recurrence_status text,
  followup_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.window_followup_photos (
  id uuid primary key default gen_random_uuid(),
  actual_action_id uuid not null references public.window_actual_actions(id) on delete cascade,
  photo_id uuid not null references public.window_photos(id) on delete cascade,
  phase text not null check (phase in ('before','after','recurrence')),
  created_at timestamptz not null default now(),
  unique(actual_action_id, photo_id, phase)
);

create table if not exists public.window_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  developer_prompt text not null,
  schema_version text not null,
  status text not null default 'draft'
    check (status in ('draft','testing','approved','active','retired','rolled_back')),
  change_summary text not null,
  evaluation_result jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  activated_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists window_prompt_versions_one_active
  on public.window_prompt_versions ((status))
  where status = 'active';

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
  unique(rule_key, version)
);

create table if not exists public.window_evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  ai_result_id uuid not null references public.window_ai_results(id) on delete cascade,
  staff_review_id uuid not null references public.window_staff_reviews(id) on delete cascade,
  actual_action_id uuid references public.window_actual_actions(id) on delete set null,
  anonymized boolean not null default false,
  approved_for_evaluation boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  evaluation_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.window_app_content_versions (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  version text not null,
  content_json jsonb not null,
  status text not null default 'draft'
    check (status in ('draft','testing','approved','active','retired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(content_type, version)
);

create unique index if not exists window_app_content_one_active_per_type
  on public.window_app_content_versions (content_type)
  where status = 'active';

create table if not exists public.window_daily_metrics (
  metric_date date primary key,
  inspections_count integer not null default 0,
  locations_count integer not null default 0,
  window_units_count integer not null default 0,
  photos_count integer not null default 0,
  analyses_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  retake_count integer not null default 0,
  staff_correction_count integer not null default 0,
  not_judgable_count integer not null default 0,
  average_processing_time integer not null default 0,
  estimated_ai_cost numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.window_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata_without_personal_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists window_inspections_created_by_idx on public.window_inspections(created_by, created_at desc);
create index if not exists window_locations_inspection_idx on public.window_inspection_locations(inspection_id, location_order);
create index if not exists window_units_location_idx on public.window_units(location_id, unit_order);
create index if not exists window_photos_unit_idx on public.window_photos(window_unit_id, category, sequence);
create index if not exists window_jobs_status_idx on public.window_analysis_jobs(status, queued_at);
create index if not exists window_reviews_inspection_idx on public.window_staff_reviews(inspection_id, confirmed);
create index if not exists window_reports_inspection_idx on public.window_reports(inspection_id, issued_at desc);

drop trigger if exists window_employee_links_updated_at on public.window_employee_links;
create trigger window_employee_links_updated_at before update on public.window_employee_links
for each row execute function public.window_set_updated_at();

drop trigger if exists window_inspections_updated_at on public.window_inspections;
create trigger window_inspections_updated_at before update on public.window_inspections
for each row execute function public.window_set_updated_at();

drop trigger if exists window_locations_updated_at on public.window_inspection_locations;
create trigger window_locations_updated_at before update on public.window_inspection_locations
for each row execute function public.window_set_updated_at();

drop trigger if exists window_units_updated_at on public.window_units;
create trigger window_units_updated_at before update on public.window_units
for each row execute function public.window_set_updated_at();

drop trigger if exists window_measurements_updated_at on public.window_unit_measurements;
create trigger window_measurements_updated_at before update on public.window_unit_measurements
for each row execute function public.window_set_updated_at();

drop trigger if exists window_symptoms_updated_at on public.window_unit_symptoms;
create trigger window_symptoms_updated_at before update on public.window_unit_symptoms
for each row execute function public.window_set_updated_at();

drop trigger if exists window_reviews_updated_at on public.window_staff_reviews;
create trigger window_reviews_updated_at before update on public.window_staff_reviews
for each row execute function public.window_set_updated_at();

drop trigger if exists window_actions_updated_at on public.window_actual_actions;
create trigger window_actions_updated_at before update on public.window_actual_actions
for each row execute function public.window_set_updated_at();

drop trigger if exists window_rules_updated_at on public.window_diagnosis_rules;
create trigger window_rules_updated_at before update on public.window_diagnosis_rules
for each row execute function public.window_set_updated_at();

create or replace function public.window_current_employee()
returns public.window_employee_links
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.window_employee_links
  where window_auth_user_id = auth.uid()
    and active = true
  limit 1
$$;

revoke all on function public.window_current_employee() from public;
grant execute on function public.window_current_employee() to authenticated;

create or replace function public.window_is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('manager','admin','owner') from public.window_current_employee()), false)
$$;

revoke all on function public.window_is_manager() from public;
grant execute on function public.window_is_manager() to authenticated;

create or replace function public.window_can_access_inspection(target_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.window_inspections i
    where i.id = target_inspection_id
      and i.deleted_at is null
      and (
        i.created_by = auth.uid()
        or i.assigned_employee_id = auth.uid()
        or public.window_is_manager()
      )
  )
$$;

revoke all on function public.window_can_access_inspection(uuid) from public;
grant execute on function public.window_can_access_inspection(uuid) to authenticated;

alter table public.window_employee_links enable row level security;
alter table public.window_inspections enable row level security;
alter table public.window_inspection_locations enable row level security;
alter table public.window_units enable row level security;
alter table public.window_unit_measurements enable row level security;
alter table public.window_photos enable row level security;
alter table public.window_unit_symptoms enable row level security;
alter table public.window_analysis_jobs enable row level security;
alter table public.window_ai_results enable row level security;
alter table public.window_staff_reviews enable row level security;
alter table public.window_reports enable row level security;
alter table public.window_report_attachments enable row level security;
alter table public.window_report_send_logs enable row level security;
alter table public.window_actual_actions enable row level security;
alter table public.window_followup_photos enable row level security;
alter table public.window_prompt_versions enable row level security;
alter table public.window_diagnosis_rules enable row level security;
alter table public.window_evaluation_cases enable row level security;
alter table public.window_app_content_versions enable row level security;
alter table public.window_daily_metrics enable row level security;
alter table public.window_audit_logs enable row level security;

create policy "window employees read own profile"
on public.window_employee_links for select to authenticated
using (window_auth_user_id = auth.uid() or public.window_is_manager());

create policy "window managers manage employee links"
on public.window_employee_links for all to authenticated
using (public.window_is_manager())
with check (public.window_is_manager());

create policy "window inspections read"
on public.window_inspections for select to authenticated
using (public.window_can_access_inspection(id));

create policy "window inspections insert"
on public.window_inspections for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (select 1 from public.window_current_employee())
);

create policy "window inspections update"
on public.window_inspections for update to authenticated
using (public.window_can_access_inspection(id))
with check (public.window_can_access_inspection(id));

create policy "window child read locations"
on public.window_inspection_locations for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window child write locations"
on public.window_inspection_locations for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy "window child read units"
on public.window_units for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window child write units"
on public.window_units for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy "window measurements read"
on public.window_unit_measurements for select to authenticated
using (exists (
  select 1 from public.window_units u
  where u.id = window_unit_id and public.window_can_access_inspection(u.inspection_id)
));
create policy "window measurements write"
on public.window_unit_measurements for all to authenticated
using (exists (
  select 1 from public.window_units u
  where u.id = window_unit_id and public.window_can_access_inspection(u.inspection_id)
))
with check (exists (
  select 1 from public.window_units u
  where u.id = window_unit_id and public.window_can_access_inspection(u.inspection_id)
));

create policy "window photos read"
on public.window_photos for select to authenticated
using (deleted_at is null and public.window_can_access_inspection(inspection_id));
create policy "window photos write"
on public.window_photos for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (uploaded_by = auth.uid() and public.window_can_access_inspection(inspection_id));

create policy "window symptoms read"
on public.window_unit_symptoms for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window symptoms write"
on public.window_unit_symptoms for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy "window analysis jobs read"
on public.window_analysis_jobs for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window analysis jobs insert"
on public.window_analysis_jobs for insert to authenticated
with check (requested_by = auth.uid() and public.window_can_access_inspection(inspection_id));
create policy "window analysis jobs update server only"
on public.window_analysis_jobs for update to service_role
using (true) with check (true);

create policy "window ai results read"
on public.window_ai_results for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window ai results server write"
on public.window_ai_results for all to service_role
using (true) with check (true);

create policy "window reviews read"
on public.window_staff_reviews for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window reviews write"
on public.window_staff_reviews for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (reviewed_by = auth.uid() and public.window_can_access_inspection(inspection_id));

create policy "window reports read"
on public.window_reports for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window reports insert"
on public.window_reports for insert to authenticated
with check (generated_by = auth.uid() and public.window_can_access_inspection(inspection_id));

create policy "window report attachments read"
on public.window_report_attachments for select to authenticated
using (exists (
  select 1 from public.window_reports r
  where r.id = report_id and public.window_can_access_inspection(r.inspection_id)
));
create policy "window report attachments write"
on public.window_report_attachments for all to authenticated
using (exists (
  select 1 from public.window_reports r
  where r.id = report_id and public.window_can_access_inspection(r.inspection_id)
))
with check (exists (
  select 1 from public.window_reports r
  where r.id = report_id and public.window_can_access_inspection(r.inspection_id)
));

create policy "window send logs read"
on public.window_report_send_logs for select to authenticated
using (exists (
  select 1 from public.window_reports r
  where r.id = report_id and public.window_can_access_inspection(r.inspection_id)
));
create policy "window send logs insert"
on public.window_report_send_logs for insert to authenticated
with check (
  sent_by = auth.uid()
  and exists (
    select 1 from public.window_reports r
    where r.id = report_id and public.window_can_access_inspection(r.inspection_id)
  )
);

create policy "window actions read"
on public.window_actual_actions for select to authenticated
using (public.window_can_access_inspection(inspection_id));
create policy "window actions write"
on public.window_actual_actions for all to authenticated
using (public.window_can_access_inspection(inspection_id))
with check (public.window_can_access_inspection(inspection_id));

create policy "window followup photos read"
on public.window_followup_photos for select to authenticated
using (exists (
  select 1 from public.window_actual_actions a
  where a.id = actual_action_id and public.window_can_access_inspection(a.inspection_id)
));
create policy "window followup photos write"
on public.window_followup_photos for all to authenticated
using (exists (
  select 1 from public.window_actual_actions a
  where a.id = actual_action_id and public.window_can_access_inspection(a.inspection_id)
))
with check (exists (
  select 1 from public.window_actual_actions a
  where a.id = actual_action_id and public.window_can_access_inspection(a.inspection_id)
));

create policy "window governance read"
on public.window_prompt_versions for select to authenticated
using (true);
create policy "window governance managers"
on public.window_prompt_versions for all to authenticated
using (public.window_is_manager()) with check (public.window_is_manager());

create policy "window rules read"
on public.window_diagnosis_rules for select to authenticated
using (true);
create policy "window rules managers"
on public.window_diagnosis_rules for all to authenticated
using (public.window_is_manager()) with check (public.window_is_manager());

create policy "window evaluation read managers"
on public.window_evaluation_cases for select to authenticated
using (public.window_is_manager());
create policy "window evaluation manage"
on public.window_evaluation_cases for all to authenticated
using (public.window_is_manager()) with check (public.window_is_manager());

create policy "window content read active"
on public.window_app_content_versions for select to authenticated
using (status = 'active' or public.window_is_manager());
create policy "window content manage"
on public.window_app_content_versions for all to authenticated
using (public.window_is_manager()) with check (public.window_is_manager());

create policy "window metrics read managers"
on public.window_daily_metrics for select to authenticated
using (public.window_is_manager());
create policy "window metrics server write"
on public.window_daily_metrics for all to service_role
using (true) with check (true);

create policy "window audit read managers"
on public.window_audit_logs for select to authenticated
using (public.window_is_manager());
create policy "window audit server insert"
on public.window_audit_logs for insert to service_role
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('window-inspection-private', 'window-inspection-private', false, 15728640, array['image/jpeg','image/png','image/webp']),
  ('window-report-private', 'window-report-private', false, 26214400, array['application/pdf']),
  ('window-app-releases-private', 'window-app-releases-private', false, 104857600, array['application/vnd.android.package-archive','application/octet-stream'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "window inspection objects read"
on storage.objects for select to authenticated
using (
  bucket_id = 'window-inspection-private'
  and exists (
    select 1
    from public.window_photos p
    where (
          p.original_storage_path = name
       or p.analysis_storage_path = name
       or p.thumbnail_storage_path = name
    )
      and public.window_can_access_inspection(p.inspection_id)
  )
);

create policy "window inspection objects insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'window-inspection-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "window inspection objects update"
on storage.objects for update to authenticated
using (
  bucket_id = 'window-inspection-private'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'window-inspection-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "window inspection objects delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'window-inspection-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "window report objects read"
on storage.objects for select to authenticated
using (
  bucket_id = 'window-report-private'
  and exists (
    select 1
    from public.window_reports r
    where r.report_storage_path = name
      and public.window_can_access_inspection(r.inspection_id)
  )
);

create policy "window report objects insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'window-report-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "window release objects managers"
on storage.objects for select to authenticated
using (
  bucket_id = 'window-app-releases-private'
  and exists (select 1 from public.window_current_employee())
);

insert into public.window_prompt_versions (
  version, developer_prompt, schema_version, status, change_summary, activated_at
)
values (
  'window-v1',
  '사진에서 직접 확인되는 사실과 추정을 분리하고 누수·결로 원인과 교체 필요성을 확정하지 않는다. 직원 검토용 예비관찰만 JSON으로 반환한다.',
  '1.0',
  'active',
  '초기 개발용 안전 프롬프트',
  now()
)
on conflict (version) do nothing;

insert into public.window_app_content_versions (
  content_type, version, content_json, status, activated_at
)
values
(
  'capture_guide',
  '1.0',
  jsonb_build_object(
    'required', jsonb_build_array('whole_window','frame_corner','glass','lower_rail','handle_lock'),
    'safety', '외부 상태는 실내의 안전한 위치에서만 촬영하십시오. 몸이나 휴대전화를 창밖으로 내밀지 마십시오.'
  ),
  'active',
  now()
)
on conflict (content_type, version) do nothing;
