import { getCurrentCompanyAccess } from "@/lib/crm/access";
import { createClient } from "@/lib/supabase-server";

const FINANCE_ADMIN_ROLES = new Set(["owner", "director", "admin"]);

export type SettlementAccess = {
  isFinanceAdmin: boolean;
  companyId: string;
  currentEmployeeId: string | null;
  userId: string;
};

export type SettlementEmployeeOption = {
  id: string;
  name: string;
  title: string | null;
  team?: { name: string } | { name: string }[] | null;
};

export type SettlementSummary2026 = {
  id: string;
  company_id: string;
  employee_id: string;
  settlement_year: number;
  settlement_month: number;
  source_type: "legacy_2026" | "erp";
  status: "draft" | "confirmed" | "paid" | "cancelled";
  payout_date: string | null;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
  base_settlement_amount: number;
  additional_incentive_amount: number;
  deduction_amount: number;
  final_payable_amount: number;
  paid_amount: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
  employee?: { id: string; name: string; title: string | null } | null;
};

export type SettlementLine = {
  id: string;
  settlement_id: string;
  employee_id: string;
  project_id: string | null;
  project_name_snapshot: string | null;
  line_type: string;
  description: string;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
  base_settlement_amount: number;
  adjustment_amount: number;
  line_payable_amount: number;
  created_at: string;
};

export async function getSettlementAccess(): Promise<SettlementAccess> {
  const { access, companyRole } = await getCurrentCompanyAccess();
  if (!access.userId || !access.profile?.active_company_id) {
    throw new Error("현재 회사 정보를 확인할 수 없습니다.");
  }
  return {
    isFinanceAdmin: Boolean(companyRole && FINANCE_ADMIN_ROLES.has(companyRole)),
    companyId: access.profile.active_company_id,
    currentEmployeeId: access.profile.employee_id ?? null,
    userId: access.userId,
  };
}

export async function listSettlementEmployees(): Promise<SettlementEmployeeOption[]> {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, title, team:teams(name)")
    .eq("company_id", access.companyId)
    .eq("is_active", true)
    .is("merged_into_employee_id", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SettlementEmployeeOption[];
}

export async function listSettlementSummaries2026(): Promise<SettlementSummary2026[]> {
  await getSettlementAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_settlement_summary_2026")
    .select(`
      id, company_id, employee_id, settlement_year, settlement_month, source_type, status,
      payout_date, revenue_amount, cost_amount, margin_amount, base_settlement_amount,
      additional_incentive_amount, deduction_amount, final_payable_amount, paid_amount,
      memo, created_at, updated_at,
      employee:employees!employee_settlement_batches_employee_id_fkey(id,name,title)
    `)
    .order("payout_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) {
    // Some PostgREST versions cannot infer the view->employee FK; retry without embed.
    const fallback = await supabase
      .from("employee_settlement_summary_2026")
      .select("id, company_id, employee_id, settlement_year, settlement_month, source_type, status, payout_date, revenue_amount, cost_amount, margin_amount, base_settlement_amount, additional_incentive_amount, deduction_amount, final_payable_amount, paid_amount, memo, created_at, updated_at")
      .order("payout_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? []) as SettlementSummary2026[];
  }
  return (data ?? []) as unknown as SettlementSummary2026[];
}

export async function listSettlementLines(settlementIds: string[]): Promise<SettlementLine[]> {
  await getSettlementAccess();
  if (settlementIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_settlement_lines")
    .select("id, settlement_id, employee_id, project_id, project_name_snapshot, line_type, description, revenue_amount, cost_amount, margin_amount, base_settlement_amount, adjustment_amount, line_payable_amount, created_at")
    .in("settlement_id", settlementIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SettlementLine[];
}

export async function importLegacy2026Settlement(input: {
  employeeId: string;
  payoutDate: string;
  projectId?: string | null;
  projectName?: string | null;
  revenueAmount: number;
  costAmount: number;
  baseSettlementAmount: number;
  additionalIncentiveAmount: number;
  deductionAmount: number;
  actualPaidAmount: number;
  memo?: string | null;
}) {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) throw new Error("관리자만 기존 정산자료를 이관할 수 있습니다.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_legacy_2026_settlement", {
    p_employee_id: input.employeeId,
    p_payout_date: input.payoutDate,
    p_project_id: input.projectId ?? null,
    p_project_name: input.projectName?.trim() || null,
    p_revenue_amount: input.revenueAmount,
    p_cost_amount: input.costAmount,
    p_base_settlement_amount: input.baseSettlementAmount,
    p_additional_incentive_amount: input.additionalIncentiveAmount,
    p_deduction_amount: input.deductionAmount,
    p_actual_paid_amount: input.actualPaidAmount,
    p_memo: input.memo?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as { settlement_id: string; employee_id: string; payout_date: string; actual_paid_amount: number };
}
