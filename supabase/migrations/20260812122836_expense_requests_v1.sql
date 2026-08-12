-- =============================================================================
-- Eighty ERP — 지출관리 1차
-- 거래처 Master + 지출요청 + 증빙(Storage) + 승인/지급 RPC + ERP PUSH 이벤트
-- =============================================================================

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id),
  name text not null,
  normalized_name text not null,
  business_number text,
  phone text,
  bank_name text,
  account_number text,
  account_holder text,
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review','approved','inactive')),
  created_from text not null default 'manual'
    check (created_from in ('manual','receipt','transaction_statement','invoice','other')),
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_company_name_idx
  on public.vendors(company_id, normalized_name);
create index if not exists vendors_company_business_idx
  on public.vendors(company_id, business_number)
  where business_number is not null;

alter table public.vendors enable row level security;

drop policy if exists vendors_company_guard on public.vendors;
create policy vendors_company_guard on public.vendors
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

drop policy if exists vendors_select_erp on public.vendors;
create policy vendors_select_erp on public.vendors
  for select to authenticated
  using (public.is_erp_user());

grant select on public.vendors to authenticated;
revoke insert, update, delete on public.vendors from authenticated, anon;
revoke all on public.vendors from anon;

create table if not exists public.expense_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id),
  expense_scope text not null check (expense_scope in ('project','operating')),
  project_id uuid references public.projects(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  category text not null check (category in (
    'materials','subcontract','labor','demolition','lifting','freight','site','advertising','sga','misc'
  )),
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name_snapshot text,
  description text not null,
  supply_amount bigint not null default 0 check (supply_amount >= 0),
  vat_amount bigint not null default 0 check (vat_amount >= 0),
  total_amount bigint not null check (total_amount > 0),
  expense_date date not null default ((current_timestamp at time zone 'Asia/Seoul'))::date,
  payment_due_date date,
  payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer','company_card','personal_card','cash','other')),
  status text not null default 'pending'
    check (status in ('pending','approved','paid','rejected','cancelled')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_by_employee_id uuid references public.employees(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_requests_amount_check
    check (total_amount = supply_amount + vat_amount),
  constraint expense_requests_scope_project_check check (
    (expense_scope = 'project' and project_id is not null)
    or
    (expense_scope = 'operating' and project_id is null and customer_id is null and contract_id is null)
  )
);

create index if not exists expense_requests_company_status_created_idx
  on public.expense_requests(company_id, status, created_at desc);
create index if not exists expense_requests_project_status_idx
  on public.expense_requests(project_id, status, expense_date desc)
  where project_id is not null;
create index if not exists expense_requests_requester_created_idx
  on public.expense_requests(requested_by_employee_id, created_at desc)
  where requested_by_employee_id is not null;
create index if not exists expense_requests_paid_date_idx
  on public.expense_requests(company_id, paid_at desc)
  where status = 'paid';

alter table public.expense_requests enable row level security;

drop policy if exists expense_requests_company_guard on public.expense_requests;
create policy expense_requests_company_guard on public.expense_requests
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

drop policy if exists expense_requests_select_erp on public.expense_requests;
create policy expense_requests_select_erp on public.expense_requests
  for select to authenticated
  using (
    public.is_erp_user()
    and (
      public.current_company_role() in ('owner','director','admin')
      or requested_by_employee_id = public.current_employee_id()
    )
  );

grant select on public.expense_requests to authenticated;
revoke insert, update, delete on public.expense_requests from authenticated, anon;
revoke all on public.expense_requests from anon;

create table if not exists public.expense_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id),
  expense_request_id uuid not null references public.expense_requests(id) on delete cascade,
  document_type text not null default 'receipt'
    check (document_type in ('receipt','transaction_statement','invoice','other')),
  storage_path text not null,
  original_file_name text not null,
  mime_type text,
  file_size bigint,
  sha256 text,
  ai_extracted jsonb not null default '{}'::jsonb,
  ai_confidence numeric(5,4),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists expense_documents_storage_path_uidx
  on public.expense_documents(storage_path);
create unique index if not exists expense_documents_company_sha_uidx
  on public.expense_documents(company_id, sha256)
  where sha256 is not null;
create index if not exists expense_documents_request_idx
  on public.expense_documents(expense_request_id, created_at desc);

alter table public.expense_documents enable row level security;

drop policy if exists expense_documents_company_guard on public.expense_documents;
create policy expense_documents_company_guard on public.expense_documents
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

drop policy if exists expense_documents_select_erp on public.expense_documents;
create policy expense_documents_select_erp on public.expense_documents
  for select to authenticated
  using (
    public.is_erp_user()
    and exists (
      select 1
      from public.expense_requests er
      where er.id = expense_request_id
        and er.company_id = (select public.current_company_id())
        and (
          public.current_company_role() in ('owner','director','admin')
          or er.requested_by_employee_id = public.current_employee_id()
        )
    )
  );

grant select on public.expense_documents to authenticated;
revoke insert, update, delete on public.expense_documents from authenticated, anon;
revoke all on public.expense_documents from anon;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-documents',
  'expense-documents',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_documents_storage_insert on storage.objects;
create policy expense_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'expense-documents'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_erp_user()
  );

drop policy if exists expense_documents_storage_select on storage.objects;
create policy expense_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'expense-documents'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and exists (
      select 1
      from public.expense_documents d
      join public.expense_requests er on er.id = d.expense_request_id
      where d.storage_path = name
        and d.company_id = (select public.current_company_id())
        and (
          public.current_company_role() in ('owner','director','admin')
          or er.requested_by_employee_id = public.current_employee_id()
        )
    )
  );

drop policy if exists expense_documents_storage_delete on storage.objects;
create policy expense_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'expense-documents'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.current_company_role() in ('owner','director','admin')
    )
  );

create or replace function public.normalize_vendor_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_name,'')), '\s+', '', 'g'))
$$;
revoke all on function public.normalize_vendor_name(text) from public, anon, authenticated;

create or replace function public.find_or_create_vendor_candidate(
  p_name text,
  p_business_number text default null,
  p_phone text default null,
  p_created_from text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_name text := nullif(btrim(p_name),'');
  v_norm text;
  v_business text;
  v_vendor public.vendors%rowtype;
begin
  if v_uid is null or not public.is_erp_user() or v_company is null then
    raise exception '권한이 없습니다.';
  end if;
  if v_name is null then
    raise exception '거래처명을 입력해 주세요.';
  end if;
  if p_created_from not in ('manual','receipt','transaction_statement','invoice','other') then
    raise exception '거래처 등록 출처가 올바르지 않습니다.';
  end if;

  v_norm := public.normalize_vendor_name(v_name);
  v_business := nullif(regexp_replace(coalesce(p_business_number,''),'[^0-9]','','g'),'');

  select * into v_vendor
  from public.vendors
  where company_id = v_company
    and normalized_name = v_norm
    and (v_business is null or business_number is null or business_number = v_business)
  order by case when business_number = v_business then 0 else 1 end, created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'vendor_id',v_vendor.id,
      'created',false,
      'review_status',v_vendor.review_status,
      'name',v_vendor.name
    );
  end if;

  insert into public.vendors(
    company_id,name,normalized_name,business_number,phone,review_status,
    created_from,created_by,reviewed_by,reviewed_at
  )
  values(
    v_company,v_name,v_norm,v_business,nullif(btrim(coalesce(p_phone,'')),''),
    case when v_role in ('owner','director','admin') then 'approved' else 'pending_review' end,
    p_created_from,v_uid,
    case when v_role in ('owner','director','admin') then v_uid else null end,
    case when v_role in ('owner','director','admin') then now() else null end
  )
  returning * into v_vendor;

  return jsonb_build_object(
    'vendor_id',v_vendor.id,
    'created',true,
    'review_status',v_vendor.review_status,
    'name',v_vendor.name
  );
end
$$;
revoke all on function public.find_or_create_vendor_candidate(text,text,text,text) from public, anon;
grant execute on function public.find_or_create_vendor_candidate(text,text,text,text) to authenticated;

create or replace function public.approve_vendor(p_vendor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_vendor public.vendors%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then
    raise exception '관리자만 거래처를 승인할 수 있습니다.';
  end if;

  update public.vendors
  set review_status='approved', reviewed_by=v_uid, reviewed_at=now(), updated_at=now()
  where id=p_vendor_id
    and company_id=v_company
    and review_status='pending_review'
  returning * into v_vendor;

  if not found then
    raise exception '승인할 거래처를 찾을 수 없습니다.';
  end if;

  return jsonb_build_object('vendor_id',v_vendor.id,'review_status',v_vendor.review_status);
end
$$;
revoke all on function public.approve_vendor(uuid) from public, anon;
grant execute on function public.approve_vendor(uuid) to authenticated;

create or replace function public.register_expense_request(
  p_expense_scope text,
  p_project_id uuid,
  p_category text,
  p_vendor_id uuid,
  p_vendor_name text,
  p_description text,
  p_supply_amount bigint,
  p_vat_amount bigint,
  p_total_amount bigint,
  p_expense_date date,
  p_payment_due_date date,
  p_payment_method text,
  p_memo text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_employee uuid := public.current_employee_id();
  v_project public.projects%rowtype;
  v_customer uuid;
  v_contract uuid;
  v_vendor public.vendors%rowtype;
  v_row public.expense_requests%rowtype;
  v_status text;
begin
  if v_uid is null or not public.is_erp_user() or v_company is null then
    raise exception '권한이 없습니다.';
  end if;
  if p_expense_scope not in ('project','operating') then
    raise exception '지출 구분이 올바르지 않습니다.';
  end if;
  if p_category not in ('materials','subcontract','labor','demolition','lifting','freight','site','advertising','sga','misc') then
    raise exception '지출 분류가 올바르지 않습니다.';
  end if;
  if p_payment_method not in ('bank_transfer','company_card','personal_card','cash','other') then
    raise exception '결제수단이 올바르지 않습니다.';
  end if;
  if p_supply_amount < 0
     or p_vat_amount < 0
     or p_total_amount <= 0
     or p_total_amount <> p_supply_amount + p_vat_amount then
    raise exception '공급가·부가세·합계 금액을 확인해 주세요.';
  end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then
    raise exception '지출 내용을 입력해 주세요.';
  end if;
  if v_role not in ('owner','director','admin') and v_employee is null then
    raise exception '연결된 직원 정보가 없습니다.';
  end if;

  if p_expense_scope='project' then
    select * into v_project
    from public.projects
    where id=p_project_id
      and company_id=v_company
      and deleted_at is null;

    if not found then
      raise exception '현장을 찾을 수 없습니다.';
    end if;
    if v_role not in ('owner','director','admin')
       and not public.can_access_customer(v_project.customer_id) then
      raise exception '해당 현장에 지출요청을 등록할 권한이 없습니다.';
    end if;

    v_customer := v_project.customer_id;
    select id into v_contract
    from public.contracts
    where company_id=v_company
      and project_id=v_project.id
      and contract_kind='original'
      and status not in ('draft','cancelled','terminated')
    order by contract_date desc, created_at desc
    limit 1;
  else
    if p_project_id is not null then
      raise exception '운영비는 현장을 지정할 수 없습니다.';
    end if;
    v_customer := null;
    v_contract := null;
  end if;

  if p_vendor_id is not null then
    select * into v_vendor
    from public.vendors
    where id=p_vendor_id
      and company_id=v_company
      and review_status <> 'inactive';
    if not found then
      raise exception '거래처를 찾을 수 없습니다.';
    end if;
  end if;

  v_status := case
    when v_role in ('owner','director','admin') then 'approved'
    else 'pending'
  end;

  insert into public.expense_requests(
    company_id,expense_scope,project_id,customer_id,contract_id,category,
    vendor_id,vendor_name_snapshot,description,supply_amount,vat_amount,total_amount,
    expense_date,payment_due_date,payment_method,status,
    requested_by_user_id,requested_by_employee_id,approved_by,approved_at,memo
  )
  values(
    v_company,
    p_expense_scope,
    case when p_expense_scope='project' then p_project_id else null end,
    v_customer,
    v_contract,
    p_category,
    p_vendor_id,
    coalesce(v_vendor.name,nullif(btrim(coalesce(p_vendor_name,'')),'')),
    btrim(p_description),
    p_supply_amount,
    p_vat_amount,
    p_total_amount,
    coalesce(p_expense_date,(current_timestamp at time zone 'Asia/Seoul')::date),
    p_payment_due_date,
    p_payment_method,
    v_status,
    v_uid,
    v_employee,
    case when v_status='approved' then v_uid else null end,
    case when v_status='approved' then now() else null end,
    nullif(btrim(coalesce(p_memo,'')),'')
  )
  returning * into v_row;

  return jsonb_build_object(
    'expense_id',v_row.id,
    'status',v_row.status,
    'project_id',v_row.project_id,
    'customer_id',v_row.customer_id,
    'requester_employee_id',v_row.requested_by_employee_id,
    'amount',v_row.total_amount
  );
end
$$;
revoke all on function public.register_expense_request(text,uuid,text,uuid,text,text,bigint,bigint,bigint,date,date,text,text) from public, anon;
grant execute on function public.register_expense_request(text,uuid,text,uuid,text,text,bigint,bigint,bigint,date,date,text,text) to authenticated;

create or replace function public.approve_expense_request(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company uuid:=public.current_company_id();
  v_row public.expense_requests%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then
    raise exception '관리자만 지출을 승인할 수 있습니다.';
  end if;

  update public.expense_requests
  set status='approved',approved_by=v_uid,approved_at=now(),updated_at=now()
  where id=p_expense_id
    and company_id=v_company
    and status='pending'
  returning * into v_row;

  if not found then
    raise exception '승인할 지출요청을 찾을 수 없습니다.';
  end if;

  return jsonb_build_object(
    'expense_id',v_row.id,
    'status',v_row.status,
    'requester_employee_id',v_row.requested_by_employee_id,
    'customer_id',v_row.customer_id,
    'amount',v_row.total_amount
  );
end
$$;
revoke all on function public.approve_expense_request(uuid) from public, anon;
grant execute on function public.approve_expense_request(uuid) to authenticated;

create or replace function public.reject_expense_request(
  p_expense_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company uuid:=public.current_company_id();
  v_row public.expense_requests%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then
    raise exception '관리자만 지출을 반려할 수 있습니다.';
  end if;
  if v_reason is null then
    raise exception '반려 사유를 입력해 주세요.';
  end if;

  update public.expense_requests
  set status='rejected',rejected_by=v_uid,rejected_at=now(),rejection_reason=v_reason,updated_at=now()
  where id=p_expense_id
    and company_id=v_company
    and status in ('pending','approved')
  returning * into v_row;

  if not found then
    raise exception '반려할 지출요청을 찾을 수 없습니다.';
  end if;

  return jsonb_build_object(
    'expense_id',v_row.id,
    'status',v_row.status,
    'requester_employee_id',v_row.requested_by_employee_id,
    'amount',v_row.total_amount
  );
end
$$;
revoke all on function public.reject_expense_request(uuid,text) from public, anon;
grant execute on function public.reject_expense_request(uuid,text) to authenticated;

create or replace function public.mark_expense_paid(
  p_expense_id uuid,
  p_paid_at timestamptz default now(),
  p_payment_method text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company uuid:=public.current_company_id();
  v_row public.expense_requests%rowtype;
begin
  if v_uid is null or public.current_company_role() not in ('owner','director','admin') then
    raise exception '관리자만 지급완료 처리할 수 있습니다.';
  end if;
  if p_payment_method is not null
     and p_payment_method not in ('bank_transfer','company_card','personal_card','cash','other') then
    raise exception '결제수단이 올바르지 않습니다.';
  end if;

  update public.expense_requests
  set status='paid',
      paid_by=v_uid,
      paid_at=coalesce(p_paid_at,now()),
      payment_method=coalesce(p_payment_method,payment_method),
      updated_at=now()
  where id=p_expense_id
    and company_id=v_company
    and status='approved'
  returning * into v_row;

  if not found then
    raise exception '지급할 승인 지출을 찾을 수 없습니다.';
  end if;

  return jsonb_build_object(
    'expense_id',v_row.id,
    'status',v_row.status,
    'requester_employee_id',v_row.requested_by_employee_id,
    'project_id',v_row.project_id,
    'customer_id',v_row.customer_id,
    'amount',v_row.total_amount,
    'paid_at',v_row.paid_at
  );
end
$$;
revoke all on function public.mark_expense_paid(uuid,timestamptz,text) from public, anon;
grant execute on function public.mark_expense_paid(uuid,timestamptz,text) to authenticated;

create or replace function public.cancel_expense_request(
  p_expense_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company uuid:=public.current_company_id();
  v_role text:=public.current_company_role();
  v_employee uuid:=public.current_employee_id();
  v_row public.expense_requests%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_uid is null or not public.is_erp_user() then
    raise exception '권한이 없습니다.';
  end if;
  if v_reason is null then
    raise exception '취소 사유를 입력해 주세요.';
  end if;

  select * into v_row
  from public.expense_requests
  where id=p_expense_id
    and company_id=v_company
  for update;

  if not found then
    raise exception '지출요청을 찾을 수 없습니다.';
  end if;
  if v_row.status not in ('pending','approved') then
    raise exception '대기 또는 승인 상태만 취소할 수 있습니다.';
  end if;
  if v_role not in ('owner','director','admin')
     and (
       v_row.requested_by_employee_id is distinct from v_employee
       or v_row.status <> 'pending'
     ) then
    raise exception '본인의 확인대기 지출만 취소할 수 있습니다.';
  end if;

  update public.expense_requests
  set status='cancelled',cancelled_by=v_uid,cancelled_at=now(),cancel_reason=v_reason,updated_at=now()
  where id=v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'expense_id',v_row.id,
    'status',v_row.status,
    'requester_employee_id',v_row.requested_by_employee_id,
    'amount',v_row.total_amount
  );
end
$$;
revoke all on function public.cancel_expense_request(uuid,text) from public, anon;
grant execute on function public.cancel_expense_request(uuid,text) to authenticated;

create or replace function public.check_expense_document_duplicate(p_sha256 text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.expense_documents d
    where d.company_id = public.current_company_id()
      and d.sha256 = nullif(btrim(p_sha256),'')
  )
$$;
revoke all on function public.check_expense_document_duplicate(text) from public, anon;
grant execute on function public.check_expense_document_duplicate(text) to authenticated;

create or replace function public.attach_expense_document(
  p_expense_id uuid,
  p_document_type text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_sha256 text,
  p_ai_extracted jsonb,
  p_ai_confidence numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company uuid:=public.current_company_id();
  v_role text:=public.current_company_role();
  v_employee uuid:=public.current_employee_id();
  v_request public.expense_requests%rowtype;
  v_doc public.expense_documents%rowtype;
begin
  if v_uid is null or not public.is_erp_user() then
    raise exception '권한이 없습니다.';
  end if;
  if p_document_type not in ('receipt','transaction_statement','invoice','other') then
    raise exception '증빙 종류가 올바르지 않습니다.';
  end if;

  select * into v_request
  from public.expense_requests
  where id=p_expense_id
    and company_id=v_company;

  if not found then
    raise exception '지출요청을 찾을 수 없습니다.';
  end if;
  if v_role not in ('owner','director','admin')
     and v_request.requested_by_employee_id is distinct from v_employee then
    raise exception '증빙을 첨부할 권한이 없습니다.';
  end if;
  if split_part(p_storage_path,'/',1) is distinct from v_company::text
     or split_part(p_storage_path,'/',2) is distinct from v_uid::text then
    raise exception '증빙 저장 경로가 올바르지 않습니다.';
  end if;
  if exists(
    select 1
    from public.expense_documents
    where company_id=v_company
      and sha256 is not null
      and sha256=nullif(btrim(p_sha256),'')
  ) then
    raise exception '같은 증빙 파일이 이미 등록되어 있습니다.';
  end if;

  insert into public.expense_documents(
    company_id,expense_request_id,document_type,storage_path,original_file_name,
    mime_type,file_size,sha256,ai_extracted,ai_confidence,created_by
  )
  values(
    v_company,v_request.id,p_document_type,p_storage_path,p_original_file_name,
    nullif(p_mime_type,''),p_file_size,nullif(btrim(p_sha256),''),
    coalesce(p_ai_extracted,'{}'::jsonb),p_ai_confidence,v_uid
  )
  returning * into v_doc;

  return jsonb_build_object('document_id',v_doc.id,'expense_id',v_request.id);
end
$$;
revoke all on function public.attach_expense_document(uuid,text,text,text,text,bigint,text,jsonb,numeric) from public, anon;
grant execute on function public.attach_expense_document(uuid,text,text,text,text,bigint,text,jsonb,numeric) to authenticated;

-- 지출 워크플로우 알림 타입 확장

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.notification_events'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format('alter table public.notification_events drop constraint %I',r.conname);
  end loop;
end
$$;

alter table public.notification_events
  add constraint notification_events_event_type_check
  check (event_type in (
    'material_approval_request',
    'material_approved',
    'material_change_request',
    'material_reapproval_request',
    'material_all_approved',
    'external_inquiry_registered',
    'customer_assigned',
    'collection_reported',
    'collection_confirmed',
    'expense_requested',
    'expense_approved',
    'expense_paid'
  ));

notify pgrst, 'reload schema';
