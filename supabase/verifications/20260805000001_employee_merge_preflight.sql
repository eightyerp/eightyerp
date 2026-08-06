-- READ ONLY: run before 20260805000001_employee_merge.sql
-- 1) Complete current FK inventory pointing to employees.id.
select
  n.nspname as table_schema,
  c.relname as table_name,
  a.attname as column_name,
  fk.conname as fk_name,
  pg_get_constraintdef(fk.oid) as definition,
  case
    when c.relname in ('employee_master_events') then 'history_preserved'
    when c.relname in ('profiles', 'company_memberships') then 'login_special_handling'
    else 'business_transfer'
  end as merge_strategy
from pg_constraint fk
join pg_class c on c.oid = fk.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
where fk.contype = 'f'
  and fk.confrelid = 'public.employees'::regclass
order by n.nspname, c.relname, a.attname;

-- 1-A) UUID employee-looking columns without an employees FK.
-- Review every returned row; the merge RPC includes these candidates to prevent omissions.
select n.nspname as table_schema, c.relname as table_name, a.attname as column_name
from pg_attribute a
join pg_class c on c.oid = a.attrelid and c.relkind in ('r', 'p')
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
  and a.atttypid = 'uuid'::regtype
  and a.attname in ('employee_id', 'assigned_employee_id')
  and not exists (
    select 1 from pg_constraint fk
    where fk.contype = 'f' and fk.conrelid = c.oid
      and fk.confrelid = 'public.employees'::regclass
      and a.attnum = any(fk.conkey)
  )
order by n.nspname, c.relname, a.attname;

-- 2) Composite employee FKs are intentionally unsupported and must return zero rows.
select n.nspname as table_schema, c.relname as table_name, fk.conname,
       pg_get_constraintdef(fk.oid) as definition
from pg_constraint fk
join pg_class c on c.oid = fk.conrelid
join pg_namespace n on n.oid = c.relnamespace
where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
  and (array_length(fk.conkey, 1) <> 1 or array_length(fk.confkey, 1) <> 1);

-- 3) Existing duplicate profile links. Must return zero rows.
select employee_id, count(*) as linked_login_count, array_agg(id order by id) as profile_ids
from public.profiles
where employee_id is not null
group by employee_id
having count(*) > 1;

-- 4) Active owner/representative employees (cannot be used as source employees).
select m.company_id, m.employee_id, m.user_id, e.name, m.role, m.status
from public.company_memberships m
join public.employees e on e.id = m.employee_id
where m.role = 'owner' and m.status = 'active';

-- 5) Orphan employee references. Must return zero rows for each FK.
do $$
declare r record; v_count bigint;
begin
  for r in
    select n.nspname schema_name, c.relname table_name, a.attname column_name
    from pg_constraint fk
    join pg_class c on c.oid = fk.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
    where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
      and array_length(fk.conkey, 1) = 1 and array_length(fk.confkey, 1) = 1
  loop
    execute format('select count(*) from %I.%I r where r.%I is not null and not exists (select 1 from public.employees e where e.id = r.%I)',
      r.schema_name, r.table_name, r.column_name, r.column_name) into v_count;
    raise notice '%.%.% orphan_count=%', r.schema_name, r.table_name, r.column_name, v_count;
  end loop;
end;
$$;
