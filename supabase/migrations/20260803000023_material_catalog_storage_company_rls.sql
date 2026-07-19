-- =============================================================================
-- Eighty ERP — 자재 카탈로그 Storage 회사별 RLS
-- 파일: 20260803000023_material_catalog_storage_company_rls.sql
--
-- 경로 규칙:
--   material-catalog/{material_catalog.id}/{파일명}
--
-- 범위:
--   - object 경로에서 material_catalog.id를 안전하게 추출
--   - material_catalog.company_id = current_company_id() 확인
--   - 기존 Storage 정책의 로그인 조건과 권한 종류 유지
--
-- 안전:
--   - 기존 파일·업무 데이터 변경 및 삭제 없음
--   - 버킷 비공개 상태 유지
--   - 현재 회사 자재 이미지만 조회·추가·수정·삭제 가능
--
-- 성능:
--   - material_catalog 기본키 조회 사용
--   - current_company_id() 기반 회사 비교
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Storage object 경로의 첫 폴더에서 자재 UUID 추출
-- 잘못된 경로는 오류 대신 null 반환
-- ---------------------------------------------------------------------------
create or replace function
  public.material_catalog_storage_path_material_id(
    p_object_name text
  )
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

revoke all
on function public.material_catalog_storage_path_material_id(text)
from public, anon;

grant execute
on function public.material_catalog_storage_path_material_id(text)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) 자재가 현재 회사 소속인지 확인
-- SECURITY DEFINER이므로 RLS 우회 대신 회사 조건을 내부에 명시
-- ---------------------------------------------------------------------------
create or replace function
  public.can_access_material_catalog(
    p_material_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and p_material_id is not null
    and public.is_erp_user()
    and exists (
      select 1
      from public.material_catalog m
      where m.id = p_material_id
        and m.company_id = public.current_company_id()
        and m.deleted_at is null
    ),
    false
  );
$$;

revoke all
on function public.can_access_material_catalog(uuid)
from public, anon;

grant execute
on function public.can_access_material_catalog(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) 기존 Storage 정책에 회사 소속 조건 추가
-- ---------------------------------------------------------------------------
alter policy staff_material_catalog_storage_select
on storage.objects
using (
  bucket_id = 'material-catalog'
  and auth.uid() is not null
  and public.can_access_material_catalog(
    public.material_catalog_storage_path_material_id(name)
  )
);

alter policy staff_material_catalog_storage_insert
on storage.objects
with check (
  bucket_id = 'material-catalog'
  and auth.uid() is not null
  and public.can_access_material_catalog(
    public.material_catalog_storage_path_material_id(name)
  )
);

alter policy staff_material_catalog_storage_update
on storage.objects
using (
  bucket_id = 'material-catalog'
  and auth.uid() is not null
  and public.can_access_material_catalog(
    public.material_catalog_storage_path_material_id(name)
  )
)
with check (
  bucket_id = 'material-catalog'
  and auth.uid() is not null
  and public.can_access_material_catalog(
    public.material_catalog_storage_path_material_id(name)
  )
);

alter policy staff_material_catalog_storage_delete
on storage.objects
using (
  bucket_id = 'material-catalog'
  and auth.uid() is not null
  and public.can_access_material_catalog(
    public.material_catalog_storage_path_material_id(name)
  )
);

-- ---------------------------------------------------------------------------
-- 4) 적용 검증
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad_policy integer;
begin
  if not exists (
    select 1
    from storage.buckets b
    where b.id = 'material-catalog'
      and b.public = false
  ) then
    raise exception
      'material-catalog 버킷이 없거나 public 상태입니다.';
  end if;

  select count(*)::integer
  into v_bad_policy
  from (
    values
      ('staff_material_catalog_storage_select', 'SELECT'),
      ('staff_material_catalog_storage_insert', 'INSERT'),
      ('staff_material_catalog_storage_update', 'UPDATE'),
      ('staff_material_catalog_storage_delete', 'DELETE')
  ) as expected(policy_name, command_name)
  left join pg_policies p
    on p.schemaname = 'storage'
   and p.tablename = 'objects'
   and p.policyname = expected.policy_name
  where p.policyname is null
     or p.cmd <> expected.command_name
     or not ('authenticated' = any(p.roles))
     or (
       expected.command_name in ('SELECT', 'DELETE')
       and coalesce(p.qual, '')
         not ilike '%can_access_material_catalog%'
     )
     or (
       expected.command_name = 'INSERT'
       and coalesce(p.with_check, '')
         not ilike '%can_access_material_catalog%'
     )
     or (
       expected.command_name = 'UPDATE'
       and (
         coalesce(p.qual, '')
           not ilike '%can_access_material_catalog%'
         or coalesce(p.with_check, '')
           not ilike '%can_access_material_catalog%'
       )
     );

  if v_bad_policy <> 0 then
    raise exception
      '자재 Storage 회사 정책 적용 실패: 잘못된 정책 수=%',
      v_bad_policy;
  end if;

  if has_function_privilege(
    'anon',
    'public.material_catalog_storage_path_material_id(text)',
    'EXECUTE'
  ) then
    raise exception '익명 사용자의 경로 함수 실행 권한이 남아 있습니다.';
  end if;

  if has_function_privilege(
    'anon',
    'public.can_access_material_catalog(uuid)',
    'EXECUTE'
  ) then
    raise exception '익명 사용자의 자재 접근 함수 권한이 남아 있습니다.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.material_catalog_storage_path_material_id(text)',
    'EXECUTE'
  ) then
    raise exception '로그인 사용자의 경로 함수 실행 권한이 없습니다.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.can_access_material_catalog(uuid)',
    'EXECUTE'
  ) then
    raise exception '로그인 사용자의 자재 접근 함수 권한이 없습니다.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;