-- Interior quote Excel import audit and atomic DB commit.
-- Storage object is uploaded before this RPC; on RPC failure the server removes it.

create table if not exists public.interior_quote_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  quote_id uuid not null unique references public.quotes(id) on delete restrict,
  assigned_employee_id uuid references public.employees(id) on delete restrict,
  source_file_hash text not null,
  source_file_name text not null,
  source_file_path text not null,
  source_file_size bigint not null,
  source_mime_type text not null,
  source_sheet_name text,
  excel_customer_hint jsonb not null default '{}'::jsonb,
  parsed_totals jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint interior_quote_import_hash_check check (source_file_hash ~ '^[0-9a-f]{64}$'),
  constraint interior_quote_import_size_check check (source_file_size > 0 and source_file_size <= 15728640)
);

create index if not exists interior_quote_import_duplicate_idx
  on public.interior_quote_imports (company_id, customer_id, source_file_hash, created_at desc);
create index if not exists interior_quote_import_amount_idx
  on public.interior_quote_imports (company_id, customer_id, ((parsed_totals->>'totalAmount')::numeric), created_at desc);

alter table public.interior_quote_imports enable row level security;

drop policy if exists interior_quote_import_select on public.interior_quote_imports;
create policy interior_quote_import_select on public.interior_quote_imports
for select to authenticated
using (
  company_id = public.current_company_id()
  and (public.is_admin() or public.can_access_customer(customer_id))
);

revoke all on table public.interior_quote_imports from public, anon;
grant select on table public.interior_quote_imports to authenticated;

create or replace function public.create_interior_quote_from_excel(
  p_header jsonb,
  p_items jsonb,
  p_import jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_customer_id uuid;
  v_employee_id uuid;
  v_result jsonb;
  v_quote_id uuid;
  v_import_id uuid;
  v_path text;
  v_name text;
  v_hash text;
  v_mime text;
  v_size bigint;
  v_ext text;
begin
  if v_uid is null or v_company_id is null or not public.is_company_member(v_company_id) then
    raise exception '인증된 회사 구성원만 업로드할 수 있습니다.';
  end if;
  if coalesce(p_header->>'quote_type', '') <> '인테리어' then
    raise exception '인테리어 견적만 Excel import할 수 있습니다.';
  end if;
  v_customer_id := nullif(p_header->>'customer_id', '')::uuid;
  v_employee_id := nullif(p_header->>'assigned_employee_id', '')::uuid;
  if not exists (select 1 from public.customers c where c.id = v_customer_id and c.company_id = v_company_id and c.deleted_at is null) then
    raise exception '현재 회사에 속한 고객이 아닙니다.';
  end if;
  if not (public.is_admin() or public.can_access_customer(v_customer_id)) then
    raise exception '이 고객의 견적을 등록할 권한이 없습니다.';
  end if;
  if v_employee_id is not null and not exists (
    select 1 from public.employees e where e.id = v_employee_id and e.company_id = v_company_id and e.is_active = true
  ) then
    raise exception '현재 회사의 활성 담당자가 아닙니다.';
  end if;

  v_path := nullif(trim(p_import->>'file_path'), '');
  v_name := nullif(trim(p_import->>'file_name'), '');
  v_hash := lower(nullif(trim(p_import->>'file_hash'), ''));
  v_mime := lower(nullif(trim(p_import->>'mime_type'), ''));
  v_size := coalesce((p_import->>'file_size')::bigint, 0);
  v_ext := lower(split_part(v_name, '.', array_length(string_to_array(v_name, '.'), 1)));
  if v_path is null or v_name is null or v_hash !~ '^[0-9a-f]{64}$' or v_size <= 0 or v_size > 15728640 then
    raise exception '원본 Excel 파일 정보가 올바르지 않습니다.';
  end if;
  if v_ext not in ('xlsx', 'xls') or v_mime not in (
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ) then
    raise exception '허용되지 않은 Excel 파일 형식입니다.';
  end if;

  v_result := public.create_quote_with_items(
    p_header || jsonb_build_object('quote_type', '인테리어'),
    p_items
  );
  v_quote_id := (v_result->>'quote_id')::uuid;

  insert into public.quote_files (
    quote_id, company_id, file_type, file_path, file_name, original_file_name,
    mime_type, file_size, is_primary, uploaded_by
  ) values (
    v_quote_id, v_company_id, v_ext, v_path, v_name, v_name,
    v_mime, v_size, false, v_uid
  );

  insert into public.interior_quote_imports (
    company_id, customer_id, quote_id, assigned_employee_id,
    source_file_hash, source_file_name, source_file_path, source_file_size,
    source_mime_type, source_sheet_name, excel_customer_hint, parsed_totals, created_by
  ) values (
    v_company_id, v_customer_id, v_quote_id, v_employee_id,
    v_hash, v_name, v_path, v_size, v_mime, nullif(p_import->>'sheet_name', ''),
    coalesce(p_import->'customer_hint', '{}'::jsonb),
    coalesce(p_import->'parsed_totals', '{}'::jsonb), v_uid
  ) returning id into v_import_id;

  return v_result || jsonb_build_object('import_id', v_import_id);
end;
$$;

revoke all on function public.create_interior_quote_from_excel(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_interior_quote_from_excel(jsonb, jsonb, jsonb) to authenticated;

comment on function public.create_interior_quote_from_excel(jsonb, jsonb, jsonb) is
  'Creates interior quote, items, source file metadata, and import audit in one DB transaction.';
