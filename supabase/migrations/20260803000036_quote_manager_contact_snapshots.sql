-- =============================================================================
-- Eighty ERP — 견적 담당자 연락처·명함 스냅샷
-- 파일: 20260803000036_quote_manager_contact_snapshots.sql
--
-- 목적:
--   - employees: 휴대전화·이메일·명함 path·견적서 명함 표시 (title은 기존 재사용)
--   - quotes: 담당자 연락처·명함 스냅샷 (과거 견적 불변)
--   - Storage: employee-business-cards (private)
--   - 담당자 변경/신규 시에만 스냅샷 갱신 (trigger)
--   - 고객 공유 RPC에 스냅샷 필드 노출
--
-- 안전:
--   - add column if not exists
--   - 기존 행 DELETE/TRUNCATE/NOT NULL 강제 없음
--   - 기존 컬럼 값 덮어쓰기 없음 (스냅샷 null인 행만 backfill)
--   - migrations 1~35 미수정
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) employees — 연락처·명함 (title 기존 컬럼 재사용)
-- ---------------------------------------------------------------------------
alter table public.employees
  add column if not exists phone text;

alter table public.employees
  add column if not exists email text;

alter table public.employees
  add column if not exists business_card_path text;

alter table public.employees
  add column if not exists show_business_card_on_quote boolean;

update public.employees
set show_business_card_on_quote = false
where show_business_card_on_quote is null;

alter table public.employees
  alter column show_business_card_on_quote set default false;

alter table public.employees
  alter column show_business_card_on_quote set not null;

comment on column public.employees.phone is
  '직원 휴대전화. 견적 스냅샷 원본.';
comment on column public.employees.email is
  '직원 이메일. 견적 스냅샷 원본.';
comment on column public.employees.business_card_path is
  '명함 Storage path (employee-business-cards). URL 아님.';
comment on column public.employees.show_business_card_on_quote is
  '견적서 표지에 명함 이미지 표시 여부.';

-- ---------------------------------------------------------------------------
-- 2) quotes — 담당자 스냅샷
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists assignee_name text;

alter table public.quotes
  add column if not exists assignee_title text;

alter table public.quotes
  add column if not exists assignee_phone text;

alter table public.quotes
  add column if not exists assignee_email text;

alter table public.quotes
  add column if not exists assignee_card_path text;

alter table public.quotes
  add column if not exists assignee_show_business_card boolean;

comment on column public.quotes.assignee_name is
  '견적 저장 시점 담당자 이름 스냅샷.';
comment on column public.quotes.assignee_title is
  '견적 저장 시점 담당자 직책 스냅샷.';
comment on column public.quotes.assignee_phone is
  '견적 저장 시점 담당자 휴대전화 스냅샷.';
comment on column public.quotes.assignee_email is
  '견적 저장 시점 담당자 이메일 스냅샷.';
comment on column public.quotes.assignee_card_path is
  '견적 저장 시점 명함 Storage path 스냅샷.';
comment on column public.quotes.assignee_show_business_card is
  '견적 저장 시점 명함 표시 여부 스냅샷. null = 스냅샷 없음.';

-- 스냅샷이 비어 있는 기존 행만 employees에서 안전 backfill
update public.quotes q
set
  assignee_name = e.name,
  assignee_title = e.title,
  assignee_phone = nullif(trim(coalesce(e.phone, '')), ''),
  assignee_email = nullif(trim(coalesce(e.email, '')), ''),
  assignee_card_path = nullif(trim(coalesce(e.business_card_path, '')), ''),
  assignee_show_business_card = coalesce(e.show_business_card_on_quote, false)
from public.employees e
where q.assigned_employee_id = e.id
  and q.company_id = e.company_id
  and q.assignee_name is null
  and q.assignee_title is null
  and q.assignee_phone is null
  and q.assignee_email is null
  and q.assignee_card_path is null
  and q.assignee_show_business_card is null;

create index if not exists quotes_assignee_card_path_idx
  on public.quotes (assignee_card_path)
  where assignee_card_path is not null;

-- employees(company_id) 인덱스는 20260803000010 에 이미 존재

-- ---------------------------------------------------------------------------
-- 3) 스냅샷 적용 헬퍼 + 트리거 (신규/담당자 변경 시에만)
-- ---------------------------------------------------------------------------
create or replace function public.apply_quote_assignee_snapshot(p_quote public.quotes)
returns public.quotes
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp public.employees%rowtype;
begin
  if p_quote.assigned_employee_id is null then
    p_quote.assignee_name := null;
    p_quote.assignee_title := null;
    p_quote.assignee_phone := null;
    p_quote.assignee_email := null;
    p_quote.assignee_card_path := null;
    p_quote.assignee_show_business_card := null;
    return p_quote;
  end if;

  select *
    into v_emp
  from public.employees e
  where e.id = p_quote.assigned_employee_id
    and p_quote.company_id is not null
    and e.company_id = p_quote.company_id;

  if not found then
    p_quote.assignee_name := null;
    p_quote.assignee_title := null;
    p_quote.assignee_phone := null;
    p_quote.assignee_email := null;
    p_quote.assignee_card_path := null;
    p_quote.assignee_show_business_card := null;
    return p_quote;
  end if;

  p_quote.assignee_name := v_emp.name;
  p_quote.assignee_title := v_emp.title;
  p_quote.assignee_phone := nullif(trim(coalesce(v_emp.phone, '')), '');
  p_quote.assignee_email := nullif(trim(coalesce(v_emp.email, '')), '');
  p_quote.assignee_card_path := nullif(trim(coalesce(v_emp.business_card_path, '')), '');
  p_quote.assignee_show_business_card := coalesce(v_emp.show_business_card_on_quote, false);
  return p_quote;
end;
$$;

revoke all on function public.apply_quote_assignee_snapshot(public.quotes)
  from public, anon, authenticated;
-- 트리거(SECURITY DEFINER) 소유자만 호출. 클라이언트 직접 실행 금지.
grant execute on function public.apply_quote_assignee_snapshot(public.quotes)
  to service_role;

create or replace function public.quotes_assignee_snapshot_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new := public.apply_quote_assignee_snapshot(new);
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.assigned_employee_id is distinct from old.assigned_employee_id then
    new := public.apply_quote_assignee_snapshot(new);
  end if;

  return new;
end;
$$;

drop trigger if exists quotes_assignee_snapshot_biud on public.quotes;
create trigger quotes_assignee_snapshot_biud
  before insert or update of assigned_employee_id
  on public.quotes
  for each row
  execute function public.quotes_assignee_snapshot_trigger();

-- ---------------------------------------------------------------------------
-- 4) 직원 연락처·명함 업데이트 RPC (관리자 또는 본인)
-- ---------------------------------------------------------------------------
create or replace function public.update_employee_contact_profile(
  p_employee_id uuid,
  p_title text default null,
  p_phone text default null,
  p_email text default null,
  p_business_card_path text default null,
  p_clear_business_card boolean default false,
  p_show_business_card_on_quote boolean default null
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_my_employee_id uuid;
  v_is_manager boolean;
  v_row public.employees;
  v_card_path text;
  v_path_company uuid;
  v_path_employee uuid;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.';
  end if;
  if v_company_id is null then
    raise exception '활성 회사가 없습니다.';
  end if;
  if p_employee_id is null then
    raise exception '직원 ID가 필요합니다.';
  end if;

  select p.employee_id into v_my_employee_id
  from public.profiles p
  where p.id = v_uid;

  v_is_manager := coalesce(v_role in ('owner', 'director', 'admin'), false)
    or public.is_admin();

  if not v_is_manager and v_my_employee_id is distinct from p_employee_id then
    raise exception '본인 또는 관리자만 수정할 수 있습니다.';
  end if;

  select * into v_row
  from public.employees e
  where e.id = p_employee_id
    and e.company_id = v_company_id
  for update;

  if not found then
    raise exception '직원을 찾을 수 없습니다.';
  end if;

  if not p_clear_business_card and p_business_card_path is not null then
    v_card_path := nullif(trim(p_business_card_path), '');
    if v_card_path is not null then
      begin
        v_path_company := nullif(split_part(v_card_path, '/', 1), '')::uuid;
        v_path_employee := nullif(split_part(v_card_path, '/', 2), '')::uuid;
      exception
        when invalid_text_representation then
          raise exception '명함 경로가 올바르지 않습니다.';
      end;
      if v_path_company is distinct from v_company_id
         or v_path_employee is distinct from p_employee_id
         or nullif(split_part(v_card_path, '/', 3), '') is null then
        raise exception '명함 경로는 {회사ID}/{직원ID}/파일명 형식이어야 합니다.';
      end if;
    end if;
  end if;

  update public.employees e
  set
    title = case
      when p_title is null then e.title
      else nullif(trim(p_title), '')
    end,
    phone = case
      when p_phone is null then e.phone
      else nullif(trim(p_phone), '')
    end,
    email = case
      when p_email is null then e.email
      else nullif(trim(p_email), '')
    end,
    business_card_path = case
      when p_clear_business_card then null
      when p_business_card_path is null then e.business_card_path
      else nullif(trim(p_business_card_path), '')
    end,
    show_business_card_on_quote = case
      when p_show_business_card_on_quote is null then e.show_business_card_on_quote
      else p_show_business_card_on_quote
    end,
    updated_at = now()
  where e.id = p_employee_id
    and e.company_id = v_company_id
  returning * into v_row;

  if v_row.title is null or trim(v_row.title) = '' then
    raise exception '직책은 비울 수 없습니다.';
  end if;

  return v_row;
end;
$$;

comment on function public.update_employee_contact_profile(uuid, text, text, text, text, boolean, boolean) is
  '직원 직책·연락처·명함 갱신. 회사 관리자 또는 본인만.';

revoke all on function public.update_employee_contact_profile(uuid, text, text, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.update_employee_contact_profile(uuid, text, text, text, text, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Storage: employee-business-cards
--    path: {company_id}/{employee_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-business-cards',
  'employee-business-cards',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.employee_card_storage_company_id(p_object_name text)
returns uuid
language sql
immutable
strict
set search_path = public
as $$
  select
    case
      when split_part(p_object_name, '/', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_object_name, '/', 1)::uuid
      else null
    end;
$$;

create or replace function public.employee_card_storage_employee_id(p_object_name text)
returns uuid
language sql
immutable
strict
set search_path = public
as $$
  select
    case
      when split_part(p_object_name, '/', 2) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_object_name, '/', 2)::uuid
      else null
    end;
$$;

revoke all on function public.employee_card_storage_company_id(text) from public, anon;
revoke all on function public.employee_card_storage_employee_id(text) from public, anon;
grant execute on function public.employee_card_storage_company_id(text) to authenticated, service_role;
grant execute on function public.employee_card_storage_employee_id(text) to authenticated, service_role;

create or replace function public.can_read_employee_business_card(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and public.is_erp_user()
    and public.employee_card_storage_company_id(p_object_name) = public.current_company_id()
    and exists (
      select 1
      from public.employees e
      where e.id = public.employee_card_storage_employee_id(p_object_name)
        and e.company_id = public.current_company_id()
    ),
    false
  );
$$;

create or replace function public.can_write_employee_business_card(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.employee_card_storage_company_id(p_object_name);
  v_employee_id uuid := public.employee_card_storage_employee_id(p_object_name);
  v_my_employee_id uuid;
  v_role text := public.current_company_role();
  v_is_manager boolean;
begin
  if auth.uid() is null or not public.is_erp_user() then
    return false;
  end if;
  if v_company_id is null or v_employee_id is null then
    return false;
  end if;
  if v_company_id is distinct from public.current_company_id() then
    return false;
  end if;
  if not exists (
    select 1 from public.employees e
    where e.id = v_employee_id
      and e.company_id = v_company_id
  ) then
    return false;
  end if;

  select p.employee_id into v_my_employee_id
  from public.profiles p
  where p.id = auth.uid();

  v_is_manager := coalesce(v_role in ('owner', 'director', 'admin'), false)
    or public.is_admin();

  return v_is_manager or v_my_employee_id = v_employee_id;
end;
$$;

-- 고객 공유: 스냅샷 path가 공개 토큰 견적에 연결된 경우만 읽기
create or replace function public.employee_card_path_is_shared(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_path is not null
    and exists (
      select 1
      from public.quotes q
      where q.deleted_at is null
        and q.share_token is not null
        and q.assignee_show_business_card is true
        and q.assignee_card_path = p_path
    ),
    false
  );
$$;

revoke all on function public.can_read_employee_business_card(text) from public, anon;
revoke all on function public.can_write_employee_business_card(text) from public, anon;
revoke all on function public.employee_card_path_is_shared(text) from public;
grant execute on function public.can_read_employee_business_card(text) to authenticated, service_role;
grant execute on function public.can_write_employee_business_card(text) to authenticated, service_role;
grant execute on function public.employee_card_path_is_shared(text) to anon, authenticated, service_role;

drop policy if exists employee_business_cards_select on storage.objects;
create policy employee_business_cards_select
on storage.objects
for select to authenticated, anon
using (
  bucket_id = 'employee-business-cards'
  and (
    public.can_read_employee_business_card(name)
    or public.employee_card_path_is_shared(name)
  )
);

drop policy if exists employee_business_cards_insert on storage.objects;
create policy employee_business_cards_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'employee-business-cards'
  and public.can_write_employee_business_card(name)
);

drop policy if exists employee_business_cards_update on storage.objects;
create policy employee_business_cards_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'employee-business-cards'
  and public.can_write_employee_business_card(name)
)
with check (
  bucket_id = 'employee-business-cards'
  and public.can_write_employee_business_card(name)
);

drop policy if exists employee_business_cards_delete on storage.objects;
create policy employee_business_cards_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'employee-business-cards'
  and public.can_write_employee_business_card(name)
);

-- ---------------------------------------------------------------------------
-- 6) 고객 공유 RPC — 담당자 스냅샷 + remark 포함
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
    'quote_mode', coalesce(q.quote_mode, 'simple'),
    'quote_number', q.quote_number,
    'version_number', q.version_number,
    'status', q.status,
    'total_amount', q.total_amount,
    'discount_amount', q.discount_amount,
    'lx_discount_rate', coalesce(q.lx_discount_rate, 0),
    'lx_discount_amount', coalesce(q.lx_discount_amount, 0),
    'final_amount', q.final_amount,
    'vat_mode', q.vat_mode,
    'vat_rate', q.vat_rate,
    'supply_amount', coalesce(q.supply_amount, q.final_amount),
    'vat_amount', coalesce(q.vat_amount, 0),
    'customer_total_amount', coalesce(q.customer_total_amount, q.final_amount),
    'valid_until', q.valid_until,
    'issued_at', q.issued_at,
    'customer_message', q.customer_message,
    'is_lx_material', q.is_lx_material,
    'customer_name', c.name,
    'company_name', co.name,
    'brand_preset', co.brand_preset,
    'brand_slogan', co.brand_slogan,
    'brand_intro', co.brand_intro,
    'brand_advantages', co.brand_advantages,
    'brand_phone', co.brand_phone,
    'brand_trust_line', co.brand_trust_line,
    'brand_logo_path', co.brand_logo_path,
    'brand_cert_image_paths', co.brand_cert_image_paths,
    'brand_site_image_paths', co.brand_site_image_paths,
    'company_business_number', co.business_number_normalized,
    'assignee_name', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_name
      else e.name
    end,
    'assignee_title', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_title
      else e.title
    end,
    'assignee_phone', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_phone
      else nullif(trim(coalesce(e.phone, '')), '')
    end,
    'assignee_email', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_email
      else nullif(trim(coalesce(e.email, '')), '')
    end,
    'assignee_card_path', case
      when (
        case
          when q.assignee_name is not null
            or q.assignee_title is not null
            or q.assignee_phone is not null
            or q.assignee_email is not null
            or q.assignee_card_path is not null
            or q.assignee_show_business_card is not null
          then q.assignee_show_business_card
          else coalesce(e.show_business_card_on_quote, false)
        end
      ) is true
      then case
        when q.assignee_name is not null
          or q.assignee_title is not null
          or q.assignee_phone is not null
          or q.assignee_email is not null
          or q.assignee_card_path is not null
          or q.assignee_show_business_card is not null
        then q.assignee_card_path
        else nullif(trim(coalesce(e.business_card_path, '')), '')
      end
      else null
    end,
    'assignee_show_business_card', case
      when q.assignee_name is not null
        or q.assignee_title is not null
        or q.assignee_phone is not null
        or q.assignee_email is not null
        or q.assignee_card_path is not null
        or q.assignee_show_business_card is not null
      then q.assignee_show_business_card
      else coalesce(e.show_business_card_on_quote, false)
    end,
    'assigned_employee_id', q.assigned_employee_id,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'trade_name', i.trade_name,
          'item_name', i.item_name,
          'description', i.description,
          'remark', i.remark,
          'quantity', i.quantity,
          'unit', i.unit,
          'amount', i.amount,
          'cost_type', coalesce(i.cost_type, '기타'),
          'is_lx_material', coalesce(i.is_lx_material, false),
          'lx_discount_base_amount', coalesce(i.lx_discount_base_amount, 0),
          'lx_discount_type', i.lx_discount_type,
          'lx_discount_value', i.lx_discount_value,
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
  left join public.companies co on co.id = q.company_id
  left join public.employees e
    on e.id = q.assigned_employee_id
   and e.company_id = q.company_id
  where q.share_token = p_token
    and q.deleted_at is null
    and c.deleted_at is null;

  return result;
end;
$$;

comment on function public.get_quote_share_by_token(uuid) is
  '고객 공유 토큰 조회. VAT·담당자 스냅샷·remark 포함.';

revoke all on function public.get_quote_share_by_token(uuid) from public;
grant execute on function public.get_quote_share_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
