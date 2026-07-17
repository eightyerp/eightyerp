-- Eighty ERP: 견적서 삭제 권한을 모든 로그인 직원에게 확대
-- 고객정보 삭제 / 자재 선택자료 삭제 RLS는 변경하지 않음 (관리자 전용 유지)

-- ---------------------------------------------------------------------------
-- 1) 삭제 사유 컬럼 (audit_logs와 병행 저장)
-- ---------------------------------------------------------------------------
alter table public.customer_quotes
  add column if not exists delete_reason text;

comment on column public.customer_quotes.delete_reason is
  '견적서 삭제 사유 (로그인 직원 삭제). 고객/자재 삭제 권한과 무관.';

-- ---------------------------------------------------------------------------
-- 2) customer_quotes DELETE — authenticated 전원
--    (soft-delete는 UPDATE 정책을 사용하며, hard DELETE도 동일하게 허용)
--    고객(customers) / 자재(project_materials) DELETE 정책은 건드리지 않음.
-- ---------------------------------------------------------------------------
drop policy if exists "customer_quotes_delete" on public.customer_quotes;
create policy "customer_quotes_delete" on public.customer_quotes
  for delete to authenticated
  using (auth.uid() is not null);

-- soft-delete(UPDATE) 는 기존 update 정책(담당 접근)으로 가능.
-- 접근 가능 범위 밖 soft-delete 방지 보강: update는 기존 정책 유지.

-- ---------------------------------------------------------------------------
-- 3) Storage: customer-quotes 파일 삭제 — 로그인 직원(담당 접근 또는 관리자)
--    견적서 파일만 대상. material-images / customer-change-requests 정책 미변경.
-- ---------------------------------------------------------------------------
drop policy if exists "customer_quotes_storage_delete" on storage.objects;
create policy "customer_quotes_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-quotes'
    and auth.uid() is not null
    and (
      public.is_admin()
      or (
        public.storage_customer_id(name) is not null
        and public.can_access_customer(public.storage_customer_id(name))
      )
    )
  );

-- storage update도 동일 직원 범위로 맞춤 (삭제 전 메타 정리 등)
drop policy if exists "customer_quotes_storage_update" on storage.objects;
create policy "customer_quotes_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'customer-quotes'
    and auth.uid() is not null
    and (
      public.is_admin()
      or (
        public.storage_customer_id(name) is not null
        and public.can_access_customer(public.storage_customer_id(name))
      )
    )
  )
  with check (
    bucket_id = 'customer-quotes'
    and auth.uid() is not null
    and (
      public.is_admin()
      or (
        public.storage_customer_id(name) is not null
        and public.can_access_customer(public.storage_customer_id(name))
      )
    )
  );

notify pgrst, 'reload schema';
