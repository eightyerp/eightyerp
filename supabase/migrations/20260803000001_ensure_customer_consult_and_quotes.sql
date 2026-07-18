-- =============================================================================
-- Eighty ERP — 고객 상세 패널용 상담이력·견적 테이블 보장
-- 파일: 20260803000001_ensure_customer_consult_and_quotes.sql
--
-- 목적:
--   운영 DB에 customer_consult_logs / quotes 계열이 없을 때
--   고객 상세의 상담이력·견적 패널이 동작하도록 최소 스키마를 생성한다.
--
-- 안전:
--   - DROP TABLE / DELETE / TRUNCATE 없음
--   - 기존 고객·직원·일정·견적 행 삭제·초기화 없음
--   - 재실행 가능
--
-- 전제:
--   - public.customers 존재
--   - public.is_admin() / public.can_access_customer(uuid) 존재
--     (승인 migration + notification_events migration의 헬퍼)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 상담이력 (customer_consult_logs)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_consult_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  consult_type text not null
    check (consult_type in ('전화', '방문', '카카오톡', '문자', '이메일', '기타')),
  consult_content text not null,
  next_contact_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_consult_logs_customer_id_idx
  on public.customer_consult_logs (customer_id);

create index if not exists customer_consult_logs_created_at_idx
  on public.customer_consult_logs (created_at desc);

alter table public.customer_consult_logs enable row level security;

drop policy if exists "customer_consult_logs_select" on public.customer_consult_logs;
create policy "customer_consult_logs_select" on public.customer_consult_logs
  for select to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_consult_logs_insert" on public.customer_consult_logs;
create policy "customer_consult_logs_insert" on public.customer_consult_logs
  for insert to authenticated
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_consult_logs_update" on public.customer_consult_logs;
create policy "customer_consult_logs_update" on public.customer_consult_logs
  for update to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
  )
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "customer_consult_logs_delete" on public.customer_consult_logs;
create policy "customer_consult_logs_delete" on public.customer_consult_logs
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) 견적 (quotes) — 최소 스키마 + 목록 조회에 필요한 하위 테이블
-- ---------------------------------------------------------------------------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid,
  quote_group_id uuid not null default gen_random_uuid(),
  parent_quote_id uuid,
  quote_type text not null default '창호',
  title text not null default '견적',
  quote_number text,
  version_number integer not null default 1,
  status text not null default '작성중',
  total_amount bigint not null default 0,
  discount_amount bigint not null default 0,
  final_amount bigint not null default 0,
  valid_until date,
  issued_at date,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  assigned_employee_id uuid,
  is_lx_material boolean not null default false,
  is_contract_quote boolean not null default false,
  customer_message text,
  memo text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text
);

alter table public.quotes add column if not exists customer_message text;
alter table public.quotes add column if not exists quote_group_id uuid;
alter table public.quotes add column if not exists parent_quote_id uuid;
alter table public.quotes add column if not exists memo text;
alter table public.quotes add column if not exists is_lx_material boolean not null default false;
alter table public.quotes add column if not exists is_contract_quote boolean not null default false;
alter table public.quotes add column if not exists deleted_at timestamptz;

create table if not exists public.quote_files (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  file_type text not null default 'pdf',
  file_path text not null default '',
  file_name text not null default '',
  original_file_name text,
  mime_type text,
  file_size bigint,
  is_primary boolean not null default false,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  trade_name text not null default '',
  item_name text,
  description text,
  quantity numeric,
  unit text,
  unit_price bigint not null default 0,
  amount bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.quotes enable row level security;
alter table public.quote_files enable row level security;
alter table public.quote_items enable row level security;

-- 견적 접근: admin 전체 / 그 외 can_access_customer(customer_id)
drop policy if exists "staff_quotes_select" on public.quotes;
drop policy if exists "quotes_select_erp" on public.quotes;
create policy "quotes_select_erp" on public.quotes
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_admin()
      or public.can_access_customer(customer_id)
      or created_by = auth.uid()
      or assigned_employee_id = public.current_employee_id()
    )
  );

drop policy if exists "staff_quotes_insert" on public.quotes;
drop policy if exists "quotes_insert_erp" on public.quotes;
create policy "quotes_insert_erp" on public.quotes
  for insert to authenticated
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
  );

drop policy if exists "staff_quotes_update" on public.quotes;
drop policy if exists "quotes_update_erp" on public.quotes;
create policy "quotes_update_erp" on public.quotes
  for update to authenticated
  using (
    public.is_admin()
    or public.can_access_customer(customer_id)
    or created_by = auth.uid()
    or assigned_employee_id = public.current_employee_id()
  )
  with check (
    public.is_admin()
    or public.can_access_customer(customer_id)
    or created_by = auth.uid()
    or assigned_employee_id = public.current_employee_id()
  );

drop policy if exists "staff_quote_files_select" on public.quote_files;
drop policy if exists "quote_files_select_erp" on public.quote_files;
create policy "quote_files_select_erp" on public.quote_files
  for select to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and q.deleted_at is null
        and (
          public.is_admin()
          or public.can_access_customer(q.customer_id)
          or q.created_by = auth.uid()
          or q.assigned_employee_id = public.current_employee_id()
        )
    )
  );

drop policy if exists "staff_quote_items_select" on public.quote_items;
drop policy if exists "quote_items_select_erp" on public.quote_items;
create policy "quote_items_select_erp" on public.quote_items
  for select to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and q.deleted_at is null
        and (
          public.is_admin()
          or public.can_access_customer(q.customer_id)
          or q.created_by = auth.uid()
          or q.assigned_employee_id = public.current_employee_id()
        )
    )
  );

grant select, insert, update on public.quotes to authenticated;
grant select, insert, update on public.quote_files to authenticated;
grant select, insert, update on public.quote_items to authenticated;
grant select, insert, update on public.customer_consult_logs to authenticated;

notify pgrst, 'reload schema';
