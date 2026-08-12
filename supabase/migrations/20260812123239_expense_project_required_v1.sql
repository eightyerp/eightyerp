-- Eighty ERP — 지출관리 1차: 모든 지출은 현장 선택 필수
-- 운영비는 별도 운영비 모듈에서 관리하고 지출관리에는 섞지 않는다.

alter table public.expense_requests
  drop constraint if exists expense_requests_scope_project_check;

alter table public.expense_requests
  add constraint expense_requests_scope_project_check
  check (
    expense_scope = 'project'
    and project_id is not null
  );

notify pgrst, 'reload schema';
