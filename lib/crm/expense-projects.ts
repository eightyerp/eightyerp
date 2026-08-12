import { getExpenseAccess } from "@/lib/crm/expenses";
import { createClient } from "@/lib/supabase-server";
import type {
  ExpenseProjectFinanceState,
  ExpenseProjectOption,
} from "@/lib/crm/expense-shared";

export async function listExpenseProjectsResilient(): Promise<
  ExpenseProjectOption[]
> {
  await getExpenseAccess();
  const supabase = await createClient();

  const { data: projects, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, name, address, customer_id, customers:customers!projects_customer_id_fkey ( id, name, phone )",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);

  if (projectError) throw new Error(projectError.message);
  const rows = (projects ?? []) as unknown as ExpenseProjectOption[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { data: financeStates, error: financeError } = await supabase
    .from("project_finance_states")
    .select("project_id, settlement_status, settled_at")
    .in("project_id", ids);

  if (financeError) {
    // 정산상태 보조정보가 실패해도 지출 현장 목록 자체는 유지한다.
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
