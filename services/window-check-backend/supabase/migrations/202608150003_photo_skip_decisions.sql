-- EIGHTY Window Check v0.3 flexible capture decisions
-- Apply only to development project bnscmhkrjruguwfbutnm.
-- Never apply to ERP production project zhihbyarqpkudqyomcxv.

alter table if exists public.window_inspections
  add column if not exists capture_mode text not null default 'simple'
    check (capture_mode in ('simple', 'detailed'));

create table if not exists public.window_photo_decisions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.window_inspections(id) on delete cascade,
  location_id uuid not null references public.window_inspection_locations(id) on delete cascade,
  window_unit_id uuid not null references public.window_units(id) on delete cascade,
  category text not null check (category in (
    'frame_corner','glass','lower_rail','handle_lock',
    'upper_frame','left_side','right_side','sealant','condensation',
    'insulated_glass_fogging','external_water_leak','drainage',
    'mold_corrosion','frame_damage','hardware_damage','wall_joint','other'
  )),
  decision_status text not null check (decision_status in ('skipped','deferred','not_applicable')),
  reason_code text not null check (reason_code in (
    'covered_by_whole_photo','no_visible_issue','not_needed_on_site',
    'customer_request','detailed_check_later','cannot_capture_safely','other'
  )),
  reason_text text,
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (window_unit_id, category)
);

create index if not exists window_photo_decisions_inspection_idx
  on public.window_photo_decisions (inspection_id);
create index if not exists window_photo_decisions_unit_idx
  on public.window_photo_decisions (window_unit_id);

alter table public.window_photo_decisions enable row level security;

create policy window_photo_decisions_select
on public.window_photo_decisions
for select
to authenticated
using (
  exists (
    select 1
    from public.window_inspections i
    join public.window_employee_links e
      on e.window_auth_user_id = auth.uid()
     and e.active = true
    where i.id = window_photo_decisions.inspection_id
      and (
        e.role in ('manager','admin','owner')
        or i.created_by = auth.uid()
        or i.assigned_employee_id = auth.uid()
      )
  )
);

create policy window_photo_decisions_insert
on public.window_photo_decisions
for insert
to authenticated
with check (
  decided_by = auth.uid()
  and exists (
    select 1
    from public.window_inspections i
    join public.window_employee_links e
      on e.window_auth_user_id = auth.uid()
     and e.active = true
    where i.id = window_photo_decisions.inspection_id
      and (
        e.role in ('manager','admin','owner')
        or i.created_by = auth.uid()
        or i.assigned_employee_id = auth.uid()
      )
  )
);

create policy window_photo_decisions_update
on public.window_photo_decisions
for update
to authenticated
using (
  decided_by = auth.uid()
  or exists (
    select 1
    from public.window_employee_links e
    where e.window_auth_user_id = auth.uid()
      and e.active = true
      and e.role in ('manager','admin','owner')
  )
)
with check (
  decided_by = auth.uid()
  or exists (
    select 1
    from public.window_employee_links e
    where e.window_auth_user_id = auth.uid()
      and e.active = true
      and e.role in ('manager','admin','owner')
  )
);

create policy window_photo_decisions_delete
on public.window_photo_decisions
for delete
to authenticated
using (
  decided_by = auth.uid()
  or exists (
    select 1
    from public.window_employee_links e
    where e.window_auth_user_id = auth.uid()
      and e.active = true
      and e.role in ('manager','admin','owner')
  )
);

create trigger window_photo_decisions_set_updated_at
before update on public.window_photo_decisions
for each row execute function public.window_set_updated_at();
