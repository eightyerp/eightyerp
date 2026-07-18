-- =============================================================================
-- Eighty ERP — 견적 지원 보완 (접근함수 / 발송로그 / RLS / Storage)
-- 파일: 20260803000005_ensure_quote_support.sql
--
-- A. public.can_access_quote(uuid)
-- B. public.quote_send_logs
-- C. quote_items SELECT/INSERT/UPDATE (can_access_quote)
-- D. quote_files SELECT/INSERT/UPDATE (can_access_quote)
-- E. private storage bucket quote-files + objects 정책
--
-- 안전: DROP TABLE / DELETE / TRUNCATE / 기존 행 초기화 없음
-- 허용: DROP POLICY / DROP TRIGGER (재정의용)
-- 재실행 가능
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) can_access_quote
-- ---------------------------------------------------------------------------
create or replace function public.can_access_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quotes q
    where q.id = p_quote_id
      and q.deleted_at is null
      and (
        public.is_admin()
        or public.can_access_customer(q.customer_id)
        or q.created_by = auth.uid()
        or q.assigned_employee_id = public.current_employee_id()
      )
  );
$$;

revoke all on function public.can_access_quote(uuid) from public;
grant execute on function public.can_access_quote(uuid) to authenticated;

-- Storage 경로(customerId/quoteId/file)에서 quoteId를 안전하게 추출
-- 잘못된 경로여도 UUID 캐스팅 오류 없이 null 반환
create or replace function public.quote_storage_path_quote_id(p_object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[];
  quote_part text;
begin
  if p_object_name is null or btrim(p_object_name) = '' then
    return null;
  end if;

  parts := string_to_array(p_object_name, '/');
  if coalesce(array_length(parts, 1), 0) < 2 then
    return null;
  end if;

  quote_part := parts[2];
  if quote_part is null
     or quote_part !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return null;
  end if;

  return quote_part::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.quote_storage_path_quote_id(text) from public;
grant execute on function public.quote_storage_path_quote_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- B) quote_send_logs
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quotes') is null or to_regclass('public.customers') is null then
    raise notice 'quotes/customers 없음 — quote_send_logs 생성 건너뜀';
    return;
  end if;

  create table if not exists public.quote_send_logs (
    id uuid primary key default gen_random_uuid(),
    quote_id uuid not null references public.quotes (id) on delete cascade,
    customer_id uuid not null references public.customers (id) on delete cascade,
    guide_message text,
    note text,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
  );

  create index if not exists quote_send_logs_quote_created_idx
    on public.quote_send_logs (quote_id, created_at desc);

  alter table public.quote_send_logs enable row level security;

  drop policy if exists "staff_quote_send_logs_select" on public.quote_send_logs;
  drop policy if exists "quote_send_logs_select_erp" on public.quote_send_logs;
  create policy "quote_send_logs_select_erp" on public.quote_send_logs
    for select to authenticated
    using (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  drop policy if exists "staff_quote_send_logs_insert" on public.quote_send_logs;
  drop policy if exists "quote_send_logs_insert_erp" on public.quote_send_logs;
  create policy "quote_send_logs_insert_erp" on public.quote_send_logs
    for insert to authenticated
    with check (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
      and exists (
        select 1
        from public.quotes q
        where q.id = quote_send_logs.quote_id
          and q.deleted_at is null
          and q.customer_id = quote_send_logs.customer_id
      )
    );

  grant select, insert on public.quote_send_logs to authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- C) quote_items 정책
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quote_items') is null then
    raise notice 'public.quote_items 없음 — RLS 정책 건너뜀';
    return;
  end if;

  alter table public.quote_items enable row level security;

  drop policy if exists "staff_quote_items_select" on public.quote_items;
  drop policy if exists "quote_items_select_erp" on public.quote_items;
  create policy "quote_items_select_erp" on public.quote_items
    for select to authenticated
    using (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  drop policy if exists "staff_quote_items_insert" on public.quote_items;
  drop policy if exists "quote_items_insert_erp" on public.quote_items;
  create policy "quote_items_insert_erp" on public.quote_items
    for insert to authenticated
    with check (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  drop policy if exists "staff_quote_items_update" on public.quote_items;
  drop policy if exists "quote_items_update_erp" on public.quote_items;
  create policy "quote_items_update_erp" on public.quote_items
    for update to authenticated
    using (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    )
    with check (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  grant select, insert, update on public.quote_items to authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- D) quote_files 정책
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quote_files') is null then
    raise notice 'public.quote_files 없음 — RLS 정책 건너뜀';
    return;
  end if;

  alter table public.quote_files enable row level security;

  drop policy if exists "staff_quote_files_select" on public.quote_files;
  drop policy if exists "quote_files_select_erp" on public.quote_files;
  create policy "quote_files_select_erp" on public.quote_files
    for select to authenticated
    using (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  drop policy if exists "staff_quote_files_insert" on public.quote_files;
  drop policy if exists "quote_files_insert_erp" on public.quote_files;
  create policy "quote_files_insert_erp" on public.quote_files
    for insert to authenticated
    with check (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  drop policy if exists "staff_quote_files_update" on public.quote_files;
  drop policy if exists "quote_files_update_erp" on public.quote_files;
  create policy "quote_files_update_erp" on public.quote_files
    for update to authenticated
    using (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    )
    with check (
      auth.uid() is not null
      and public.can_access_quote(quote_id)
    );

  grant select, insert, update on public.quote_files to authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- E) Storage: private quote-files 버킷 + objects 정책
-- 경로: {customerId}/{quoteId}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-files',
  'quote-files',
  false,
  31457280,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff_quote_files_storage_select" on storage.objects;
drop policy if exists "quote_files_storage_select_erp" on storage.objects;
create policy "quote_files_storage_select_erp" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-files'
    and auth.uid() is not null
    and public.can_access_quote(public.quote_storage_path_quote_id(name))
  );

drop policy if exists "staff_quote_files_storage_insert" on storage.objects;
drop policy if exists "quote_files_storage_insert_erp" on storage.objects;
create policy "quote_files_storage_insert_erp" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quote-files'
    and auth.uid() is not null
    and public.can_access_quote(public.quote_storage_path_quote_id(name))
  );

drop policy if exists "staff_quote_files_storage_update" on storage.objects;
drop policy if exists "quote_files_storage_update_erp" on storage.objects;
create policy "quote_files_storage_update_erp" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'quote-files'
    and auth.uid() is not null
    and public.can_access_quote(public.quote_storage_path_quote_id(name))
  )
  with check (
    bucket_id = 'quote-files'
    and auth.uid() is not null
    and public.can_access_quote(public.quote_storage_path_quote_id(name))
  );

drop policy if exists "staff_quote_files_storage_delete" on storage.objects;
drop policy if exists "quote_files_storage_delete_erp" on storage.objects;
create policy "quote_files_storage_delete_erp" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'quote-files'
    and auth.uid() is not null
    and public.can_access_quote(public.quote_storage_path_quote_id(name))
  );

notify pgrst, 'reload schema';
