-- =============================================================================
-- Eighty ERP — quote_templates (견적 템플릿)
-- 파일: 20260803000043_quote_templates.sql
--
-- 안전:
--   - 신규 테이블만 추가 (quotes / quote_items 변경 없음)
--   - 기존 데이터 UPDATE/DELETE 없음
--   - company_id + current_company_id() RLS
--   - 물리 DELETE 대신 archived_at 보관
-- =============================================================================

begin;

create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  quote_type text not null,
  quote_mode text not null default 'detailed',
  trade_order jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  trade_count integer not null default 0,
  item_count integer not null default 0,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_templates_name_len check (char_length(trim(name)) between 1 and 120),
  constraint quote_templates_quote_type_check
    check (quote_type in ('인테리어', '창호', '공통')),
  constraint quote_templates_quote_mode_check
    check (quote_mode in ('simple', 'detailed')),
  constraint quote_templates_trade_count_check check (trade_count >= 0),
  constraint quote_templates_item_count_check check (item_count >= 0)
);

create index if not exists quote_templates_company_updated_idx
  on public.quote_templates (company_id, updated_at desc)
  where archived_at is null;

create index if not exists quote_templates_company_archived_idx
  on public.quote_templates (company_id, archived_at)
  where archived_at is not null;

create index if not exists quote_templates_company_type_idx
  on public.quote_templates (company_id, quote_type)
  where archived_at is null;

drop trigger if exists quote_templates_set_updated_at on public.quote_templates;
create trigger quote_templates_set_updated_at
  before update on public.quote_templates
  for each row
  execute function public.touch_updated_at_column();

alter table public.quote_templates enable row level security;

-- 조회: 같은 회사 멤버 (employee 포함). 활성+보관 모두 조회 가능(관리 화면용)
drop policy if exists quote_templates_select_company on public.quote_templates;
create policy quote_templates_select_company
  on public.quote_templates
  for select
  to authenticated
  using (
    company_id = (select public.current_company_id())
    and public.is_company_member(company_id)
  );

-- 생성: owner / director / admin
drop policy if exists quote_templates_insert_managers on public.quote_templates;
create policy quote_templates_insert_managers
  on public.quote_templates
  for insert
  to authenticated
  with check (
    company_id = (select public.current_company_id())
    and public.is_company_member(company_id)
    and public.current_company_role() in ('owner', 'director', 'admin')
  );

-- 수정·보관: owner / director / admin
drop policy if exists quote_templates_update_managers on public.quote_templates;
create policy quote_templates_update_managers
  on public.quote_templates
  for update
  to authenticated
  using (
    company_id = (select public.current_company_id())
    and public.is_company_member(company_id)
    and public.current_company_role() in ('owner', 'director', 'admin')
  )
  with check (
    company_id = (select public.current_company_id())
    and public.is_company_member(company_id)
    and public.current_company_role() in ('owner', 'director', 'admin')
  );

-- 회사 가드 (RESTRICTIVE)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_templates'
      and policyname = 'quote_templates_company_guard'
  ) then
    create policy quote_templates_company_guard
      on public.quote_templates
      as restrictive
      for all
      to authenticated
      using (company_id = (select public.current_company_id()))
      with check (company_id = (select public.current_company_id()));
  end if;
end $$;

revoke all on table public.quote_templates from public, anon;
grant select, insert, update on table public.quote_templates to authenticated;

comment on table public.quote_templates is
  '회사별 견적 템플릿. 고객·특별할인·share 정보는 저장하지 않음.';

notify pgrst, 'reload schema';

commit;
