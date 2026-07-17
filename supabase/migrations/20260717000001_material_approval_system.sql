-- Eighty ERP: 인테리어 자재 선택 및 고객 승인 시스템
-- Non-destructive. Does not modify/delete existing CRM customer data.

-- ---------------------------------------------------------------------------
-- 1) projects (현장) — customer 하위
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  address text,
  status text not null default '진행중'
    check (status in ('준비', '진행중', '완료', '보류', '취소')),
  assigned_employee_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists projects_customer_id_idx on public.projects (customer_id);
create index if not exists projects_assigned_employee_id_idx on public.projects (assigned_employee_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) material_catalog (자주 쓰는 자재 마스터)
-- ---------------------------------------------------------------------------
create table if not exists public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  brand text,
  product_name text not null,
  model_no text,
  color text,
  spec text,
  default_unit text default '개',
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_catalog_trade_idx on public.material_catalog (trade);
create index if not exists material_catalog_brand_idx on public.material_catalog (brand);

drop trigger if exists material_catalog_set_updated_at on public.material_catalog;
create trigger material_catalog_set_updated_at
  before update on public.material_catalog
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) project_materials
-- ---------------------------------------------------------------------------
create table if not exists public.project_materials (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  catalog_id uuid references public.material_catalog (id) on delete set null,
  space_name text not null default '공통'
    check (space_name in (
      '공통','현관','거실','주방','안방','침실','욕실1','욕실2','발코니','다용도실','기타'
    )),
  trade text not null default '기타'
    check (trade in (
      '창호','바닥재','도배','타일','필름','도어','중문','주방가구','붙박이장',
      '욕실제품','수전','조명','스위치/콘센트','기타'
    )),
  brand text,
  product_name text not null,
  model_no text,
  color text,
  spec text,
  apply_location text,
  quantity numeric(12,2) not null default 1,
  unit text not null default '개',
  include_in_quote boolean not null default true,
  base_amount integer not null default 0,
  extra_amount integer not null default 0,
  supplier text,
  delivery_due_date date,
  staff_description text,
  internal_memo text,
  customer_memo text,
  cover_image_path text,
  sort_order integer not null default 0,
  approval_status text not null default '작성중'
    check (approval_status in (
      '작성중','승인요청','승인완료','변경요청','보류','재승인필요','취소'
    )),
  -- 견적 연결용 (customer_quotes 미적용 환경 대비 FK 없음)
  quote_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists project_materials_project_id_idx
  on public.project_materials (project_id, sort_order);
create index if not exists project_materials_customer_id_idx
  on public.project_materials (customer_id);
create index if not exists project_materials_status_idx
  on public.project_materials (approval_status);

drop trigger if exists project_materials_set_updated_at on public.project_materials;
create trigger project_materials_set_updated_at
  before update on public.project_materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) material_images
-- ---------------------------------------------------------------------------
create table if not exists public.material_images (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.project_materials (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists material_images_material_id_idx
  on public.material_images (material_id, sort_order);

-- ---------------------------------------------------------------------------
-- 5) material_approvals (승인/변경요청 + 스냅샷)
-- ---------------------------------------------------------------------------
create table if not exists public.material_approvals (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.project_materials (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  action text not null
    check (action in ('승인요청','승인','변경요청','보류','재승인필요','승인취소','문의')),
  status_after text not null,
  actor_type text not null check (actor_type in ('staff','customer','system')),
  actor_name text,
  actor_user_id uuid references auth.users (id) on delete set null,
  access_token_id uuid,
  change_reason text,
  desired_product text,
  desired_color text,
  customer_note text,
  reference_image_paths text[] not null default '{}',
  approval_snapshot jsonb,
  agreed_to_terms boolean,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists material_approvals_material_id_idx
  on public.material_approvals (material_id, created_at desc);
create index if not exists material_approvals_project_id_idx
  on public.material_approvals (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6) customer_access_tokens
-- ---------------------------------------------------------------------------
create table if not exists public.customer_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  purpose text not null default 'materials'
    check (purpose in ('materials')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_access_tokens_token_idx
  on public.customer_access_tokens (token);
create index if not exists customer_access_tokens_project_id_idx
  on public.customer_access_tokens (project_id);

alter table public.material_approvals
  add constraint material_approvals_access_token_id_fkey
  foreign key (access_token_id) references public.customer_access_tokens (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 7) material_comments
-- ---------------------------------------------------------------------------
create table if not exists public.material_comments (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.project_materials (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  author_type text not null check (author_type in ('staff','customer')),
  author_name text,
  author_user_id uuid references auth.users (id) on delete set null,
  access_token_id uuid references public.customer_access_tokens (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists material_comments_material_id_idx
  on public.material_comments (material_id, created_at);

-- ---------------------------------------------------------------------------
-- 8) notification_events / message_logs (카카오 연동 준비)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in (
      'material_approval_request',
      'material_approved',
      'material_change_request',
      'material_reapproval_request',
      'material_all_approved'
    )),
  customer_id uuid references public.customers (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  material_id uuid references public.project_materials (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','skipped')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid references public.notification_events (id) on delete set null,
  channel text not null default 'kakao'
    check (channel in ('kakao','sms','email','etc')),
  recipient text,
  template_code text,
  body text,
  provider_status text not null default 'recorded'
    check (provider_status in ('recorded','queued','sent','failed')),
  provider_message_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_status_idx
  on public.notification_events (status, created_at desc);
create index if not exists message_logs_event_id_idx
  on public.message_logs (notification_event_id);

-- ---------------------------------------------------------------------------
-- 9) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and p.deleted_at is null
        and public.can_access_customer(p.customer_id)
    );
$$;

create or replace function public.customer_token_is_valid(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_access_tokens t
    where t.token = p_token
      and t.revoked_at is null
      and t.expires_at > now()
  );
$$;

create or replace function public.project_id_from_storage_path(object_name text)
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

-- 토큰 없이 storage 직접 접근 완화: 해당 project에 유효 토큰이 있을 때만 anon select 허용
create or replace function public.project_has_valid_material_token(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_access_tokens t
    where t.project_id = p_project_id
      and t.revoked_at is null
      and t.expires_at > now()
      and t.purpose = 'materials'
  );
$$;

-- ---------------------------------------------------------------------------
-- 10) RLS
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.material_catalog enable row level security;
alter table public.project_materials enable row level security;
alter table public.material_images enable row level security;
alter table public.material_approvals enable row level security;
alter table public.customer_access_tokens enable row level security;
alter table public.material_comments enable row level security;
alter table public.notification_events enable row level security;
alter table public.message_logs enable row level security;

-- projects
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated
  using (deleted_at is null and (public.is_admin() or public.can_access_customer(customer_id)));

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert to authenticated
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id))
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete to authenticated
  using (public.is_admin());

-- catalog: all authenticated read; admin write
drop policy if exists "material_catalog_select" on public.material_catalog;
create policy "material_catalog_select" on public.material_catalog
  for select to authenticated using (true);

drop policy if exists "material_catalog_write" on public.material_catalog;
create policy "material_catalog_write" on public.material_catalog
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- project_materials
drop policy if exists "project_materials_select" on public.project_materials;
create policy "project_materials_select" on public.project_materials
  for select to authenticated
  using (deleted_at is null and (public.is_admin() or public.can_access_customer(customer_id)));

drop policy if exists "project_materials_insert" on public.project_materials;
create policy "project_materials_insert" on public.project_materials
  for insert to authenticated
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "project_materials_update" on public.project_materials;
create policy "project_materials_update" on public.project_materials
  for update to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id))
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "project_materials_delete" on public.project_materials;
create policy "project_materials_delete" on public.project_materials
  for delete to authenticated
  using (public.is_admin());

-- material_images via material access
drop policy if exists "material_images_select" on public.material_images;
create policy "material_images_select" on public.material_images
  for select to authenticated
  using (
    exists (
      select 1 from public.project_materials m
      where m.id = material_id
        and m.deleted_at is null
        and (public.is_admin() or public.can_access_customer(m.customer_id))
    )
  );

drop policy if exists "material_images_insert" on public.material_images;
create policy "material_images_insert" on public.material_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.project_materials m
      where m.id = material_id
        and (public.is_admin() or public.can_access_customer(m.customer_id))
    )
  );

drop policy if exists "material_images_update" on public.material_images;
create policy "material_images_update" on public.material_images
  for update to authenticated
  using (
    exists (
      select 1 from public.project_materials m
      where m.id = material_id
        and (public.is_admin() or public.can_access_customer(m.customer_id))
    )
  );

drop policy if exists "material_images_delete" on public.material_images;
create policy "material_images_delete" on public.material_images
  for delete to authenticated
  using (public.is_admin());

-- approvals / comments / tokens
drop policy if exists "material_approvals_select" on public.material_approvals;
create policy "material_approvals_select" on public.material_approvals
  for select to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "material_approvals_insert" on public.material_approvals;
create policy "material_approvals_insert" on public.material_approvals
  for insert to authenticated
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "material_comments_select" on public.material_comments;
create policy "material_comments_select" on public.material_comments
  for select to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "material_comments_insert" on public.material_comments;
create policy "material_comments_insert" on public.material_comments
  for insert to authenticated
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "customer_access_tokens_select" on public.customer_access_tokens;
create policy "customer_access_tokens_select" on public.customer_access_tokens
  for select to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "customer_access_tokens_insert" on public.customer_access_tokens;
create policy "customer_access_tokens_insert" on public.customer_access_tokens
  for insert to authenticated
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "customer_access_tokens_update" on public.customer_access_tokens;
create policy "customer_access_tokens_update" on public.customer_access_tokens
  for update to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id))
  with check (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "notification_events_staff" on public.notification_events;
create policy "notification_events_staff" on public.notification_events
  for all to authenticated
  using (public.is_admin() or customer_id is null or public.can_access_customer(customer_id))
  with check (public.is_admin() or customer_id is null or public.can_access_customer(customer_id));

drop policy if exists "message_logs_staff" on public.message_logs;
create policy "message_logs_staff" on public.message_logs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin() or true);

-- staff can insert message logs for their events
drop policy if exists "message_logs_insert_auth" on public.message_logs;
create policy "message_logs_insert_auth" on public.message_logs
  for insert to authenticated
  with check (true);

drop policy if exists "message_logs_select_auth" on public.message_logs;
create policy "message_logs_select_auth" on public.message_logs
  for select to authenticated
  using (public.is_admin() or true);

-- ---------------------------------------------------------------------------
-- 11) Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-images',
  'material-images',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-change-requests',
  'customer-change-requests',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- path: {project_id}/{material_id|token}/{filename}
drop policy if exists "material_images_storage_select" on storage.objects;
create policy "material_images_storage_select" on storage.objects
  for select to authenticated, anon
  using (
    bucket_id in ('material-images', 'customer-change-requests')
    and (
      public.is_admin()
      or (
        auth.role() = 'authenticated'
        and public.project_id_from_storage_path(name) is not null
        and public.can_access_project(public.project_id_from_storage_path(name))
      )
      or (
        auth.role() = 'anon'
        and public.project_id_from_storage_path(name) is not null
        and public.project_has_valid_material_token(public.project_id_from_storage_path(name))
      )
    )
  );

drop policy if exists "material_images_storage_insert" on storage.objects;
create policy "material_images_storage_insert" on storage.objects
  for insert to authenticated, anon
  with check (
    bucket_id in ('material-images', 'customer-change-requests')
    and (
      (
        auth.role() = 'authenticated'
        and (
          public.is_admin()
          or (
            public.project_id_from_storage_path(name) is not null
            and public.can_access_project(public.project_id_from_storage_path(name))
          )
        )
      )
      or (
        -- 고객 변경요청 이미지만 anon 업로드 (유효 토큰 project)
        auth.role() = 'anon'
        and bucket_id = 'customer-change-requests'
        and public.project_id_from_storage_path(name) is not null
        and public.project_has_valid_material_token(public.project_id_from_storage_path(name))
      )
    )
  );

drop policy if exists "material_images_storage_update" on storage.objects;
create policy "material_images_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('material-images', 'customer-change-requests')
    and public.is_admin()
  )
  with check (
    bucket_id in ('material-images', 'customer-change-requests')
    and public.is_admin()
  );

drop policy if exists "material_images_storage_delete" on storage.objects;
create policy "material_images_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('material-images', 'customer-change-requests')
    and public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- 12) 고객 토큰 포털 RPC (anon, service role 없이)
-- ---------------------------------------------------------------------------
create or replace function public._assert_material_token(p_token text)
returns public.customer_access_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.customer_access_tokens;
begin
  select * into t
  from public.customer_access_tokens
  where token = p_token
    and revoked_at is null
    and expires_at > now()
    and purpose = 'materials';

  if not found then
    raise exception '유효하지 않거나 만료된 접근 링크입니다.';
  end if;

  update public.customer_access_tokens
  set last_accessed_at = now()
  where id = t.id;

  return t;
end;
$$;

create or replace function public.customer_portal_bootstrap(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.customer_access_tokens;
  cust public.customers;
  proj public.projects;
  emp_name text;
  mats jsonb;
  total_cnt int;
  approved_cnt int;
begin
  t := public._assert_material_token(p_token);

  select * into cust from public.customers where id = t.customer_id;
  select * into proj from public.projects where id = t.project_id and deleted_at is null;
  if not found then
    raise exception '현장을 찾을 수 없습니다.';
  end if;

  select e.name into emp_name
  from public.employees e
  where e.id = coalesce(proj.assigned_employee_id, cust.assigned_employee_id);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, x.created_at), '[]'::jsonb),
         count(*)::int,
         count(*) filter (where x.approval_status = '승인완료')::int
  into mats, total_cnt, approved_cnt
  from (
    select
      m.*,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'file_path', i.file_path,
            'file_name', i.file_name,
            'is_cover', i.is_cover,
            'sort_order', i.sort_order
          )
          order by i.sort_order, i.created_at
        )
        from public.material_images i
        where i.material_id = m.id
      ), '[]'::jsonb) as material_images
    from public.project_materials m
    where m.project_id = t.project_id
      and m.deleted_at is null
      and m.approval_status in ('승인요청','승인완료','변경요청','보류','재승인필요')
  ) x;

  return jsonb_build_object(
    'token_id', t.id,
    'customer_id', t.customer_id,
    'project_id', t.project_id,
    'customer_name', cust.name,
    'project_name', proj.name,
    'assignee_name', coalesce(emp_name, ''),
    'expires_at', t.expires_at,
    'materials', mats,
    'total_count', coalesce(total_cnt, 0),
    'approved_count', coalesce(approved_cnt, 0)
  );
end;
$$;

create or replace function public.customer_portal_act(
  p_token text,
  p_material_id uuid,
  p_action text,
  p_actor_name text default null,
  p_change_reason text default null,
  p_desired_product text default null,
  p_desired_color text default null,
  p_customer_note text default null,
  p_reference_image_paths text[] default '{}',
  p_agreed_to_terms boolean default false,
  p_ip_address text default null,
  p_user_agent text default null,
  p_inquiry_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.customer_access_tokens;
  m public.project_materials;
  new_status text;
  snapshot jsonb;
  image_paths text[];
  event_type text;
  all_done boolean;
  approval_id uuid;
begin
  if p_action not in ('승인','변경요청','보류','문의') then
    raise exception '지원하지 않는 작업입니다.';
  end if;

  t := public._assert_material_token(p_token);

  select * into m
  from public.project_materials
  where id = p_material_id
    and project_id = t.project_id
    and customer_id = t.customer_id
    and deleted_at is null;

  if not found then
    raise exception '자재를 찾을 수 없습니다.';
  end if;

  if m.approval_status not in ('승인요청','재승인필요','변경요청','보류','승인완료') then
    raise exception '현재 상태에서는 처리할 수 없습니다.';
  end if;

  if p_action = '문의' then
    if coalesce(trim(p_inquiry_body), '') = '' then
      raise exception '문의 내용을 입력해 주세요.';
    end if;

    insert into public.material_comments (
      material_id, project_id, customer_id, author_type, author_name,
      access_token_id, body
    ) values (
      m.id, m.project_id, m.customer_id, 'customer',
      nullif(trim(coalesce(p_actor_name, '')), ''),
      t.id, trim(p_inquiry_body)
    );

    insert into public.material_approvals (
      material_id, project_id, customer_id, action, status_after,
      actor_type, actor_name, access_token_id, customer_note,
      ip_address, user_agent
    ) values (
      m.id, m.project_id, m.customer_id, '문의', m.approval_status,
      'customer', nullif(trim(coalesce(p_actor_name, '')), ''), t.id,
      trim(p_inquiry_body), p_ip_address, p_user_agent
    );

    return jsonb_build_object('ok', true, 'status', m.approval_status, 'action', '문의');
  end if;

  if p_action = '승인' then
    if m.approval_status not in ('승인요청','재승인필요') then
      raise exception '승인 요청 상태의 자재만 승인할 수 있습니다.';
    end if;
    if coalesce(p_agreed_to_terms, false) is not true then
      raise exception '승인 확인 문구에 동의해 주세요.';
    end if;

    select coalesce(array_agg(i.file_path order by i.sort_order, i.created_at), '{}')
    into image_paths
    from public.material_images i
    where i.material_id = m.id;

    snapshot := jsonb_build_object(
      'product_name', m.product_name,
      'brand', m.brand,
      'model_no', m.model_no,
      'color', m.color,
      'spec', m.spec,
      'apply_location', m.apply_location,
      'quantity', m.quantity,
      'unit', m.unit,
      'base_amount', m.base_amount,
      'extra_amount', m.extra_amount,
      'staff_description', m.staff_description,
      'customer_memo', m.customer_memo,
      'cover_image_path', m.cover_image_path,
      'image_paths', to_jsonb(coalesce(image_paths, '{}')),
      'approved_at', now(),
      'approver_name', coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객')
    );
    new_status := '승인완료';
    event_type := 'material_approved';
  elsif p_action = '변경요청' then
    if coalesce(trim(p_change_reason), '') = '' then
      raise exception '변경 이유를 입력해 주세요.';
    end if;
    new_status := '변경요청';
    snapshot := null;
    event_type := 'material_change_request';
  else
    new_status := '보류';
    snapshot := null;
    event_type := null;
  end if;

  update public.project_materials
  set approval_status = new_status
  where id = m.id;

  insert into public.material_approvals (
    material_id, project_id, customer_id, action, status_after,
    actor_type, actor_name, access_token_id,
    change_reason, desired_product, desired_color, customer_note,
    reference_image_paths, approval_snapshot, agreed_to_terms,
    ip_address, user_agent
  ) values (
    m.id, m.project_id, m.customer_id, p_action, new_status,
    'customer',
    coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객'),
    t.id,
    nullif(trim(coalesce(p_change_reason, '')), ''),
    nullif(trim(coalesce(p_desired_product, '')), ''),
    nullif(trim(coalesce(p_desired_color, '')), ''),
    nullif(trim(coalesce(p_customer_note, '')), ''),
    coalesce(p_reference_image_paths, '{}'),
    snapshot,
    case when p_action = '승인' then true else null end,
    p_ip_address,
    p_user_agent
  )
  returning id into approval_id;

  if event_type is not null then
    insert into public.notification_events (
      event_type, customer_id, project_id, material_id, payload, status
    ) values (
      event_type, m.customer_id, m.project_id, m.id,
      jsonb_build_object(
        'action', p_action,
        'material_id', m.id,
        'product_name', m.product_name,
        'actor_name', coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객')
      ),
      'pending'
    );

    insert into public.message_logs (
      notification_event_id, channel, recipient, template_code, body, provider_status, provider_payload
    )
    select
      ne.id, 'kakao', null, event_type,
      format('[에잇티] %s — %s', event_type, m.product_name),
      'recorded',
      jsonb_build_object('stub', true, 'ready_for_kakao', true)
    from public.notification_events ne
    where ne.material_id = m.id
      and ne.event_type = event_type
    order by ne.created_at desc
    limit 1;
  end if;

  select not exists (
    select 1 from public.project_materials pm
    where pm.project_id = m.project_id
      and pm.deleted_at is null
      and pm.approval_status in ('승인요청','재승인필요','변경요청','보류','작성중')
  ) into all_done;

  if all_done and p_action = '승인' then
    insert into public.notification_events (
      event_type, customer_id, project_id, material_id, payload, status
    ) values (
      'material_all_approved', m.customer_id, m.project_id, null,
      jsonb_build_object('project_id', m.project_id),
      'pending'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', new_status,
    'action', p_action,
    'approval_id', approval_id
  );
end;
$$;

grant execute on function public.customer_portal_bootstrap(text) to anon, authenticated;
grant execute on function public.customer_portal_act(
  text, uuid, text, text, text, text, text, text, text[], boolean, text, text, text
) to anon, authenticated;

notify pgrst, 'reload schema';
