-- 에잇티 창호체크 개발 프로젝트 전용 Storage / Queue migration
-- 적용 대상: 별도 Supabase 프로젝트(eighty-window-check-dev)
-- 적용 금지: 운영 ERP 프로젝트(eighty-erp)

begin;

create extension if not exists pgmq;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'window-inspection-private',
  'window-inspection-private',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if to_regclass('pgmq.q_window_ai_analysis') is null then
    perform pgmq.create('window_ai_analysis');
  end if;
end;
$$;

drop policy if exists window_storage_select_company on storage.objects;
create policy window_storage_select_company
on storage.objects
for select to authenticated
using (
  bucket_id = 'window-inspection-private'
  and exists (
    select 1
    from public.window_staff_memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists window_storage_insert_company on storage.objects;
create policy window_storage_insert_company
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'window-inspection-private'
  and exists (
    select 1
    from public.window_staff_memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists window_storage_update_company on storage.objects;
create policy window_storage_update_company
on storage.objects
for update to authenticated
using (
  bucket_id = 'window-inspection-private'
  and exists (
    select 1
    from public.window_staff_memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.company_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'window-inspection-private'
  and exists (
    select 1
    from public.window_staff_memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists window_storage_delete_admin on storage.objects;
create policy window_storage_delete_admin
on storage.objects
for delete to authenticated
using (
  bucket_id = 'window-inspection-private'
  and exists (
    select 1
    from public.window_staff_memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role in ('owner', 'director', 'admin', 'manager')
      and m.company_id::text = (storage.foldername(name))[1]
  )
);

create or replace function public.window_enqueue_analysis_message(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_job public.window_analysis_jobs%rowtype;
  v_message_id bigint;
begin
  select *
    into v_job
  from public.window_analysis_jobs
  where id = p_job_id;

  if not found then
    raise exception 'analysis_job_not_found';
  end if;

  if not public.window_can_access_inspection(v_job.inspection_id) then
    raise exception 'forbidden';
  end if;

  select pgmq.send(
    queue_name => 'window_ai_analysis',
    msg => jsonb_build_object(
      'job_id', v_job.id,
      'inspection_id', v_job.inspection_id,
      'location_id', v_job.location_id,
      'company_id', v_job.company_id,
      'requested_by', v_job.requested_by,
      'prompt_version', v_job.prompt_version,
      'schema_version', v_job.schema_version,
      'model_name', v_job.model_name,
      'queued_at', v_job.queued_at
    )
  ) into v_message_id;

  update public.window_analysis_jobs
  set status = 'queued', updated_at = now()
  where id = p_job_id;

  insert into public.window_audit_logs (
    company_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata_without_personal_data
  ) values (
    v_job.company_id,
    auth.uid(),
    'analysis_enqueued',
    'window_analysis_job',
    v_job.id::text,
    jsonb_build_object('queue_message_id', v_message_id)
  );

  return v_message_id;
end;
$$;

revoke all on function public.window_enqueue_analysis_message(uuid) from public;
grant execute on function public.window_enqueue_analysis_message(uuid) to authenticated;

commit;
