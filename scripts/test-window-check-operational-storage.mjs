import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260818030000_window_check_operational_storage_v1.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

function requireText(text, message) {
  if (!sql.includes(text)) throw new Error(message);
}

function forbid(pattern, message) {
  if (pattern.test(sql)) throw new Error(message);
}

requireText('create schema if not exists erp_private;', 'Window Check helpers must live in erp_private.');
requireText('revoke all on schema erp_private from public, anon, authenticated;', 'erp_private must be closed before explicit grants.');
requireText('create or replace function erp_private.can_access_window_inspection(', 'Missing private read-access helper.');
requireText('create or replace function erp_private.can_write_window_inspection(', 'Missing private write-access helper.');
requireText('wi.performed_by_user_id = auth.uid()', 'Client writes must be scoped to the actual inspector user.');
requireText('wi.performed_by_employee_id = public.current_employee_id()', 'Client writes must be scoped to the actual inspector employee.');
requireText('unique (company_id, report_number, report_version)', 'Report number/version uniqueness must allow immutable re-issues.');
requireText("'window-inspection-private'", 'Missing private inspection bucket.');
requireText("'window-report-private'", 'Missing private report bucket.');
requireText('and b.public = false', 'Bucket assertions must enforce private storage.');
requireText("payload_json::text not ilike '%content://%'", 'Server snapshot must reject content:// URIs.');
requireText("payload_json::text not ilike '%file://%'", 'Server snapshot must reject file:// URIs.');
requireText("raise exception 'Window Check helper unexpectedly exposed in public schema'", 'Migration must assert that Window Check helpers are not public RPCs.');

forbid(/create\s+or\s+replace\s+function\s+public\.(?:can_access_window_inspection|can_write_window_inspection|validate_window_inspection_child_company|validate_window_inspection_report_snapshot|window_storage_path_uuid)/i,
  'Window Check helper functions must not be created in public.');
forbid(/window_(?:inspection|report)_storage_[a-z_]+\s*\n\s*on\s+storage\.objects\s*\n\s*for\s+(?:update|delete)\s+to\s+authenticated/i,
  'Authenticated Storage UPDATE/DELETE must stay disabled for immutable operational media.');
forbid(/grant\s+[^;]*(?:update|delete)[^;]*on\s+public\.window_inspection_(?:snapshots|photos|reports)\s+to\s+authenticated/i,
  'Authenticated users must not get UPDATE/DELETE on immutable Window Check records.');

console.log('Window Check operational storage migration guard: PASS');
