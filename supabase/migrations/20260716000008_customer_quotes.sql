-- Eighty ERP: 창호 견적서 파일 관리 (본사 Excel/PDF 업로드·보관·버전·발송기록)
-- Non-destructive. Does not alter/delete existing customer rows.

-- ---------------------------------------------------------------------------
-- 1) customer_quotes
-- ---------------------------------------------------------------------------
create table if not exists public.customer_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  quote_category text not null default '창호'
    check (quote_category in ('창호')),
  brand text not null default 'LX하우시스'
    check (brand in ('LX하우시스', '홈씨씨', '기타')),
  title text not null,
  amount numeric(14, 0),
  quote_date date,
  valid_until date,
  assigned_employee_id uuid references public.employees (id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_type text not null
    check (file_type in ('pdf', 'xlsx', 'xls')),
  file_size bigint,
  quote_group_id uuid not null,
  version integer not null default 1,
  parent_quote_id uuid references public.customer_quotes (id) on delete set null,
  is_final boolean not null default false,
  status text not null default '작성중'
    check (status in (
      '작성중', '고객발송', '고객확인', '수정요청',
      '최종견적', '계약전환', '보류', '취소'
    )),
  notes text,
  -- 향후 계약 모듈 연결용 (계약 테이블 생성 전 FK 없음)
  linked_contract_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists customer_quotes_customer_id_idx
  on public.customer_quotes (customer_id, created_at desc);

create index if not exists customer_quotes_group_idx
  on public.customer_quotes (quote_group_id, version desc);

create index if not exists customer_quotes_status_idx
  on public.customer_quotes (status);

create index if not exists customer_quotes_final_idx
  on public.customer_quotes (customer_id, is_final)
  where is_final = true and deleted_at is null;

drop trigger if exists customer_quotes_set_updated_at on public.customer_quotes;
create trigger customer_quotes_set_updated_at
  before update on public.customer_quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) customer_quote_sends (발송기록 — 실제 API 연동 가능하도록 구조화)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_quote_sends (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.customer_quotes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  sent_at timestamptz not null default now(),
  send_method text not null
    check (send_method in ('문자', '카카오톡', '이메일', '기타')),
  recipient text,
  note text,
  -- 향후 외부 API 연동
  provider text,
  provider_status text not null default 'recorded'
    check (provider_status in ('recorded', 'queued', 'sent', 'failed')),
  provider_message_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_quote_sends_quote_id_idx
  on public.customer_quote_sends (quote_id, sent_at desc);

create index if not exists customer_quote_sends_customer_id_idx
  on public.customer_quote_sends (customer_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.customer_quotes enable row level security;
alter table public.customer_quote_sends enable row level security;

drop policy if exists "customer_quotes_select" on public.customer_quotes;
create policy "customer_quotes_select" on public.customer_quotes
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_admin()
      or public.can_access_customer(customer_id)
    )
  );

drop policy if exists "customer_quotes_insert" on public.customer_quotes;
create policy "customer_quotes_insert" on public.customer_quotes
  for insert to authenticated
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_quotes_update" on public.customer_quotes;
create policy "customer_quotes_update" on public.customer_quotes
  for update to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

-- 파일/견적 삭제는 관리자만
drop policy if exists "customer_quotes_delete" on public.customer_quotes;
create policy "customer_quotes_delete" on public.customer_quotes
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "customer_quote_sends_select" on public.customer_quote_sends;
create policy "customer_quote_sends_select" on public.customer_quote_sends
  for select to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_quote_sends_insert" on public.customer_quote_sends;
create policy "customer_quote_sends_insert" on public.customer_quote_sends
  for insert to authenticated
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_quote_sends_update" on public.customer_quote_sends;
create policy "customer_quote_sends_update" on public.customer_quote_sends
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "customer_quote_sends_delete" on public.customer_quote_sends;
create policy "customer_quote_sends_delete" on public.customer_quote_sends
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Storage bucket (private) + policies
-- path: {customer_id}/{quote_group_id}/v{n}_{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-quotes',
  'customer-quotes',
  false,
  52428800, -- 50MB
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- helper: first folder of object name = customer_id
create or replace function public.storage_customer_id(object_name text)
returns uuid
language plpgsql
stable
as $$
declare
  folder text;
begin
  folder := split_part(object_name, '/', 1);
  if folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return folder::uuid;
  end if;
  return null;
end;
$$;

drop policy if exists "customer_quotes_storage_select" on storage.objects;
create policy "customer_quotes_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-quotes'
    and (
      public.is_admin()
      or (
        public.storage_customer_id(name) is not null
        and public.can_access_customer(public.storage_customer_id(name))
      )
    )
  );

drop policy if exists "customer_quotes_storage_insert" on storage.objects;
create policy "customer_quotes_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-quotes'
    and (
      public.is_admin()
      or (
        public.storage_customer_id(name) is not null
        and public.can_access_customer(public.storage_customer_id(name))
      )
    )
  );

drop policy if exists "customer_quotes_storage_update" on storage.objects;
create policy "customer_quotes_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'customer-quotes'
    and public.is_admin()
  )
  with check (
    bucket_id = 'customer-quotes'
    and public.is_admin()
  );

drop policy if exists "customer_quotes_storage_delete" on storage.objects;
create policy "customer_quotes_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-quotes'
    and public.is_admin()
  );

notify pgrst, 'reload schema';
