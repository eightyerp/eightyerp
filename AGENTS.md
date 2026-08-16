<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:EIGHTY_ERP_GUARDRAILS -->
# Eighty ERP project guardrails

Before changing ERP code, read `docs/ERP_MASTER_BASELINE.md` and treat it as the project status Source of Truth.

## Source of Truth

- Production code branch: `main`.
- Production database: Supabase `eighty-erp` / `zhihbyarqpkudqyomcxv`.
- Do not infer production schema from migration files alone. Read the live schema/ledger before DB-dependent work.
- If live DB, latest main, and status docs disagree, verify live DB + latest main first and update the status doc in the same stabilization work.

## Product boundaries

- ERP owns master customer/employee/quote/contract/project/schedule/finance/material data.
- CRM is an interior-sales execution surface and must reuse ERP master data instead of creating a parallel customer/quote/contract/collection source of truth.
- Window Lab owns window-sales specialization and hands off to ERP through stable IDs.
- Window Check owns inspection/photo/report collection and must not be re-embedded as an Android application inside the ERP repository.

## Change discipline

- Prefer one purpose per PR.
- Split large features into gates; do not combine UI, DB migration, external delivery and unrelated refactors in one merge.
- Do not merge old long-lived branches wholesale when main has moved materially; rebase/rebuild the required behavior on latest main.
- Keep `main` free of audit placeholders, experiments and temporary production probes.
- Never deploy DB-dependent app code before its approved forward migration when the app requires the new schema.
- For DB changes: live read-only preflight → forward migration → verification/rollback plan → approval → DB apply → verification → app merge/deploy.

## Performance guardrails

- Resolve auth/company/role once per server request and reuse it.
- Avoid repeated reads of the same source for separate dashboard cards.
- Parallelize independent reads after access scope is known.
- Avoid full-list client downloads for customer/quote/schedule screens.
- Prefer one notification bundle query over multiple category round trips.
- Background polling must pause while the document is hidden and should refresh when the user returns.
- Treat `dashboard → customers → quotes → quote detail/save → schedules` as the core performance path.

## Safety

- Preserve multi-company isolation and assignee/team scope.
- Do not weaken RLS or SECURITY DEFINER ACLs to solve a UI problem.
- Prefer soft-delete/archive semantics for business records with history.
- Do not modify Production data, secrets, deploy settings, billing or external messaging unless that operation is explicitly in the approved task scope.
<!-- END:EIGHTY_ERP_GUARDRAILS -->
