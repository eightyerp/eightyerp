-- =============================================================================
-- Eighty ERP — 견적 고객 공유 토큰 + 파일 soft-delete 정책
-- 파일: 20260727000001_quotes_customer_share.sql
-- 전제: 20260724000001, 20260726000001 (권장)
-- 안전: CRM/자재 DROP 없음. 재실행 가능.
-- =============================================================================

-- share_token: 고객 확인 링크용
alter table public.quotes
  add column if not exists share_token uuid;

update public.quotes
set share_token = coalesce(share_token, gen_random_uuid())
where share_token is null;

alter table public.quotes
  alter column share_token set default gen_random_uuid();

create unique index if not exists quotes_share_token_uidx
  on public.quotes (share_token)
  where deleted_at is null and share_token is not null;

alter table public.quotes add column if not exists customer_message text;

alter table public.quote_files add column if not exists deleted_at timestamptz;
alter table public.quote_files add column if not exists deleted_by uuid references auth.users (id) on delete set null;

-- 실제 DELETE 정책 제거 (soft delete만 사용)
drop policy if exists "staff_quote_files_delete" on public.quote_files;

-- ---------------------------------------------------------------------------
-- 고객 공유: 메모·단가 제외한 공개 조회 (security definer)
-- ---------------------------------------------------------------------------
create or replace function public.get_quote_share_by_token(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_token is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', q.id,
    'title', q.title,
    'quote_type', q.quote_type,
    'quote_number', q.quote_number,
    'version_number', q.version_number,
    'status', q.status,
    'final_amount', q.final_amount,
    'valid_until', q.valid_until,
    'issued_at', q.issued_at,
    'customer_message', q.customer_message,
    'is_lx_material', q.is_lx_material,
    'customer_name', c.name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'trade_name', i.trade_name,
          'item_name', i.item_name,
          'description', i.description,
          'quantity', i.quantity,
          'unit', i.unit,
          'amount', i.amount,
          'sort_order', i.sort_order
        )
        order by i.sort_order
      )
      from public.quote_items i
      where i.quote_id = q.id
        and i.deleted_at is null
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'file_type', f.file_type,
          'file_name', f.file_name,
          'file_path', f.file_path,
          'is_primary', f.is_primary
        )
        order by f.created_at
      )
      from public.quote_files f
      where f.quote_id = q.id
        and f.deleted_at is null
    ), '[]'::jsonb)
  )
  into result
  from public.quotes q
  join public.customers c on c.id = q.customer_id
  where q.share_token = p_token
    and q.deleted_at is null
    and c.deleted_at is null;

  return result;
end;
$$;

grant execute on function public.get_quote_share_by_token(uuid) to anon, authenticated;

create or replace function public.quote_file_path_is_shared(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quote_files qf
    join public.quotes q on q.id = qf.quote_id
    where qf.file_path = p_path
      and qf.deleted_at is null
      and q.deleted_at is null
      and q.share_token is not null
  );
$$;

grant execute on function public.quote_file_path_is_shared(text) to anon, authenticated;

-- Storage: 공유 견적 파일은 signed URL 발급을 위해 select 허용
drop policy if exists "quote_files_shared_storage_select" on storage.objects;
create policy "quote_files_shared_storage_select" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'quote-files'
    and public.quote_file_path_is_shared(name)
  );

-- bucket 30MB 재확인
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

notify pgrst, 'reload schema';
