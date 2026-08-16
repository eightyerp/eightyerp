# v0.5.1 Window inspection rollout

This branch prepares the workflow hub and `window_inspections` sync ledger. It does not apply production SQL.

## Preflight

1. Confirm `current_company_id()`, company-scoped `customers`, `projects`, `profiles`, and `employees` exist.
2. Run the migration on an isolated preview database.
3. Verify an active employee can upsert only their own inspection and cannot read another company.
4. Verify inactive/unapproved profiles and mismatched customer/project pairs are rejected.

## Report reference

`report_reference` is the generated report number, not a `content://`, `file://`, Windows path, Storage object, or downloadable URL. ERP may display the structured summary and report number only. It must not render a PDF-open button unless a future server Storage reference exists. PDF/photo Storage sync is backlog.

## Update scope

The current mobile approval is performed by the inspection employee. UPDATE remains self-only through `performed_by_user_id = auth.uid()`. Manager/admin review is not opened in v0.5.1; adding it requires a separate product decision and role-scoped policy.

## Rollback

Use `supabase/rollback/20260816012630_window_inspection_workflow_hub_down.sql` only during an approved maintenance window.

1. Stop rollout of the syncing APK and block new Data API writes by revoking `insert, update` from `authenticated`.
2. If any production rows exist, export `window_inspections` and the four source-ID columns on consultation/quote rows before proceeding.
3. Remove quote and consultation source indexes/foreign-key columns first.
4. Remove inspection policies, grants, indexes, then the inspection table without `CASCADE`.
5. Reload PostgREST schema and verify legacy customer/project/consultation/quote reads and quote creation.

No Storage policy is included: v0.5.1 syncs structured inspection summaries, never photo blobs, PDF files, or internal notes.
