-- Employee Master post-migration verification.
-- Read only. Run only after 20260804000001_employee_master.sql succeeds.

-- 1) New functions and RPCs must all exist.
select
  to_regprocedure('public.normalize_employee_phone(text)') is not null
    as normalize_employee_phone_ready,
  to_regprocedure('public.list_employee_master()') is not null
    as list_employee_master_ready,
  to_regprocedure('public.unlink_employee_login(uuid)') is not null
    as unlink_employee_login_ready,
  to_regprocedure('public.update_employee_login_role(uuid,text)') is not null
    as update_employee_login_role_ready,
  to_regprocedure('public.create_employee_master(text,uuid,text,text,text)') is not null
    as create_employee_master_ready,
  to_regprocedure('public.update_employee_master(uuid,text,uuid,text,text,text,boolean)') is not null
    as update_employee_master_ready,
  to_regprocedure('public.transfer_employee_assignments(uuid,uuid)') is not null
    as transfer_employee_assignments_ready,
  to_regprocedure('public.approve_staff_signup(uuid,text,uuid,text,text,uuid)') is not null
    as approve_staff_signup_ready;

-- 2) Employee protection triggers must exist and be enabled.
select
  expected.trigger_name,
  trigger_row.tgname is not null as present,
  trigger_row.tgenabled as enabled_status
from (
  values
    ('employees_prevent_delete'),
    ('employees_prevent_duplicate')
) as expected(trigger_name)
left join (
  select t.tgname, t.tgenabled
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.employees'::regclass
    and not t.tgisinternal
) as trigger_row
  on trigger_row.tgname = expected.trigger_name
order by expected.trigger_name;

-- 3) One-login-per-employee index must exist and be valid/ready/live.
select
  x.relname as index_name,
  ix.indisunique,
  ix.indisvalid,
  ix.indisready,
  ix.indislive,
  pg_catalog.pg_get_indexdef(ix.indexrelid) as index_definition
from pg_catalog.pg_index ix
join pg_catalog.pg_class x on x.oid = ix.indexrelid
join pg_catalog.pg_namespace n on n.oid = x.relnamespace
where n.nspname = 'public'
  and x.relname = 'profiles_employee_login_uidx';

-- 4) Business assignment counts must match the recorded preflight counts.
select 'customers' as source_table, count(*) as assigned_rows
from public.customers
where assigned_employee_id is not null
union all
select 'quotes', count(*)
from public.quotes
where assigned_employee_id is not null
union all
select 'customer_schedules', count(*)
from public.customer_schedules
where assigned_employee_id is not null
union all
select 'project_process_schedules', count(*)
from public.project_process_schedules
where assigned_employee_id is not null
order by source_table;
