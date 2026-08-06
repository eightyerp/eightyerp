-- Employee Merge operational status summary (READ ONLY)
-- Safe before/after 20260805000001_employee_merge.sql.
-- Exactly one SELECT statement returning exactly one row.

with required_columns(column_name) as (
  values
    ('merged_into_employee_id'::text),
    ('merged_at'::text),
    ('merged_by'::text)
), column_status as (
  select coalesce(
    array_agg(r.column_name order by r.column_name)
      filter (where c.column_name is null),
    '{}'::text[]
  ) as missing_columns
  from required_columns r
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'employees'
   and c.column_name = r.column_name
), required_functions(function_signature) as (
  values
    ('public.get_employee_merge_impact(uuid,uuid)'::text),
    ('public.merge_employees(uuid,uuid,uuid,text)'::text),
    ('public.list_employee_merge_states()'::text)
), function_status as (
  select coalesce(
    array_agg(r.function_signature order by r.function_signature)
      filter (where to_regprocedure(r.function_signature) is null),
    '{}'::text[]
  ) as missing_functions
  from required_functions r
), object_status as (
  select to_regclass('public.employee_merge_logs') is not null as merge_log_exists
), composite_fk_status as (
  select count(*)::integer as unsupported_composite_fks
  from pg_constraint fk
  where fk.contype = 'f'
    and fk.confrelid = 'public.employees'::regclass
    and (
      array_length(fk.conkey, 1) <> 1
      or array_length(fk.confkey, 1) <> 1
    )
), coverage_status as (
  select count(*)::integer as block_unsupported_composite_count
  from pg_constraint fk
  where fk.contype = 'f'
    and fk.confrelid = 'public.employees'::regclass
    and (
      array_length(fk.conkey, 1) <> 1
      or array_length(fk.confkey, 1) <> 1
    )
), base_status as (
  select
    cs.missing_columns,
    fs.missing_functions,
    os.merge_log_exists,
    cf.unsupported_composite_fks,
    cov.block_unsupported_composite_count,
    cardinality(cs.missing_columns) = 0
      and cardinality(fs.missing_functions) = 0
      and os.merge_log_exists as migration_applied
  from column_status cs
  cross join function_status fs
  cross join object_status os
  cross join composite_fk_status cf
  cross join coverage_status cov
), employee_invariant_status as (
  select count(*)::integer as invalid_merged_employee_count
  from public.employees e
  cross join base_status b
  where b.migration_applied
    and (
      to_jsonb(e) ->> 'merged_into_employee_id' = e.id::text
      or (
        to_jsonb(e) ->> 'merged_into_employee_id' is not null
        and (
          e.is_active
          or to_jsonb(e) ->> 'merged_at' is null
          or to_jsonb(e) ->> 'merged_by' is null
        )
      )
    )
), log_invariant_status as (
  select
    case
      when not b.migration_applied then null::integer
      else (
        (xpath(
          'count(/table/row)',
          query_to_xml(
            $query$
              select 1 as violation
              from public.employee_merge_logs l
              join public.employees e on e.id = l.source_employee_id
              where to_jsonb(e) ->> 'merged_into_employee_id'
                      is distinct from l.target_employee_id::text
                 or l.before_totals is distinct from l.after_totals
            $query$,
            true,
            false,
            ''
          )
        ))[1]::text::numeric::integer
      )
    end as violation_count
  from base_status b
)
select
  (
    b.migration_applied
    and b.unsupported_composite_fks = 0
    and b.block_unsupported_composite_count = 0
    and eis.invalid_merged_employee_count = 0
    and lis.violation_count = 0
  ) as employee_merge_go,
  b.migration_applied,
  b.missing_columns,
  b.missing_functions,
  b.merge_log_exists,
  b.unsupported_composite_fks,
  b.block_unsupported_composite_count,
  eis.invalid_merged_employee_count,
  case
    when lis.violation_count is null
      then jsonb_build_array('SKIPPED_MIGRATION_NOT_APPLIED')
    when lis.violation_count = 0
      then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('violation_count', lis.violation_count))
  end as employee_merge_log_invariant_violations
from base_status b
cross join employee_invariant_status eis
cross join log_invariant_status lis;
