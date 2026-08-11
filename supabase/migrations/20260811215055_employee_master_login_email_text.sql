-- Supabase auth.users.email is varchar, while the Employee Master RPC exposes
-- login_email as text. Cast explicitly so PL/pgSQL's TABLE return contract is
-- identical on local fixtures and hosted Supabase.

begin;

create or replace function public.list_employee_master()
returns table (
  employee_id uuid, company_id uuid, team_id uuid, employee_name text,
  employee_title text, employee_phone text, employee_email text,
  business_card_path text, show_business_card_on_quote boolean,
  employee_is_active boolean, sort_order integer, employee_created_at timestamptz,
  employee_updated_at timestamptz, profile_id uuid, login_email text,
  login_linked boolean, login_active boolean, approval_status text,
  role text, permissions jsonb, last_sign_in_at timestamptz,
  customer_count bigint, quote_count bigint, schedule_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_company_role text := public.current_company_role();
begin
  if auth.uid() is null
     or v_company_id is null
     or v_company_role is null
     or v_company_role not in ('owner', 'director', 'admin') then
    raise exception '현재 회사의 owner·director·admin만 직원 Master를 조회할 수 있습니다.';
  end if;

  return query
  select employee_row.id,
         employee_row.company_id,
         employee_row.team_id,
         employee_row.name,
         employee_row.title,
         employee_row.phone,
         employee_row.email,
         employee_row.business_card_path,
         employee_row.show_business_card_on_quote,
         employee_row.is_active,
         employee_row.sort_order,
         employee_row.created_at,
         employee_row.updated_at,
         profile_row.id,
         coalesce(auth_user.email::text, profile_row.email),
         profile_row.id is not null,
         coalesce(profile_row.is_active, false),
         profile_row.approval_status,
         profile_row.role,
         coalesce(profile_row.permissions, '{}'::jsonb),
         auth_user.last_sign_in_at,
         (
           select count(*)
           from public.customers customer_row
           where customer_row.company_id = v_company_id
             and customer_row.assigned_employee_id = employee_row.id
             and customer_row.deleted_at is null
         ),
         (
           select count(*)
           from public.quotes quote_row
           where quote_row.company_id = v_company_id
             and quote_row.assigned_employee_id = employee_row.id
             and quote_row.deleted_at is null
         ),
         (
           (
             select count(*)
             from public.customer_schedules schedule_row
             where schedule_row.company_id = v_company_id
               and schedule_row.assigned_employee_id = employee_row.id
               and schedule_row.deleted_at is null
           )
           +
           (
             select count(*)
             from public.project_process_schedules process_row
             where process_row.company_id = v_company_id
               and process_row.assigned_employee_id = employee_row.id
               and process_row.deleted_at is null
           )
         )
  from public.employees employee_row
  left join public.profiles profile_row
    on profile_row.employee_id = employee_row.id
  left join auth.users auth_user
    on auth_user.id = profile_row.id
  where employee_row.company_id = v_company_id
  order by employee_row.sort_order, employee_row.name;
end;
$$;

revoke all on function public.list_employee_master()
  from public, anon, authenticated, service_role;
grant execute on function public.list_employee_master()
  to authenticated;

commit;
