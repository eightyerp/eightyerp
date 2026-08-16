import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log("PASS: " + message);
}

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

const forward = await readFile(
  new URL(
    "../supabase/migrations/20260816100000_quote_contract_retry_project_guard.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = await readFile(
  new URL(
    "../supabase/rollback/20260816100000_quote_contract_retry_project_guard_down.sql",
    import.meta.url,
  ),
  "utf8",
);

const functionSource = forward.slice(
  forward.indexOf(
    "create or replace function public.transition_quote_to_contract",
  ),
  forward.indexOf(
    "revoke all on function public.transition_quote_to_contract",
  ),
);
assert(
  functionSource.split("contract replay project mismatch").length - 1 === 2,
  "forward migration guards both replay return paths",
);

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  employee: "20000000-0000-4000-8000-000000000001",
  company: "30000000-0000-4000-8000-000000000001",
  customer: "40000000-0000-4000-8000-000000000001",
  projectA: "50000000-0000-4000-8000-000000000001",
  projectA2: "50000000-0000-4000-8000-000000000002",
  quote: "60000000-0000-4000-8000-000000000001",
  quoteItem: "70000000-0000-4000-8000-000000000001",
};

const db = new PGlite();
const schema = [
  "create role authenticated;",
  "create role anon;",
  "create schema auth;",
  "create sequence public.test_uuid_seq start 100000;",
  "create table public.quotes (",
  "  id uuid primary key, company_id uuid not null, customer_id uuid not null,",
  "  project_id uuid, status text, deleted_at timestamptz, assigned_employee_id uuid,",
  "  discount_amount bigint, lx_discount_amount bigint, customer_total_amount bigint,",
  "  supply_amount bigint, final_amount bigint, vat_amount bigint,",
  "  is_contract_quote boolean not null default false, updated_by uuid,",
  "  updated_at timestamptz not null default now()",
  ");",
  "create table public.customers (",
  "  id uuid primary key, company_id uuid not null, deleted_at timestamptz,",
  "  name text, address text, assigned_employee_id uuid",
  ");",
  "create table public.projects (",
  "  id uuid primary key default (('00000000-0000-4000-8000-' || lpad(nextval('public.test_uuid_seq')::text, 12, '0'))::uuid),",
  "  customer_id uuid not null, name text, address text, status text,",
  "  assigned_employee_id uuid, company_id uuid not null, created_by uuid, updated_by uuid,",
  "  deleted_at timestamptz",
  ");",
  "create table public.employees (",
  "  id uuid primary key, company_id uuid, is_active boolean not null default true",
  ");",
  "create table public.contracts (",
  "  id uuid primary key default (('00000000-0000-4000-8000-' || lpad(nextval('public.test_uuid_seq')::text, 12, '0'))::uuid),",
  "  company_id uuid, customer_id uuid, quote_id uuid unique, project_id uuid,",
  "  contract_number text, contract_date date, status text, supply_amount bigint,",
  "  vat_amount bigint, discount_amount bigint, contract_amount bigint,",
  "  assigned_employee_id uuid, created_by uuid, updated_by uuid",
  ");",
  "create table public.execution_budgets (",
  "  id uuid primary key default (('00000000-0000-4000-8000-' || lpad(nextval('public.test_uuid_seq')::text, 12, '0'))::uuid),",
  "  company_id uuid, contract_id uuid unique, project_id uuid, customer_id uuid,",
  "  status text, estimated_total_cost bigint, created_by uuid, updated_by uuid,",
  "  updated_at timestamptz not null default now()",
  ");",
  "create table public.quote_items (",
  "  id uuid primary key, quote_id uuid not null, trade_name text, item_name text,",
  "  description text, quantity numeric, unit text, cost_type text, deleted_at timestamptz,",
  "  sort_order integer, created_at timestamptz not null default now(), remark text",
  ");",
  "create table public.execution_budget_items (",
  "  id uuid primary key default (('00000000-0000-4000-8000-' || lpad(nextval('public.test_uuid_seq')::text, 12, '0'))::uuid),",
  "  company_id uuid, execution_budget_id uuid, source_quote_item_id uuid,",
  "  trade_name text, item_name text, description text, quantity numeric, unit text,",
  "  cost_category text, unit_cost bigint, amount bigint, supplier_name text,",
  "  payment_due_date date, sort_order integer, memo text",
  ");",
  "create function auth.uid() returns uuid language sql stable as $$",
  "  select '" + ids.user + "'::uuid",
  "$$;",
  "create function public.is_erp_user() returns boolean language sql stable as $$",
  "  select true",
  "$$;",
  "create function public.current_company_id() returns uuid language sql stable as $$",
  "  select '" + ids.company + "'::uuid",
  "$$;",
  "create function public.current_employee_id() returns uuid language sql stable as $$",
  "  select '" + ids.employee + "'::uuid",
  "$$;",
  "create function public.can_access_customer(uuid) returns boolean language sql stable as $$",
  "  select true",
  "$$;",
  "create function public.map_quote_cost_type_to_budget_category(text) returns text language sql immutable as $$",
  "  select coalesce($1, '기타')",
  "$$;",
].join("\n");

await db.exec(schema);
await db.exec(forward);
await db.exec(
  [
    "insert into public.employees(id, company_id) values ('" + ids.employee + "', '" + ids.company + "');",
    "insert into public.customers(id, company_id, name, address, assigned_employee_id)",
    "values ('" + ids.customer + "', '" + ids.company + "', '테스트 고객', '테스트 주소', '" + ids.employee + "');",
    "insert into public.projects(id, customer_id, name, company_id, assigned_employee_id)",
    "values",
    "('" + ids.projectA + "', '" + ids.customer + "', '현장 A', '" + ids.company + "', '" + ids.employee + "'),",
    "('" + ids.projectA2 + "', '" + ids.customer + "', '현장 A2', '" + ids.company + "', '" + ids.employee + "');",
    "insert into public.quotes(",
    "id, company_id, customer_id, project_id, status, assigned_employee_id,",
    "discount_amount, lx_discount_amount, customer_total_amount, supply_amount,",
    "final_amount, vat_amount",
    ") values (",
    "'" + ids.quote + "', '" + ids.company + "', '" + ids.customer + "', '" + ids.projectA + "',",
    "'발송완료', '" + ids.employee + "', 0, 0, 110000, 100000, 110000, 10000",
    ");",
    "insert into public.quote_items(",
    "id, quote_id, trade_name, item_name, quantity, unit, cost_type, sort_order",
    ") values (",
    "'" + ids.quoteItem + "', '" + ids.quote + "', '창호', '테스트 항목', 1, '식', '기타', 0",
    ");",
    "set role authenticated;",
  ].join("\n"),
);

function transitionSql(projectId, mode = "link") {
  const project = projectId ? "'" + projectId + "'::uuid" : "null";
  return (
    "select public.transition_quote_to_contract(" +
    "'" + ids.quote + "'::uuid, " +
    "'" + mode + "'::text, " +
    project +
    ", null, null, '" + ids.employee + "'::uuid, current_date, null" +
    ") as result"
  );
}

const first = asJson((await db.query(transitionSql(ids.projectA))).rows[0].result);
assert(first.already_converted === false, "first transition creates one contract");
assert(first.project_id === ids.projectA, "first transition preserves project A");

const exact = asJson((await db.query(transitionSql(ids.projectA))).rows[0].result);
assert(exact.already_converted === true, "exact project replay is idempotent");
assert(exact.contract_id === first.contract_id, "exact replay returns original contract");

const createReplay = asJson(
  (await db.query(transitionSql(null, "create"))).rows[0].result,
);
assert(
  createReplay.already_converted === true &&
    createReplay.contract_id === first.contract_id,
  "create-mode null replay remains backward-compatible",
);

async function expectCheckViolation(sql, label) {
  let caught = null;
  try {
    await db.query(sql);
  } catch (error) {
    caught = error;
  }
  assert(caught !== null, label + " is rejected");
  assert(
    caught.code === "23514" ||
      String(caught.message).includes("contract replay project mismatch"),
    label + " uses SQLSTATE 23514",
  );
}

await expectCheckViolation(
  transitionSql(ids.projectA2),
  "same-customer alternate project replay",
);
await expectCheckViolation(
  transitionSql(null),
  "link replay without a project",
);

const integrityRows = (
  await db.query(
    "select project_id::text as project_id " +
      "from public.contracts where quote_id = '" + ids.quote + "'::uuid",
  )
).rows;
assert(
  integrityRows.length === 1 &&
    integrityRows[0].project_id === ids.projectA,
  "rejected replay leaves one unchanged project chain",
);

await db.exec("reset role;");
const installed = (
  await db.query(
    "select pg_get_functiondef(" +
      "'public.transition_quote_to_contract(uuid, text, uuid, text, text, uuid, date, text)'::regprocedure" +
      ") as source",
  )
).rows[0].source;
assert(
  installed.split("contract replay project mismatch").length - 1 === 2,
  "installed RPC contains both replay guards",
);

await db.exec(rollback);
const restored = (
  await db.query(
    "select pg_get_functiondef(" +
      "'public.transition_quote_to_contract(uuid, text, uuid, text, text, uuid, date, text)'::regprocedure" +
      ") as source",
  )
).rows[0].source;
assert(
  !restored.includes("contract replay project mismatch") &&
    restored.includes("발송완료 상태의 견적만 전환할 수 있습니다."),
  "emergency rollback restores migration 39 definition",
);

await db.close();
console.log("Contract transition replay integrity checks passed.");
