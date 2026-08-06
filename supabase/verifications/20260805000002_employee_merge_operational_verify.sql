-- Employee merge operational GO/NO-GO verification (READ ONLY)
-- Safe both before and after 20260805000001_employee_merge.sql.
-- No migration object is directly called. Missing objects produce a normal NO-GO row.

-- 1) Single GO/NO-GO result. This query never references a migration column directly.
with required_columns(column_name) as (
  values
    ('merged_into_employee_id'::text),
    ('merged_at'::text),
    ('merged_by'::text)
), present_columns as (
  select c.column_name
  from information_schema.columns c
  join required_columns r on r.column_name = c.column_name
  where c.table_schema = 'public' and c.table_name = 'employees'
), required_functions(function_signature) as (
  values
    ('public.get_employee_merge_impact(uuid,uuid)'::text),
    ('public.merge_employees(uuid,uuid,uuid,text)'::text),
    ('public.list_employee_merge_states()'::text)
), object_status as (
  select
    coalesce(array_agg(distinct r.column_name order by r.column_name)
      filter (where p.column_name is null), '{}'::text[]) as missing_columns,
    coalesce(array_agg(distinct f.function_signature order by f.function_signature)
      filter (where to_regprocedure(f.function_signature) is null), '{}'::text[]) as missing_functions,
    to_regclass('public.employee_merge_logs') is not null as merge_log_exists
  from required_columns r
  left join present_columns p on p.column_name = r.column_name
  cross join required_functions f
), employee_fk_status as (
  select
    count(*) as total_employee_fks,
    count(*) filter (
      where array_length(fk.conkey, 1) <> 1
         or array_length(fk.confkey, 1) <> 1
    ) as unsupported_composite_fks
  from pg_constraint fk
  where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
)
select
  cardinality(o.missing_columns) = 0
    and cardinality(o.missing_functions) = 0
    and o.merge_log_exists
    and f.unsupported_composite_fks = 0 as employee_merge_go,
  cardinality(o.missing_columns) = 0
    and cardinality(o.missing_functions) = 0
    and o.merge_log_exists as migration_applied,
  o.missing_columns,
  o.missing_functions,
  o.merge_log_exists,
  f.total_employee_fks,
  f.unsupported_composite_fks
from object_status o cross join employee_fk_status f;

-- 2) Complete production FK inventory. Catalog-only and safe before migration.
select n.nspname as table_schema, c.relname as table_name, a.attname as column_name,
       fk.conname, pg_get_constraintdef(fk.oid) as definition,
       case
         when array_length(fk.conkey, 1) <> 1 or array_length(fk.confkey, 1) <> 1 then 'BLOCK_UNSUPPORTED_COMPOSITE'
         when c.relname in ('employee_master_events', 'employee_merge_logs', 'employees') then 'COVERED_HISTORY_PRESERVED'
         when c.relname in ('profiles', 'company_memberships') then 'COVERED_LOGIN_SPECIAL'
         else 'COVERED_BUSINESS_TRANSFER'
       end as coverage
from pg_constraint fk
join pg_class c on c.oid = fk.conrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attribute a on a.attrelid = fk.conrelid
  and array_length(fk.conkey, 1) = 1 and a.attnum = fk.conkey[1]
where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
order by n.nspname, c.relname, a.attname;

-- 3) UUID employee-looking columns without an FK. The merge RPC covers these candidates.
select n.nspname as table_schema, c.relname as table_name, a.attname as column_name,
       'COVERED_NAMED_UUID_CANDIDATE' as coverage
from pg_attribute a
join pg_class c on c.oid = a.attrelid and c.relkind in ('r', 'p')
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
  and a.atttypid = 'uuid'::regtype
  and a.attname in ('employee_id', 'assigned_employee_id')
  and not exists (
    select 1 from pg_constraint fk
    where fk.contype = 'f' and fk.conrelid = c.oid
      and fk.confrelid = 'public.employees'::regclass and a.attnum = any(fk.conkey)
  )
order by n.nspname, c.relname, a.attname;

-- 4) Employee invariants. to_jsonb avoids parse errors when migration columns are absent.
-- With missing columns the existence guard is false, so this returns zero rows.
select
  e.id,
  e.name,
  to_jsonb(e) ->> 'merged_into_employee_id' as merged_into_employee_id,
  to_jsonb(e) ->> 'merged_at' as merged_at,
  to_jsonb(e) ->> 'merged_by' as merged_by,
  'INVALID_MERGED_EMPLOYEE' as issue
from public.employees e
where (
    select count(*) = 3
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'employees'
      and c.column_name in ('merged_into_employee_id', 'merged_at', 'merged_by')
  )
  and (
    to_jsonb(e) ->> 'merged_into_employee_id' = e.id::text
    or (
      to_jsonb(e) ->> 'merged_into_employee_id' is not null
      and e.is_active
    )
    or (
      to_jsonb(e) ->> 'merged_into_employee_id' is not null
      and (to_jsonb(e) ->> 'merged_at' is null or to_jsonb(e) ->> 'merged_by' is null)
    )
  );

-- 5) Merge-log invariant is executed only when the table and all columns exist.
-- Results are emitted as NOTICE rows in SQL Editor; absence is a normal skipped check.
do $verify_merge_log$
declare
  v_invalid jsonb;
begin
  if to_regclass('public.employee_merge_logs') is not null
     and (
       select count(*) = 3
       from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'employees'
         and c.column_name in ('merged_into_employee_id', 'merged_at', 'merged_by')
     ) then
    execute $sql$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select l.id, l.source_employee_id, l.target_employee_id
        from public.employee_merge_logs l
        join public.employees e on e.id = l.source_employee_id
        where to_jsonb(e) ->> 'merged_into_employee_id' is distinct from l.target_employee_id::text
           or l.before_totals is distinct from l.after_totals
      ) x
    $sql$ into v_invalid;
    raise notice 'employee_merge_log_invariant_violations=%', v_invalid;
  else
    raise notice 'employee_merge_log_invariant_check=SKIPPED_MIGRATION_NOT_APPLIED';
  end if;
end;
$verify_merge_log$;
