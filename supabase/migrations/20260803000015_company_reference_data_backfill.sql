-- =============================================================================
-- Eighty ERP — 회사 기능 4F단계: 공통 참조·감사 테이블 company_id
-- 파일: 20260803000015_company_reference_data_backfill.sql
--
-- 범위:
--   - public.lead_sources.company_id (nullable) 추가
--   - public.material_categories.company_id (nullable) 추가
--   - public.audit_logs.company_id (nullable) 추가
--   - public.material_catalog.company_id (nullable) 추가
--   - public.material_catalog_images.company_id (nullable) 추가
--   - companies(id) FK
--   - 참조 데이터는 주식회사 에잇티(5328102974)로 null 행만 연결
--   - catalog/images는 부모 category/catalog company_id 상속
--   - audit_logs는 작성자(active_company / 단일 active membership) 상속
--   - 검증 성공 후 company_id default = public.current_company_id()
--
-- 회사별 UNIQUE 전환 이유:
--   - 기존 전역 UNIQUE(name/code)는 회사 간 동일 코드·이름을 막음
--   - 멀티테넌시에서는 (company_id, name/code) 단위로만 유일해야 함
--   - lead_sources UNIQUE(name), material_categories UNIQUE(code) 만 교체
--
-- 상속 규칙:
--   - lead_sources / material_categories ← 에잇티(조회된 id)
--   - material_catalog ← material_categories.company_id
--   - material_catalog_images ← material_catalog.company_id
--   - audit_logs ← profiles.active_company_id(+active membership)
--                 → 그래도 null이면 active membership 정확히 1개인 회사
--   - audit_logs에 임의 기본회사 fallback 없음
--
-- 속도 최적화:
--   - 기존 일반 인덱스 삭제·변경 없음
--   - 아래 복합/부분 인덱스만 추가
--
-- 안전:
--   - 기존 데이터 삭제·초기화 없음 (DROP TABLE / DELETE / TRUNCATE 없음)
--   - 기존 RLS 정책 변경 없음
--   - NOT NULL 적용 없음
--   - company_id IS NULL 인 행만 UPDATE (기존 company_id 덮어쓰기 없음)
--   - 다른 컬럼 변경 없음
--   - 임의 회사 UUID 직접 주입 없음
--   - 전역 UNIQUE(name/code) 외 다른 제약 삭제 금지
--
-- 재실행: add column if not exists / FK·index·UNIQUE 존재 확인 /
--         company_id IS NULL 일 때만 UPDATE / default 재설정
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) company_id 컬럼 추가 (default 없이, nullable)
-- ---------------------------------------------------------------------------
alter table public.lead_sources
  add column if not exists company_id uuid;

alter table public.material_categories
  add column if not exists company_id uuid;

alter table public.audit_logs
  add column if not exists company_id uuid;

alter table public.material_catalog
  add column if not exists company_id uuid;

alter table public.material_catalog_images
  add column if not exists company_id uuid;

-- ---------------------------------------------------------------------------
-- 2) FK 추가 (on delete restrict, 재실행 안전)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'lead_sources'
      and c.conname = 'lead_sources_company_id_fkey'
  ) then
    alter table public.lead_sources
      add constraint lead_sources_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'material_categories'
      and c.conname = 'material_categories_company_id_fkey'
  ) then
    alter table public.material_categories
      add constraint material_categories_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'audit_logs'
      and c.conname = 'audit_logs_company_id_fkey'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'material_catalog'
      and c.conname = 'material_catalog_company_id_fkey'
  ) then
    alter table public.material_catalog
      add constraint material_catalog_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'material_catalog_images'
      and c.conname = 'material_catalog_images_company_id_fkey'
  ) then
    alter table public.material_catalog_images
      add constraint material_catalog_images_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) 조회용 인덱스 (기존 인덱스 유지, 지정분만 추가)
-- ---------------------------------------------------------------------------
create index if not exists lead_sources_company_active_sort_idx
  on public.lead_sources (company_id, is_active, sort_order, name);

create index if not exists material_categories_company_active_sort_idx
  on public.material_categories (company_id, is_active, sort_order, name)
  where deleted_at is null;

create index if not exists audit_logs_company_created_idx
  on public.audit_logs (company_id, created_at desc);

create index if not exists material_catalog_company_created_idx
  on public.material_catalog (company_id, created_at desc)
  where deleted_at is null;

create index if not exists material_catalog_images_company_material_sort_idx
  on public.material_catalog_images (company_id, material_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4~5) 기본 회사 확인 → backfill → 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_company_count integer;
  v_company_id uuid;
  v_null_lead_sources integer;
  v_null_material_categories integer;
  v_null_audit_logs integer;
  v_null_material_catalog integer;
  v_null_material_catalog_images integer;
  v_catalog_category_mismatch integer;
  v_image_catalog_mismatch integer;
  v_audit_actor_mismatch integer;
  v_lead_name_dup integer;
  v_category_name_dup integer;
  v_category_code_dup integer;
begin
  select count(*)::integer
  into v_company_count
  from public.companies c
  where c.business_number_normalized = '5328102974'
    and c.status = 'active';

  if v_company_count <> 1 then
    raise exception
      '주식회사 에잇티(5328102974, active) 회사 수가 %건입니다. 정확히 1건이어야 합니다.',
      v_company_count;
  end if;

  select c.id
  into v_company_id
  from public.companies c
  where c.business_number_normalized = '5328102974'
    and c.status = 'active';

  if v_company_id is null then
    raise exception
      '주식회사 에잇티(5328102974, active) company id를 확인할 수 없습니다.';
  end if;

  update public.lead_sources ls
  set company_id = v_company_id
  where ls.company_id is null;

  update public.material_categories mc
  set company_id = v_company_id
  where mc.company_id is null;

  update public.material_catalog cat
  set company_id = mc.company_id
  from public.material_categories mc
  where cat.category_id = mc.id
    and cat.company_id is null
    and mc.company_id is not null;

  update public.material_catalog_images img
  set company_id = cat.company_id
  from public.material_catalog cat
  where img.material_id = cat.id
    and img.company_id is null
    and cat.company_id is not null;

  -- audit_logs 1차: profiles.active_company_id + active membership + active 회사
  update public.audit_logs al
  set company_id = p.active_company_id
  from public.profiles p
  join public.company_memberships m
    on m.user_id = p.id
   and m.company_id = p.active_company_id
   and m.status = 'active'
  join public.companies c
    on c.id = p.active_company_id
   and c.status = 'active'
  where al.actor_id = p.id
    and al.company_id is null
    and p.active_company_id is not null;

  -- audit_logs 2차: active membership이 정확히 1개인 작성자
  update public.audit_logs al
  set company_id = sole.company_id
  from (
    select
      m.user_id,
      (min(m.company_id::text))::uuid as company_id
    from public.company_memberships m
    join public.companies c
      on c.id = m.company_id
     and c.status = 'active'
    where m.status = 'active'
    group by m.user_id
    having count(*) = 1
  ) sole
  where al.actor_id = sole.user_id
    and al.company_id is null;

  select count(*)::integer
  into v_null_lead_sources
  from public.lead_sources ls
  where ls.company_id is null;

  select count(*)::integer
  into v_null_material_categories
  from public.material_categories mc
  where mc.company_id is null;

  select count(*)::integer
  into v_null_audit_logs
  from public.audit_logs al
  where al.company_id is null;

  select count(*)::integer
  into v_null_material_catalog
  from public.material_catalog cat
  where cat.company_id is null;

  select count(*)::integer
  into v_null_material_catalog_images
  from public.material_catalog_images img
  where img.company_id is null;

  if v_null_lead_sources <> 0
     or v_null_material_categories <> 0
     or v_null_audit_logs <> 0
     or v_null_material_catalog <> 0
     or v_null_material_catalog_images <> 0 then
    raise exception
      'company_id backfill 실패: lead_sources null=%, material_categories null=%, audit_logs null=%, material_catalog null=%, material_catalog_images null=%',
      v_null_lead_sources,
      v_null_material_categories,
      v_null_audit_logs,
      v_null_material_catalog,
      v_null_material_catalog_images;
  end if;

  select count(*)::integer
  into v_catalog_category_mismatch
  from public.material_catalog cat
  join public.material_categories mc on mc.id = cat.category_id
  where cat.company_id is distinct from mc.company_id;

  select count(*)::integer
  into v_image_catalog_mismatch
  from public.material_catalog_images img
  join public.material_catalog cat on cat.id = img.material_id
  where img.company_id is distinct from cat.company_id;

  if v_catalog_category_mismatch <> 0
     or v_image_catalog_mismatch <> 0 then
    raise exception
      '부모 company_id 불일치: material_catalog/categories=%, material_catalog_images/catalog=%',
      v_catalog_category_mismatch,
      v_image_catalog_mismatch;
  end if;

  select count(*)::integer
  into v_audit_actor_mismatch
  from public.audit_logs al
  join lateral (
    select
      case
        when exists (
          select 1
          from public.company_memberships m
          join public.companies c
            on c.id = p.active_company_id
           and c.status = 'active'
          where m.user_id = p.id
            and m.company_id = p.active_company_id
            and m.status = 'active'
        ) then p.active_company_id
        when (
          select count(*)::integer
          from public.company_memberships m
          join public.companies c
            on c.id = m.company_id
           and c.status = 'active'
          where m.user_id = p.id
            and m.status = 'active'
        ) = 1 then (
          select m.company_id
          from public.company_memberships m
          join public.companies c
            on c.id = m.company_id
           and c.status = 'active'
          where m.user_id = p.id
            and m.status = 'active'
        )
        else null
      end as valid_company_id
    from public.profiles p
    where p.id = al.actor_id
  ) actor_company on true
  where actor_company.valid_company_id is not null
    and al.company_id is distinct from actor_company.valid_company_id;

  if v_audit_actor_mismatch <> 0 then
    raise exception
      'audit_logs/작성자 유효 active 회사 불일치: %',
      v_audit_actor_mismatch;
  end if;

  select count(*)::integer
  into v_lead_name_dup
  from (
    select ls.company_id, ls.name
    from public.lead_sources ls
    group by ls.company_id, ls.name
    having count(*) > 1
  ) d;

  select count(*)::integer
  into v_category_name_dup
  from (
    select mc.company_id, mc.name
    from public.material_categories mc
    group by mc.company_id, mc.name
    having count(*) > 1
  ) d;

  select count(*)::integer
  into v_category_code_dup
  from (
    select mc.company_id, mc.code
    from public.material_categories mc
    where mc.code is not null
    group by mc.company_id, mc.code
    having count(*) > 1
  ) d;

  if v_lead_name_dup <> 0
     or v_category_name_dup <> 0
     or v_category_code_dup <> 0 then
    raise exception
      '회사별 중복 값 존재: lead_sources name=%, material_categories name=%, material_categories code=%',
      v_lead_name_dup,
      v_category_name_dup,
      v_category_code_dup;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) 전역 UNIQUE → 회사별 UNIQUE 전환
--     (단일 컬럼 UNIQUE(name/code)만 제거, 그 외 제약 유지)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
     and not a.attisdropped
    where n.nspname = 'public'
      and t.relname = 'lead_sources'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'name'
  loop
    execute format(
      'alter table public.lead_sources drop constraint %I',
      r.conname
    );
  end loop;

  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
     and not a.attisdropped
    where n.nspname = 'public'
      and t.relname = 'material_categories'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'code'
  loop
    execute format(
      'alter table public.material_categories drop constraint %I',
      r.conname
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'lead_sources'
      and c.conname = 'lead_sources_company_name_key'
  ) then
    alter table public.lead_sources
      add constraint lead_sources_company_name_key
      unique (company_id, name);
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'material_categories'
      and c.conname = 'material_categories_company_name_key'
  ) then
    alter table public.material_categories
      add constraint material_categories_company_name_key
      unique (company_id, name);
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'material_categories'
      and c.conname = 'material_categories_company_code_key'
  ) then
    alter table public.material_categories
      add constraint material_categories_company_code_key
      unique (company_id, code);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) 신규 행 기본값: current_company_id() (nullable 유지)
-- ---------------------------------------------------------------------------
alter table public.lead_sources
  alter column company_id
  set default public.current_company_id();

alter table public.material_categories
  alter column company_id
  set default public.current_company_id();

alter table public.audit_logs
  alter column company_id
  set default public.current_company_id();

alter table public.material_catalog
  alter column company_id
  set default public.current_company_id();

alter table public.material_catalog_images
  alter column company_id
  set default public.current_company_id();

notify pgrst, 'reload schema';

commit;
