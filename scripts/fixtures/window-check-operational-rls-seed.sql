-- CI-only de-identified RLS seed for Window Check operational migration.
-- Never apply to Production.

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'inspector@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'other@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.companies (id, name, status)
values ('20000000-0000-4000-8000-000000000001', 'Deidentified Fixture Company', 'active');

insert into public.employees (id, company_id, name, title, is_active) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Inspector Fixture', 'staff', true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Other Fixture', 'staff', true),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Admin Fixture', 'admin', true);

insert into public.profiles (
  id, employee_id, active_company_id, is_active, is_approved, approval_status
) values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true, true, 'approved'),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', true, true, 'approved'),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', true, true, 'approved');

insert into public.company_memberships (
  id, company_id, user_id, employee_id, role, status
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'employee', 'active'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'employee', 'active'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'admin', 'active');

insert into public.customers (id, company_id, assigned_employee_id) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');

insert into public.projects (id, company_id, customer_id) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001');

insert into public.window_inspections (
  id,
  company_id,
  customer_id,
  project_id,
  performed_by_user_id,
  performed_by_employee_id,
  inspection_status,
  report_status,
  client_request_id
) values (
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'in_progress',
  'draft',
  '70000000-0000-4000-8000-000000000001'
);
