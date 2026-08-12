import { getExpenseAccess } from "@/lib/crm/expenses";
import { createClient } from "@/lib/supabase-server";
import type {
  ExpenseProjectFinanceState,
  ExpenseProjectOption,
} from "@/lib/crm/expense-shared";

const PROJECT_SELECT = `
  id, name, address, customer_id, assigned_employee_id, created_at,
  customers:customers!projects_customer_id_fkey!inner (
    id, name, phone, assigned_employee_id
  )
`;

type ProjectRow = ExpenseProjectOption & { created_at?: string };

async function withFinanceState(
  rows: ProjectRow[],
): Promise<ExpenseProjectOption[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const ids = rows.map((row) => row.id);
  const { data: financeStates, error } = await supabase
    .from("project_finance_states")
    .select("project_id, settlement_status, settled_at")
    .in("project_id", ids);

  if (error) {
    return rows.map((row) => ({ ...row, finance_state: null }));
  }

  const byProject = new Map<string, ExpenseProjectFinanceState>();
  for (const state of financeStates ?? []) {
    byProject.set(String(state.project_id), {
      settlement_status: state.settlement_status,
      settled_at: state.settled_at,
    } as ExpenseProjectFinanceState);
  }

  return rows.map((row) => ({
    ...row,
    finance_state: byProject.get(row.id) ?? null,
  }));
}

async function runProjectQuery(input: {
  companyId: string;
  employeeId: string | null;
  isFinanceAdmin: boolean;
  limit: number;
  name?: string;
  address?: string;
  customerIds?: string[];
}) {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("company_id", input.companyId)
    .is("deleted_at", null);

  if (!input.isFinanceAdmin) {
    if (!input.employeeId) return [];
    query = query.eq("customers.assigned_employee_id", input.employeeId);
  }
  if (input.name) query = query.ilike("name", `%${input.name}%`);
  if (input.address) query = query.ilike("address", `%${input.address}%`);
  if (input.customerIds) {
    if (input.customerIds.length === 0) return [];
    query = query.in("customer_id", input.customerIds);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProjectRow[];
}

export async function searchExpenseProjects(
  rawQuery = "",
  limit = 20,
): Promise<ExpenseProjectOption[]> {
  const access = await getExpenseAccess();
  const safeLimit = Math.max(1, Math.min(limit, 30));
  const queryText = rawQuery.trim().slice(0, 80);

  if (!access.isFinanceAdmin && !access.currentEmployeeId) return [];

  if (!queryText) {
    const rows = await runProjectQuery({
      companyId: access.companyId,
      employeeId: access.currentEmployeeId,
      isFinanceAdmin: access.isFinanceAdmin,
      limit: safeLimit,
    });
    return withFinanceState(rows);
  }

  const supabase = await createClient();
  let customerQuery = supabase
    .from("customers")
    .select("id")
    .eq("company_id", access.companyId)
    .is("deleted_at", null)
    .ilike("name", `%${queryText}%`)
    .limit(safeLimit * 2);

  if (!access.isFinanceAdmin) {
    customerQuery = customerQuery.eq(
      "assigned_employee_id",
      access.currentEmployeeId!,
    );
  }

  const customerPromise = customerQuery;
  const namePromise = runProjectQuery({
    companyId: access.companyId,
    employeeId: access.currentEmployeeId,
    isFinanceAdmin: access.isFinanceAdmin,
    limit: safeLimit,
    name: queryText,
  });
  const addressPromise = runProjectQuery({
    companyId: access.companyId,
    employeeId: access.currentEmployeeId,
    isFinanceAdmin: access.isFinanceAdmin,
    limit: safeLimit,
    address: queryText,
  });

  const [{ data: customerMatches, error: customerError }, nameRows, addressRows] =
    await Promise.all([customerPromise, namePromise, addressPromise]);
  if (customerError) throw new Error(customerError.message);

  const customerIds = (customerMatches ?? []).map((row) => String(row.id));
  const customerRows = await runProjectQuery({
    companyId: access.companyId,
    employeeId: access.currentEmployeeId,
    isFinanceAdmin: access.isFinanceAdmin,
    limit: safeLimit,
    customerIds,
  });

  const merged = new Map<string, ProjectRow>();
  for (const row of [...nameRows, ...addressRows, ...customerRows]) {
    merged.set(row.id, row);
  }

  const rows = [...merged.values()]
    .sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    )
    .slice(0, safeLimit);

  return withFinanceState(rows);
}

export async function listExpenseProjectsResilient(): Promise<
  ExpenseProjectOption[]
> {
  return searchExpenseProjects("", 20);
}
