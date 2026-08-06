-- Eighty ERP - safe employee Master merge
-- This migration only adds merge metadata/audit objects. It never deletes employees.

alter table public.employees
  add column if not exists merged_into_employee_id uuid references public.employees(id) on delete restrict,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_merge_not_self_check'
  ) then
    alter table public.employees
      add constraint employees_merge_not_self_check
      check (merged_into_employee_id is null or merged_into_employee_id <> id);
  end if;
end;
$$;

create index if not exists employees_merged_into_employee_id_idx
  on public.employees(merged_into_employee_id)
  where merged_into_employee_id is not null;

create table if not exists public.employee_merge_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_employee_id uuid not null references public.employees(id) on delete restrict,
  target_employee_id uuid not null references public.employees(id) on delete restrict,
  transferred_counts jsonb not null default '{}'::jsonb,
  login_resolution jsonb not null default '{}'::jsonb,
  before_totals jsonb not null default '{}'::jsonb,
  after_totals jsonb not null default '{}'::jsonb,
  executed_by uuid not null references auth.users(id) on delete restrict,
  executed_at timestamptz not null default now(),
  constraint employee_merge_logs_different_employee_check
    check (source_employee_id <> target_employee_id)
);

create index if not exists employee_merge_logs_company_executed_idx
  on public.employee_merge_logs(company_id, executed_at desc);
create index if not exists employee_merge_logs_source_idx
  on public.employee_merge_logs(source_employee_id);
create index if not exists employee_merge_logs_target_idx
  on public.employee_merge_logs(target_employee_id);

alter table public.employee_merge_logs enable row level security;
drop policy if exists employee_merge_logs_select_admin on public.employee_merge_logs;
create policy employee_merge_logs_select_admin on public.employee_merge_logs
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin'))
  );

-- Every current single-column FK to employees.id is discovered at execution time.
-- Audit/history links remain attached to the original employee and are explicitly marked.
create or replace function public.get_employee_merge_impact(
  p_source_employee_id uuid,
  p_target_employee_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_source public.employees;
  v_target public.employees;
  v_ref record;
  v_source_count bigint;
  v_target_count bigint;
  v_references jsonb := '[]'::jsonb;
  v_logins jsonb := '[]'::jsonb;
begin
  if not (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin')) then
    raise exception '관리자만 직원 병합 영향을 조회할 수 있습니다.';
  end if;
  if p_source_employee_id is null or p_target_employee_id is null
     or p_source_employee_id = p_target_employee_id then
    raise exception '서로 다른 기준 직원과 중복 직원을 선택해 주세요.';
  end if;

  select * into v_source from public.employees where id = p_source_employee_id;
  select * into v_target from public.employees where id = p_target_employee_id;
  if v_source.id is null or v_target.id is null then raise exception '직원을 찾을 수 없습니다.'; end if;
  if v_source.company_id is distinct from v_target.company_id
     or v_source.company_id is distinct from public.current_company_id() then
    raise exception '동일 회사의 직원끼리만 병합할 수 있습니다.';
  end if;

  for v_ref in
    with employee_refs as (
      select n.nspname as table_schema, c.relname as table_name, a.attname as column_name, c.oid
      from pg_constraint fk
      join pg_class c on c.oid = fk.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
      where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
        and array_length(fk.conkey, 1) = 1 and array_length(fk.confkey, 1) = 1
      union
      select n.nspname, c.relname, a.attname, c.oid
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid and c.relkind in ('r', 'p')
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
        and a.atttypid = 'uuid'::regtype
        and a.attname in ('employee_id', 'assigned_employee_id')
    )
    select table_schema, table_name, column_name,
           case
             when oid in ('public.employee_merge_logs'::regclass, 'public.employee_master_events'::regclass)
                  or oid = 'public.employees'::regclass then 'history'
             when oid in ('public.profiles'::regclass, 'public.company_memberships'::regclass) then 'login'
             else 'business'
           end as reference_kind
    from employee_refs
    order by table_schema, table_name, column_name
  loop
    execute format('select count(*) from %I.%I where %I = $1', v_ref.table_schema, v_ref.table_name, v_ref.column_name)
      into v_source_count using p_source_employee_id;
    execute format('select count(*) from %I.%I where %I = $1', v_ref.table_schema, v_ref.table_name, v_ref.column_name)
      into v_target_count using p_target_employee_id;
    v_references := v_references || jsonb_build_array(jsonb_build_object(
      'schema', v_ref.table_schema, 'table', v_ref.table_name, 'column', v_ref.column_name,
      'kind', v_ref.reference_kind, 'source_count', v_source_count, 'target_count', v_target_count,
      'combined_count', v_source_count + v_target_count
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', p.id, 'employee_id', p.employee_id, 'email', coalesce(u.email, p.email),
    'full_name', p.full_name, 'is_active', p.is_active, 'role', p.role
  ) order by p.employee_id, p.id), '[]'::jsonb)
  into v_logins
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.employee_id in (p_source_employee_id, p_target_employee_id);

  return jsonb_build_object(
    'source', jsonb_build_object('id', v_source.id, 'name', v_source.name, 'is_active', v_source.is_active,
      'merged_into_employee_id', v_source.merged_into_employee_id),
    'target', jsonb_build_object('id', v_target.id, 'name', v_target.name, 'is_active', v_target.is_active,
      'merged_into_employee_id', v_target.merged_into_employee_id),
    'references', v_references,
    'logins', v_logins
  );
end;
$$;

create or replace function public.merge_employees(
  p_source_employee_id uuid,
  p_target_employee_id uuid,
  p_keep_profile_id uuid default null,
  p_other_login_action text default 'unlink'
)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_source public.employees;
  v_target public.employees;
  v_ref record;
  v_source_profile uuid;
  v_target_profile uuid;
  v_keep_profile uuid;
  v_other_profile uuid;
  v_count bigint;
  v_source_after bigint;
  v_target_after bigint;
  v_before_source bigint;
  v_before_target bigint;
  v_counts jsonb := '{}'::jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_key text;
  v_log_id uuid;
begin
  if not (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin')) then
    raise exception '관리자만 직원을 병합할 수 있습니다.';
  end if;
  if p_source_employee_id is null or p_target_employee_id is null
     or p_source_employee_id = p_target_employee_id then
    raise exception '서로 다른 기준 직원과 중복 직원을 선택해 주세요.';
  end if;
  if p_other_login_action not in ('unlink', 'deactivate') then
    raise exception '나머지 로그인 계정 처리는 unlink 또는 deactivate만 가능합니다.';
  end if;
  if exists (
    select 1 from pg_constraint fk
    where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
      and (array_length(fk.conkey, 1) <> 1 or array_length(fk.confkey, 1) <> 1)
  ) then
    raise exception '복합 employees FK가 발견되어 안전을 위해 병합을 중단합니다. 운영 FK 검증 결과를 확인해 주세요.';
  end if;

  -- Deterministic row lock prevents concurrent/reversed merges.
  perform 1 from public.employees
  where id in (p_source_employee_id, p_target_employee_id)
  order by id for update;
  select * into v_source from public.employees where id = p_source_employee_id;
  select * into v_target from public.employees where id = p_target_employee_id;
  if v_source.id is null or v_target.id is null then raise exception '직원을 찾을 수 없습니다.'; end if;
  if v_source.company_id is distinct from v_target.company_id
     or v_source.company_id is distinct from public.current_company_id() then
    raise exception '동일 회사의 직원끼리만 병합할 수 있습니다.';
  end if;
  if not v_target.is_active then raise exception '기준 직원은 활성 상태여야 합니다.'; end if;
  if v_source.merged_into_employee_id is not null or v_target.merged_into_employee_id is not null then
    raise exception '이미 병합된 직원은 다시 병합할 수 없습니다.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and employee_id = p_source_employee_id) then
    raise exception '현재 로그인한 본인 직원 레코드는 중복 직원으로 병합할 수 없습니다.';
  end if;
  if exists (
    select 1 from public.company_memberships
    where company_id = v_source.company_id and employee_id = p_source_employee_id
      and role = 'owner' and status = 'active'
  ) then
    raise exception '대표(owner) 계정이 연결된 직원은 중복 직원으로 병합할 수 없습니다.';
  end if;

  select id into v_source_profile from public.profiles where employee_id = p_source_employee_id for update;
  select id into v_target_profile from public.profiles where employee_id = p_target_employee_id for update;

  if v_source_profile is not null and v_target_profile is not null then
    if p_keep_profile_id is null or p_keep_profile_id not in (v_source_profile, v_target_profile) then
      raise exception '두 직원 모두 로그인 계정이 있습니다. 유지할 로그인 계정을 선택해 주세요.';
    end if;
    v_keep_profile := p_keep_profile_id;
    v_other_profile := case when p_keep_profile_id = v_source_profile then v_target_profile else v_source_profile end;
  else
    v_keep_profile := coalesce(v_source_profile, v_target_profile);
    v_other_profile := null;
  end if;

  -- Resolve profile uniqueness before moving the kept profile.
  if v_other_profile is not null then
    update public.profiles
      set employee_id = null,
          is_active = case when p_other_login_action = 'deactivate' then false else is_active end,
          updated_at = now()
    where id = v_other_profile;
    update public.company_memberships
      set employee_id = null,
          status = case when p_other_login_action = 'deactivate' then 'suspended' else status end,
          updated_at = now()
    where company_id = v_source.company_id and user_id = v_other_profile;
  end if;
  if v_keep_profile is not null then
    update public.profiles set employee_id = p_target_employee_id, updated_at = now()
      where id = v_keep_profile;
    update public.company_memberships set employee_id = p_target_employee_id, updated_at = now()
      where company_id = v_source.company_id and user_id = v_keep_profile;
  end if;

  -- Move actual employee FKs plus UUID employee_id/assigned_employee_id candidates.
  for v_ref in
    with employee_refs as (
      select n.nspname as table_schema, c.relname as table_name, a.attname as column_name, c.oid
      from pg_constraint fk
      join pg_class c on c.oid = fk.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
      where fk.contype = 'f' and fk.confrelid = 'public.employees'::regclass
        and array_length(fk.conkey, 1) = 1 and array_length(fk.confkey, 1) = 1
      union
      select n.nspname, c.relname, a.attname, c.oid
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid and c.relkind in ('r', 'p')
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
        and a.atttypid = 'uuid'::regtype
        and a.attname in ('employee_id', 'assigned_employee_id')
    )
    select table_schema, table_name, column_name
    from employee_refs
    where oid not in (
        'public.employees'::regclass, 'public.profiles'::regclass,
        'public.company_memberships'::regclass, 'public.employee_merge_logs'::regclass,
        'public.employee_master_events'::regclass
      )
    order by table_schema, table_name, column_name
  loop
    v_key := v_ref.table_schema || '.' || v_ref.table_name || '.' || v_ref.column_name;
    execute format('select count(*) from %I.%I where %I = $1', v_ref.table_schema, v_ref.table_name, v_ref.column_name)
      into v_before_source using p_source_employee_id;
    execute format('select count(*) from %I.%I where %I = $1', v_ref.table_schema, v_ref.table_name, v_ref.column_name)
      into v_before_target using p_target_employee_id;
    v_before := v_before || jsonb_build_object(v_key, v_before_source + v_before_target);

    execute format('update %I.%I set %I = $1 where %I = $2',
      v_ref.table_schema, v_ref.table_name, v_ref.column_name, v_ref.column_name)
      using p_target_employee_id, p_source_employee_id;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object(v_key, v_count);

    execute format('select count(*) from %I.%I where %I = $1', v_ref.table_schema, v_ref.table_name, v_ref.column_name)
      into v_source_after using p_source_employee_id;
    execute format('select count(*) from %I.%I where %I = $1', v_ref.table_schema, v_ref.table_name, v_ref.column_name)
      into v_target_after using p_target_employee_id;
    v_after := v_after || jsonb_build_object(v_key, v_source_after + v_target_after);
    if v_source_after <> 0 or v_target_after <> v_before_source + v_before_target then
      raise exception '병합 전후 건수 검증 실패: %', v_key;
    end if;
  end loop;

  update public.employees
  set is_active = false,
      merged_into_employee_id = p_target_employee_id,
      merged_at = now(),
      merged_by = auth.uid(),
      updated_at = now()
  where id = p_source_employee_id;

  insert into public.employee_merge_logs(
    company_id, source_employee_id, target_employee_id, transferred_counts,
    login_resolution, before_totals, after_totals, executed_by
  ) values (
    v_source.company_id, p_source_employee_id, p_target_employee_id, v_counts,
    jsonb_build_object('kept_profile_id', v_keep_profile, 'other_profile_id', v_other_profile,
      'other_action', p_other_login_action),
    v_before, v_after, auth.uid()
  ) returning id into v_log_id;

  insert into public.employee_master_events(company_id, employee_id, event_type, actor_id, detail)
  values (v_source.company_id, p_target_employee_id, 'employees_merged', auth.uid(),
    jsonb_build_object('merge_log_id', v_log_id, 'source_employee_id', p_source_employee_id,
      'transferred_counts', v_counts));

  return jsonb_build_object(
    'merge_log_id', v_log_id, 'source_employee_id', p_source_employee_id,
    'target_employee_id', p_target_employee_id, 'transferred_counts', v_counts,
    'before_totals', v_before, 'after_totals', v_after
  );
end;
$$;

create or replace function public.list_employee_merge_states()
returns table(employee_id uuid, merged_into_employee_id uuid, merged_at timestamptz, merged_by uuid)
language sql security definer
set search_path = public
as $$
  select e.id, e.merged_into_employee_id, e.merged_at, e.merged_by
  from public.employees e
  where e.company_id = public.current_company_id()
    and (public.is_admin() or public.current_company_role() in ('owner', 'director', 'admin'));
$$;

revoke all on function public.get_employee_merge_impact(uuid, uuid) from public, anon;
revoke all on function public.merge_employees(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.list_employee_merge_states() from public, anon;
grant execute on function public.get_employee_merge_impact(uuid, uuid) to authenticated;
grant execute on function public.merge_employees(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.list_employee_merge_states() to authenticated;

notify pgrst, 'reload schema';
