-- READ ONLY: run after 20260805000001_employee_merge.sql

-- 1) Required columns.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'employees'
  and column_name in ('merged_into_employee_id', 'merged_at', 'merged_by')
order by column_name;

-- 2) Required table/functions and security-definer state.
select p.proname, p.prosecdef as security_definer, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_employee_merge_impact', 'merge_employees', 'list_employee_merge_states')
order by p.proname;

select to_regclass('public.employee_merge_logs') as merge_log_table,
       to_regclass('public.employee_merge_logs_company_executed_idx') as company_time_index,
       to_regclass('public.employees_merged_into_employee_id_idx') as merged_employee_index;

-- 3) RLS and policies.
select c.relname, c.relrowsecurity
from pg_class c where c.oid = 'public.employee_merge_logs'::regclass;
select policyname, cmd, roles
from pg_policies where schemaname = 'public' and tablename = 'employee_merge_logs';

-- 4) Complete FK inventory after migration, including merge metadata/log references.
select n.nspname as table_schema, c.relname as table_name, a.attname as column_name,
       fk.conname, pg_get_constraintdef(fk.oid) as definition
from pg_constraint fk
join pg_class c on c.oid = fk.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
order by n.nspname, c.relname, a.attname;

-- 5) Merge audit and invariant verification. The second query must return zero rows.
select id, source_employee_id, target_employee_id, transferred_counts,
       before_totals, after_totals, executed_by, executed_at
from public.employee_merge_logs
order by executed_at desc limit 100;

select l.id, l.source_employee_id, l.target_employee_id, e.is_active,
       e.merged_into_employee_id, e.merged_at, e.merged_by
from public.employee_merge_logs l
join public.employees e on e.id = l.source_employee_id
where e.is_active
   or e.merged_into_employee_id is distinct from l.target_employee_id
   or e.merged_at is null
   or e.merged_by is null
   or l.before_totals is distinct from l.after_totals;

-- 6) Merged employees must not remain in active assignee candidates.
select id, name, is_active, merged_into_employee_id, merged_at
from public.employees
where merged_into_employee_id is not null and is_active;
