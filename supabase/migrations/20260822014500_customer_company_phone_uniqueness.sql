-- =============================================================================
-- Eighty ERP — customer phone uniqueness for multi-company CRM
--
-- Problem
--   The original CRM schema used `customers_phone_unique unique(phone)` before
--   company_id existed. That global constraint can reject the same customer
--   phone in two different companies even though RLS and duplicate lookup are
--   company-scoped.
--
-- Policy
--   - Active customers: normalized phone digits are unique inside one company.
--   - Different companies may use the same phone.
--   - Soft-deleted customers do not block a new active customer.
--   - No customer row is modified by this migration.
--   - If existing active data is ambiguous, fail closed before dropping the old
--     global constraint so Production can be reviewed without destructive merge.
-- =============================================================================

begin;

do $$
declare
  v_null_company_count integer;
  v_same_company_duplicate_groups integer;
begin
  select count(*)::integer
  into v_null_company_count
  from public.customers customer_row
  where customer_row.deleted_at is null
    and customer_row.company_id is null;

  if v_null_company_count <> 0 then
    raise exception
      'customer phone uniqueness preflight failed: active customers with null company_id=%',
      v_null_company_count;
  end if;

  select count(*)::integer
  into v_same_company_duplicate_groups
  from (
    select
      customer_row.company_id,
      regexp_replace(coalesce(customer_row.phone, ''), '\D', '', 'g') as phone_digits
    from public.customers customer_row
    where customer_row.deleted_at is null
      and customer_row.company_id is not null
      and length(regexp_replace(coalesce(customer_row.phone, ''), '\D', '', 'g')) in (10, 11)
    group by
      customer_row.company_id,
      regexp_replace(coalesce(customer_row.phone, ''), '\D', '', 'g')
    having count(*) > 1
  ) duplicate_group;

  if v_same_company_duplicate_groups <> 0 then
    raise exception
      'customer phone uniqueness preflight failed: same-company normalized duplicate groups=%',
      v_same_company_duplicate_groups;
  end if;
end $$;

-- Old pre-company global uniqueness. Dropped only after the preflight above.
alter table public.customers
  drop constraint if exists customers_phone_unique;

-- Some environments may have recreated the old rule as a standalone index.
-- Remove only the exact legacy name; do not touch unrelated customer indexes.
drop index if exists public.customers_phone_unique;

create unique index if not exists customers_company_phone_digits_active_unique
on public.customers (
  company_id,
  (regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
)
where deleted_at is null
  and company_id is not null
  and length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) in (10, 11);

comment on index public.customers_company_phone_digits_active_unique is
  'Active CRM customer phone digits are unique per company. Soft-deleted rows do not block reuse.';

do $$
declare
  v_legacy_constraint_count integer;
  v_new_index_valid boolean;
begin
  select count(*)::integer
  into v_legacy_constraint_count
  from pg_constraint constraint_row
  join pg_class table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'customers'
    and constraint_row.conname = 'customers_phone_unique';

  select coalesce(index_row.indisunique and index_row.indisvalid, false)
  into v_new_index_valid
  from pg_index index_row
  join pg_class index_class on index_class.oid = index_row.indexrelid
  join pg_namespace namespace_row on namespace_row.oid = index_class.relnamespace
  where namespace_row.nspname = 'public'
    and index_class.relname = 'customers_company_phone_digits_active_unique';

  if v_legacy_constraint_count <> 0 or not coalesce(v_new_index_valid, false) then
    raise exception
      'customer phone uniqueness verify failed: legacy_constraint=%, new_index_valid=%',
      v_legacy_constraint_count,
      coalesce(v_new_index_valid, false);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
