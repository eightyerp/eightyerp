-- Employee Master preflight verification.
-- Read only. Uses existing tables and PostgreSQL built-ins only.
-- Resolve every returned duplicate/orphan row before applying the migration.

-- 1) Multiple profiles linked to one employee.
select
  employee_id,
  count(*) as linked_profile_count,
  array_agg(id order by created_at) as profile_ids
from public.profiles
where employee_id is not null
group by employee_id
having count(*) > 1
order by linked_profile_count desc, employee_id;

-- 2) Duplicate employee emails within the same company.
select
  company_id,
  lower(trim(email)) as normalized_email,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as employee_ids
from public.employees
where nullif(trim(coalesce(email, '')), '') is not null
group by company_id, lower(trim(email))
having count(*) > 1
order by duplicate_count desc, company_id, normalized_email;

-- 3) Duplicate employee phone numbers within the same company.
select
  company_id,
  nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') as normalized_phone,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as employee_ids
from public.employees
where nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') is not null
group by
  company_id,
  nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')
having count(*) > 1
order by duplicate_count desc, company_id, normalized_phone;

-- 4) Duplicate employee name and team pairs within the same company.
select
  company_id,
  lower(trim(name)) as normalized_name,
  team_id,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as employee_ids
from public.employees
group by company_id, lower(trim(name)), team_id
having count(*) > 1
order by duplicate_count desc, company_id, normalized_name, team_id;

-- 5) Profiles referencing a missing employee.
select
  p.id as profile_id,
  p.employee_id,
  p.email,
  p.approval_status
from public.profiles p
left join public.employees e on e.id = p.employee_id
where p.employee_id is not null
  and e.id is null
order by p.created_at;

-- 6) Existing business assignments. Record these counts before migration and
-- compare them with the same query after migration; the counts must not decrease.
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
