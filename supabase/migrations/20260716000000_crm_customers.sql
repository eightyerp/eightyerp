-- Eighty ERP CRM: teams, employees, lead_sources, customers, inquiry_messages

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type public.consultation_type as enum ('창호', '인테리어', '욕실', '기타');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.customer_status as enum (
    '신규', '미연락', '상담중', '방문예약', '견적제출', '계약', '보류', '완료'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inquiry_source_type as enum (
    'online', 'sms', 'kakao', 'lx_headquarters', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inquiry_process_status as enum (
    'pending', 'parsed', 'registered', 'ignored'
  );
exception when duplicate_object then null;
end $$;

-- teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- employees
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete set null,
  name text not null,
  title text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- lead_sources
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  address text,
  consultation_type public.consultation_type not null default '기타',
  status public.customer_status not null default '신규',
  lead_source_id uuid references public.lead_sources (id) on delete set null,
  assigned_employee_id uuid references public.employees (id) on delete set null,
  consultation_notes text,
  next_contact_at date,
  interest_items text[] not null default '{}',
  desired_timing text,
  special_notes text,
  event_memo text,
  inquiry_raw_text text,
  source_order_no text,
  source_channel text,
  source_round text,
  happy_call_required boolean not null default false,
  happy_call_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_phone_unique unique (phone)
);

create index if not exists customers_name_idx on public.customers (name);
create index if not exists customers_status_idx on public.customers (status);
create index if not exists customers_lead_source_id_idx on public.customers (lead_source_id);
create index if not exists customers_assigned_employee_id_idx on public.customers (assigned_employee_id);
create index if not exists customers_created_at_idx on public.customers (created_at desc);

-- inquiry_messages
create table if not exists public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  source_type public.inquiry_source_type not null default 'other',
  raw_text text not null,
  parsed_data jsonb not null default '{}'::jsonb,
  customer_id uuid references public.customers (id) on delete set null,
  status public.inquiry_process_status not null default 'pending',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inquiry_messages_status_idx on public.inquiry_messages (status);
create index if not exists inquiry_messages_customer_id_idx on public.inquiry_messages (customer_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- Seed teams
insert into public.teams (name, sort_order) values
  ('경영', 1),
  ('인테리어', 2),
  ('창호', 3)
on conflict (name) do nothing;

-- Seed employees
with t as (
  select id, name from public.teams
)
insert into public.employees (team_id, name, title, sort_order)
select t.id, e.name, e.title, e.sort_order
from (
  values
    ('경영', '이응세', '대표이사', 1),
    ('경영', '김설화', '이사', 2),
    ('인테리어', '양현준', '인테리어 팀장', 3),
    ('인테리어', '양현제', '인테리어 팀장', 4),
    ('인테리어', '조근아', '인테리어 실장', 5),
    ('인테리어', '김솔', '인테리어 팀장', 6),
    ('인테리어', '김유진', '인테리어 실장', 7),
    ('창호', '홍인표', '창호 팀장', 8),
    ('창호', '이응준', '창호 팀장', 9),
    ('창호', '최준우', '창호 팀장', 10),
    ('창호', '김정아', '창호 실장', 11),
    ('창호', '오용철', '창호 팀장', 12)
) as e(team_name, name, title, sort_order)
join t on t.name = e.team_name
where not exists (
  select 1 from public.employees existing
  where existing.name = e.name and existing.title = e.title
);

-- Seed lead sources
insert into public.lead_sources (name, sort_order) values
  ('네이버 검색광고', 1),
  ('네이버 블로그', 2),
  ('네이버 플레이스', 3),
  ('인스타그램', 4),
  ('페이스북', 5),
  ('유튜브', 6),
  ('홈페이지 문의', 7),
  ('카카오톡', 8),
  ('문자문의', 9),
  ('단지행사', 10),
  ('입주설명회', 11),
  ('공동구매', 12),
  ('현수막', 13),
  ('전단지', 14),
  ('소개고객', 15),
  ('기존고객 재문의', 16),
  ('LX하우시스 본사', 17),
  ('KCC/홈씨씨', 18),
  ('기타', 19)
on conflict (name) do nothing;

-- RLS
alter table public.teams enable row level security;
alter table public.employees enable row level security;
alter table public.lead_sources enable row level security;
alter table public.customers enable row level security;
alter table public.inquiry_messages enable row level security;

-- Authenticated users: full read/write
drop policy if exists "teams_select_authenticated" on public.teams;
create policy "teams_select_authenticated" on public.teams
  for select to authenticated using (true);

drop policy if exists "teams_insert_authenticated" on public.teams;
create policy "teams_insert_authenticated" on public.teams
  for insert to authenticated with check (true);

drop policy if exists "teams_update_authenticated" on public.teams;
create policy "teams_update_authenticated" on public.teams
  for update to authenticated using (true) with check (true);

drop policy if exists "teams_delete_authenticated" on public.teams;
create policy "teams_delete_authenticated" on public.teams
  for delete to authenticated using (true);

drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated" on public.employees
  for select to authenticated using (true);

drop policy if exists "employees_insert_authenticated" on public.employees;
create policy "employees_insert_authenticated" on public.employees
  for insert to authenticated with check (true);

drop policy if exists "employees_update_authenticated" on public.employees;
create policy "employees_update_authenticated" on public.employees
  for update to authenticated using (true) with check (true);

drop policy if exists "employees_delete_authenticated" on public.employees;
create policy "employees_delete_authenticated" on public.employees
  for delete to authenticated using (true);

drop policy if exists "lead_sources_select_authenticated" on public.lead_sources;
create policy "lead_sources_select_authenticated" on public.lead_sources
  for select to authenticated using (true);

drop policy if exists "lead_sources_insert_authenticated" on public.lead_sources;
create policy "lead_sources_insert_authenticated" on public.lead_sources
  for insert to authenticated with check (true);

drop policy if exists "lead_sources_update_authenticated" on public.lead_sources;
create policy "lead_sources_update_authenticated" on public.lead_sources
  for update to authenticated using (true) with check (true);

drop policy if exists "lead_sources_delete_authenticated" on public.lead_sources;
create policy "lead_sources_delete_authenticated" on public.lead_sources
  for delete to authenticated using (true);

drop policy if exists "customers_select_authenticated" on public.customers;
create policy "customers_select_authenticated" on public.customers
  for select to authenticated using (true);

drop policy if exists "customers_insert_authenticated" on public.customers;
create policy "customers_insert_authenticated" on public.customers
  for insert to authenticated with check (true);

drop policy if exists "customers_update_authenticated" on public.customers;
create policy "customers_update_authenticated" on public.customers
  for update to authenticated using (true) with check (true);

drop policy if exists "customers_delete_authenticated" on public.customers;
create policy "customers_delete_authenticated" on public.customers
  for delete to authenticated using (true);

drop policy if exists "inquiry_messages_select_authenticated" on public.inquiry_messages;
create policy "inquiry_messages_select_authenticated" on public.inquiry_messages
  for select to authenticated using (true);

drop policy if exists "inquiry_messages_insert_authenticated" on public.inquiry_messages;
create policy "inquiry_messages_insert_authenticated" on public.inquiry_messages
  for insert to authenticated with check (true);

drop policy if exists "inquiry_messages_update_authenticated" on public.inquiry_messages;
create policy "inquiry_messages_update_authenticated" on public.inquiry_messages
  for update to authenticated using (true) with check (true);

drop policy if exists "inquiry_messages_delete_authenticated" on public.inquiry_messages;
create policy "inquiry_messages_delete_authenticated" on public.inquiry_messages
  for delete to authenticated using (true);
