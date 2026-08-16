import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20260816012630_window_inspection_workflow_hub.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("../supabase/rollback/20260816012630_window_inspection_workflow_hub_down.sql", import.meta.url), "utf8");
const db = new PGlite();
const ids = {
  companyA: "10000000-0000-4000-8000-000000000001",
  companyB: "10000000-0000-4000-8000-000000000002",
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002",
  employeeA: "30000000-0000-4000-8000-000000000001",
  employeeB: "30000000-0000-4000-8000-000000000002",
  customerA: "40000000-0000-4000-8000-000000000001",
  customerB: "40000000-0000-4000-8000-000000000002",
  projectA: "50000000-0000-4000-8000-000000000001",
  projectA2: "50000000-0000-4000-8000-000000000003",
  projectB: "50000000-0000-4000-8000-000000000002",
  inspection: "60000000-0000-4000-8000-000000000001",
};

await db.exec(`
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.companies(id uuid primary key, status text not null default 'active');
  create table public.employees(id uuid primary key);
  create table public.profiles(id uuid primary key references auth.users(id), employee_id uuid, active_company_id uuid, is_active boolean, is_approved boolean, approval_status text);
  create table public.company_memberships(id uuid primary key, company_id uuid, user_id uuid, employee_id uuid, role text, status text);
  create table public.customers(id uuid primary key, company_id uuid not null, deleted_at timestamptz, unique(id, company_id));
  create table public.projects(id uuid primary key, customer_id uuid not null, company_id uuid not null, deleted_at timestamptz, unique(id, customer_id, company_id));
  create table public.customer_consult_logs(id uuid primary key, customer_id uuid not null, company_id uuid, consult_content text not null default '');
  create table public.quotes(id uuid primary key, customer_id uuid not null, project_id uuid, company_id uuid);
  create function public.current_company_id() returns uuid language sql stable security definer set search_path=public as $$
    select p.active_company_id from profiles p join company_memberships m on m.user_id=p.id and m.company_id=p.active_company_id
    where p.id=auth.uid() and p.is_active and p.is_approved and p.approval_status='approved' and m.status='active' limit 1
  $$;
  grant usage on schema public, auth to authenticated;
  grant select on public.profiles, public.company_memberships, public.customers, public.projects to authenticated;
  grant execute on function public.current_company_id(), auth.uid() to authenticated;
`);
await db.exec(migration);
await db.exec(`
  insert into auth.users values ('${ids.userA}'),('${ids.userB}');
  insert into companies(id) values ('${ids.companyA}'),('${ids.companyB}');
  insert into employees values ('${ids.employeeA}'),('${ids.employeeB}');
  insert into profiles values
    ('${ids.userA}','${ids.employeeA}','${ids.companyA}',true,true,'approved'),
    ('${ids.userB}','${ids.employeeB}','${ids.companyB}',true,true,'approved');
  insert into company_memberships values
    ('70000000-0000-4000-8000-000000000001','${ids.companyA}','${ids.userA}','${ids.employeeA}','employee','active'),
    ('70000000-0000-4000-8000-000000000002','${ids.companyB}','${ids.userB}','${ids.employeeB}','employee','active');
  insert into customers values ('${ids.customerA}','${ids.companyA}',null),('${ids.customerB}','${ids.companyB}',null);
  insert into projects values
    ('${ids.projectA}','${ids.customerA}','${ids.companyA}',null),
    ('${ids.projectA2}','${ids.customerA}','${ids.companyA}',null),
    ('${ids.projectB}','${ids.customerB}','${ids.companyB}',null);
  set role authenticated;
  set request.jwt.claim.sub='${ids.userA}';
`);

async function rejects(sql, label) {
  try { await db.exec(sql); throw new Error(`${label}: unexpectedly allowed`); }
  catch (error) { if (String(error.message).includes("unexpectedly allowed")) throw error; }
}
const insert = (overrides = {}) => ({
  id: ids.inspection, company: ids.companyA, customer: ids.customerA, project: ids.projectA,
  user: ids.userA, employee: ids.employeeA, request: ids.inspection, ...overrides,
});
const sqlInsert = (x) => `insert into window_inspections(id,company_id,customer_id,project_id,performed_by_user_id,performed_by_employee_id,client_request_id) values ('${x.id}','${x.company}','${x.customer}','${x.project}','${x.user}','${x.employee}','${x.request}')`;

await db.exec(sqlInsert(insert()));
await rejects(sqlInsert(insert({ id:"60000000-0000-4000-8000-000000000002", company:ids.companyB, customer:ids.customerB, project:ids.projectB, request:"60000000-0000-4000-8000-000000000002" })), "other company");
await rejects(sqlInsert(insert({ id:"60000000-0000-4000-8000-000000000003", project:ids.projectB, request:"60000000-0000-4000-8000-000000000003" })), "customer/project mismatch");
await rejects(sqlInsert(insert({ id:"60000000-0000-4000-8000-000000000004", request:ids.inspection })), "duplicate client request");

await db.exec(`reset role; update profiles set is_active=false where id='${ids.userA}'; set role authenticated; set request.jwt.claim.sub='${ids.userA}';`);
await rejects(sqlInsert(insert({ id:"60000000-0000-4000-8000-000000000005", request:"60000000-0000-4000-8000-000000000005" })), "inactive profile");
await db.exec(`reset role; update profiles set is_active=true,is_approved=false,approval_status='pending' where id='${ids.userA}'; set role authenticated; set request.jwt.claim.sub='${ids.userA}';`);
await rejects(sqlInsert(insert({ id:"60000000-0000-4000-8000-000000000006", request:"60000000-0000-4000-8000-000000000006" })), "unapproved profile");
await db.exec(`reset role; update profiles set is_approved=true,approval_status='approved' where id='${ids.userA}'; set role authenticated; set request.jwt.claim.sub='${ids.userA}'; update window_inspections set total_windows=2 where id='${ids.inspection}';`);
await db.exec(`reset role; update profiles set active_company_id='${ids.companyA}' where id='${ids.userB}'; insert into company_memberships values ('70000000-0000-4000-8000-000000000003','${ids.companyA}','${ids.userB}','${ids.employeeB}','employee','active'); set role authenticated; set request.jwt.claim.sub='${ids.userB}';`);
const forbiddenUpdate = await db.query(`update window_inspections set total_windows=9 where id='${ids.inspection}' returning id`);
if (forbiddenUpdate.rows.length !== 0) throw new Error("other employee update: unexpectedly allowed");

await db.exec(`reset role; insert into customer_consult_logs values ('80000000-0000-4000-8000-000000000001','${ids.customerA}','${ids.companyA}','ok','${ids.projectA}','${ids.inspection}'); insert into quotes values ('90000000-0000-4000-8000-000000000001','${ids.customerA}','${ids.projectA}','${ids.companyA}','80000000-0000-4000-8000-000000000001','${ids.inspection}');`);
await rejects(`reset role; insert into quotes values ('90000000-0000-4000-8000-000000000002','${ids.customerA}','${ids.projectA}','${ids.companyA}',null,'60000000-0000-4000-8000-000000000099')`, "inspection FK");
await db.exec(rollback);
const legacy = await db.query(`select count(*)::int as count from quotes`);
if (legacy.rows[0].count !== 1) throw new Error("legacy quote regression after rollback");
console.log("Window workflow isolated migration/RLS/rollback PASS");
