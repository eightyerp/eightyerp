-- Reload PostgREST schema cache after CRM tables were created.
-- Run this in Supabase SQL Editor if API returns PGRST205.

notify pgrst, 'reload schema';

-- Ensure API roles can see public tables (RLS still applies).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.lead_sources to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.inquiry_messages to authenticated;

grant select on public.teams to anon;
grant select on public.employees to anon;
grant select on public.lead_sources to anon;
grant select on public.customers to anon;
grant select on public.inquiry_messages to anon;
