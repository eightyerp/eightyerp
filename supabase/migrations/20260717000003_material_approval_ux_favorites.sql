-- Eighty ERP: 자재 전체승인 UX, 공종 확장, 즐겨찾기, 직원 삭제 권한
-- 기존 migration 미수정. 고객 삭제 RLS는 변경하지 않음.

-- ---------------------------------------------------------------------------
-- 1) 공종(trade) 값 마이그레이션 + CHECK 교체
-- ---------------------------------------------------------------------------
update public.project_materials
set trade = '욕실'
where trade = '욕실제품';

update public.project_materials
set trade = '스위치'
where trade = '스위치/콘센트';

update public.material_catalog
set trade = '욕실'
where trade = '욕실제품';

update public.material_catalog
set trade = '스위치'
where trade = '스위치/콘센트';

alter table public.project_materials drop constraint if exists project_materials_trade_check;
alter table public.project_materials
  add constraint project_materials_trade_check
  check (trade in (
    '창호','바닥재','도배','타일','필름','도어','중문','주방가구','붙박이장',
    '욕실','수전','도기','샤워부스','조명','스위치','콘센트','커튼','블라인드',
    '에어컨','환기','가전','도장','목공','철거','확장','전기','기타'
  ));

-- ---------------------------------------------------------------------------
-- 2) 고객 변경요청 (공간·공종 단위, 자재 개별 승인 아님)
-- ---------------------------------------------------------------------------
create table if not exists public.material_change_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  access_token_id uuid references public.customer_access_tokens (id) on delete set null,
  space_name text not null
    check (space_name in (
      '공통','현관','거실','주방','안방','침실','욕실1','욕실2','발코니','다용도실','기타'
    )),
  trade text not null
    check (trade in (
      '창호','바닥재','도배','타일','필름','도어','중문','주방가구','붙박이장',
      '욕실','수전','도기','샤워부스','조명','스위치','콘센트','커튼','블라인드',
      '에어컨','환기','가전','도장','목공','철거','확장','전기','기타'
    )),
  change_body text not null,
  image_paths text[] not null default '{}',
  actor_name text,
  status text not null default '접수'
    check (status in ('접수','처리중','완료','취소')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists material_change_requests_project_idx
  on public.material_change_requests (project_id, created_at desc);

alter table public.material_change_requests enable row level security;

drop policy if exists "material_change_requests_staff_select" on public.material_change_requests;
create policy "material_change_requests_staff_select" on public.material_change_requests
  for select to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id));

drop policy if exists "material_change_requests_staff_update" on public.material_change_requests;
create policy "material_change_requests_staff_update" on public.material_change_requests
  for update to authenticated
  using (public.is_admin() or public.can_access_customer(customer_id))
  with check (public.is_admin() or public.can_access_customer(customer_id));

-- ---------------------------------------------------------------------------
-- 3) 즐겨찾기 (직원별)
-- ---------------------------------------------------------------------------
create table if not exists public.material_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trade text not null
    check (trade in (
      '창호','바닥재','도배','타일','필름','도어','중문','주방가구','붙박이장',
      '욕실','수전','도기','샤워부스','조명','스위치','콘센트','커튼','블라인드',
      '에어컨','환기','가전','도장','목공','철거','확장','전기','기타'
    )),
  brand text,
  product_name text not null,
  model_no text,
  color text,
  spec text,
  unit text not null default '개',
  base_amount integer not null default 0,
  extra_amount integer not null default 0,
  supplier text,
  staff_description text,
  cover_image_path text,
  source_material_id uuid references public.project_materials (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists material_favorites_user_id_idx
  on public.material_favorites (user_id, created_at desc);

alter table public.material_favorites enable row level security;

drop policy if exists "material_favorites_select" on public.material_favorites;
create policy "material_favorites_select" on public.material_favorites
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "material_favorites_insert" on public.material_favorites;
create policy "material_favorites_insert" on public.material_favorites
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "material_favorites_update" on public.material_favorites;
create policy "material_favorites_update" on public.material_favorites
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "material_favorites_delete" on public.material_favorites;
create policy "material_favorites_delete" on public.material_favorites
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) 마감자재 삭제 — 로그인 직원(담당 접근). 고객 삭제는 미변경.
-- ---------------------------------------------------------------------------
drop policy if exists "project_materials_delete" on public.project_materials;
create policy "project_materials_delete" on public.project_materials
  for delete to authenticated
  using (
    auth.uid() is not null
    and (public.is_admin() or public.can_access_customer(customer_id))
  );

drop policy if exists "material_images_delete" on public.material_images;
create policy "material_images_delete" on public.material_images
  for delete to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.project_materials m
      where m.id = material_id
        and (public.is_admin() or public.can_access_customer(m.customer_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 5) material_approvals action 확장 (전체승인)
-- ---------------------------------------------------------------------------
alter table public.material_approvals drop constraint if exists material_approvals_action_check;
alter table public.material_approvals
  add constraint material_approvals_action_check
  check (action in (
    '승인요청','승인','전체승인','변경요청','보류','재승인필요','승인취소','문의'
  ));

alter table public.material_approvals
  alter column material_id drop not null;

-- ---------------------------------------------------------------------------
-- 6) 고객 RPC: 전체 승인 / 변경 요청
-- ---------------------------------------------------------------------------
create or replace function public.customer_portal_approve_all(
  p_token text,
  p_actor_name text default null,
  p_agreed_to_terms boolean default false,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.customer_access_tokens;
  m public.project_materials;
  image_paths text[];
  snapshot jsonb;
  approved_count int := 0;
  actor text;
begin
  if coalesce(p_agreed_to_terms, false) is not true then
    raise exception '승인 확인 문구에 동의해 주세요.';
  end if;

  t := public._assert_material_token(p_token);
  actor := coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객');

  for m in
    select *
    from public.project_materials
    where project_id = t.project_id
      and customer_id = t.customer_id
      and deleted_at is null
      and approval_status in ('승인요청', '재승인필요')
    order by sort_order, created_at
  loop
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
      'approver_name', actor
    );

    update public.project_materials
    set approval_status = '승인완료'
    where id = m.id;

    insert into public.material_approvals (
      material_id, project_id, customer_id, action, status_after,
      actor_type, actor_name, access_token_id,
      approval_snapshot, agreed_to_terms, ip_address, user_agent
    ) values (
      m.id, m.project_id, m.customer_id, '전체승인', '승인완료',
      'customer', actor, t.id,
      snapshot, true, p_ip_address, p_user_agent
    );

    approved_count := approved_count + 1;
  end loop;

  if approved_count = 0 then
    raise exception '승인할 자재가 없습니다. (승인요청/재승인필요 상태만 일괄 승인됩니다)';
  end if;

  insert into public.notification_events (
    event_type, customer_id, project_id, material_id, payload, status
  ) values (
    'material_all_approved', t.customer_id, t.project_id, null,
    jsonb_build_object(
      'approved_count', approved_count,
      'actor_name', actor
    ),
    'pending'
  );

  insert into public.message_logs (
    notification_event_id, channel, template_code, body, provider_status, provider_payload
  )
  select ne.id, 'kakao', 'material_all_approved',
    format('[에잇티] 전체 자재 승인 완료 (%s건)', approved_count),
    'recorded',
    jsonb_build_object('stub', true, 'ready_for_kakao', true)
  from public.notification_events ne
  where ne.project_id = t.project_id
    and ne.event_type = 'material_all_approved'
  order by ne.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'action', '전체승인',
    'approved_count', approved_count
  );
end;
$$;

create or replace function public.customer_portal_change_request(
  p_token text,
  p_space_name text,
  p_trade text,
  p_change_body text,
  p_actor_name text default null,
  p_reference_image_paths text[] default '{}',
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.customer_access_tokens;
  req_id uuid;
  actor text;
  matched int := 0;
begin
  t := public._assert_material_token(p_token);

  if coalesce(trim(p_space_name), '') = '' then
    raise exception '공간을 선택해 주세요.';
  end if;
  if coalesce(trim(p_trade), '') = '' then
    raise exception '공종을 선택해 주세요.';
  end if;
  if coalesce(trim(p_change_body), '') = '' then
    raise exception '변경 내용을 입력해 주세요.';
  end if;

  actor := coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객');

  insert into public.material_change_requests (
    project_id, customer_id, access_token_id,
    space_name, trade, change_body, image_paths,
    actor_name, status, ip_address, user_agent
  ) values (
    t.project_id, t.customer_id, t.id,
    p_space_name, p_trade, trim(p_change_body),
    coalesce(p_reference_image_paths, '{}'),
    actor, '접수', p_ip_address, p_user_agent
  )
  returning id into req_id;

  update public.project_materials
  set approval_status = '변경요청'
  where project_id = t.project_id
    and customer_id = t.customer_id
    and deleted_at is null
    and space_name = p_space_name
    and trade = p_trade
    and approval_status in ('승인요청', '재승인필요', '승인완료', '보류');

  get diagnostics matched = row_count;

  insert into public.material_approvals (
    material_id, project_id, customer_id, action, status_after,
    actor_type, actor_name, access_token_id,
    change_reason, customer_note, reference_image_paths,
    ip_address, user_agent
  ) values (
    null, t.project_id, t.customer_id, '변경요청', '변경요청',
    'customer', actor, t.id,
    trim(p_change_body),
    format('공간:%s / 공종:%s', p_space_name, p_trade),
    coalesce(p_reference_image_paths, '{}'),
    p_ip_address, p_user_agent
  );

  insert into public.notification_events (
    event_type, customer_id, project_id, material_id, payload, status
  ) values (
    'material_change_request', t.customer_id, t.project_id, null,
    jsonb_build_object(
      'change_request_id', req_id,
      'space_name', p_space_name,
      'trade', p_trade,
      'matched_materials', matched,
      'actor_name', actor
    ),
    'pending'
  );

  insert into public.message_logs (
    notification_event_id, channel, template_code, body, provider_status, provider_payload
  )
  select ne.id, 'kakao', 'material_change_request',
    format('[에잇티] 변경요청 — %s / %s', p_space_name, p_trade),
    'recorded',
    jsonb_build_object('stub', true, 'ready_for_kakao', true)
  from public.notification_events ne
  where ne.project_id = t.project_id
    and ne.event_type = 'material_change_request'
  order by ne.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'action', '변경요청',
    'change_request_id', req_id,
    'matched_materials', matched
  );
end;
$$;

grant execute on function public.customer_portal_approve_all(text, text, boolean, text, text)
  to anon, authenticated;
grant execute on function public.customer_portal_change_request(
  text, text, text, text, text, text[], text, text
) to anon, authenticated;

notify pgrst, 'reload schema';
