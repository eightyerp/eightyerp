import { createClient } from "@/lib/supabase-server";
import { getSettlementAccess } from "@/lib/crm/settlements";

type ContractRow = {
  id: string;
  project_id: string | null;
  contract_number: string | null;
  status: string;
  contract_kind: string;
  contract_amount: number;
  cumulative_contract_amount: number;
  received_amount: number;
  outstanding_amount: number;
  assigned_employee_id: string | null;
  contract_date: string | null;
  created_at: string;
};

type ReceiptRow = {
  id: string;
  contract_id: string;
  status: string;
  amount: number;
  created_at: string;
};

type ExpenseRow = {
  id: string;
  project_id: string | null;
  status: string;
  total_amount: number;
  cost_basis_amount: number;
  payment_method: string;
  tax_evidence_type: string;
  is_post_settlement: boolean;
  work_trade: string;
  category: string;
  created_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  address: string | null;
  customer_id: string;
  assigned_employee_id: string | null;
  created_at: string;
};

type QuoteRow = {
  id: string;
  project_id: string | null;
  quote_type: string | null;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  teams?: { name?: string | null } | { name?: string | null }[] | null;
};

export type FinancePriorityItem = {
  key: string;
  label: string;
  count: number;
  amount: number;
  severity: "critical" | "warning" | "normal";
  hint: string;
};

export type ProjectFinancePreview = {
  projectId: string;
  projectName: string;
  address: string | null;
  businessUnit: "window" | "interior" | "unclassified";
  businessUnitSource: "quote" | "employee_team" | "unclassified";
  contractAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  approvedExpenseAmount: number;
  contributionMargin: number;
  provisionalSettlement: number | null;
};

export type FinanceV2PreviewBundle = {
  contractCount: number;
  confirmedCollectionAmount: number;
  pendingCollectionCount: number;
  pendingCollectionAmount: number;
  pendingExpenseCount: number;
  pendingExpenseAmount: number;
  missingEvidenceCount: number;
  postSettlementExpenseCount: number;
  projects: ProjectFinancePreview[];
  priorities: FinancePriorityItem[];
  warnings: string[];
};

function normalizeBusinessUnit(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("window") || normalized.includes("창호")) return "window" as const;
  if (normalized.includes("interior") || normalized.includes("인테리어")) return "interior" as const;
  return "unclassified" as const;
}

function teamName(row: EmployeeRow | undefined) {
  if (!row?.teams) return null;
  if (Array.isArray(row.teams)) return row.teams[0]?.name ?? null;
  return row.teams.name ?? null;
}

export async function getFinanceV2PreviewBundle(): Promise<FinanceV2PreviewBundle | null> {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) return null;

  const supabase = await createClient();
  const [
    contractsResult,
    receiptsResult,
    expensesResult,
    projectsResult,
    quotesResult,
    employeesResult,
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, project_id, contract_number, status, contract_kind, contract_amount, cumulative_contract_amount, received_amount, outstanding_amount, assigned_employee_id, contract_date, created_at",
      )
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("collection_receipts")
      .select("id, contract_id, status, amount, created_at")
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("expense_requests")
      .select(
        "id, project_id, status, total_amount, cost_basis_amount, payment_method, tax_evidence_type, is_post_settlement, work_trade, category, created_at",
      )
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("projects")
      .select("id, name, address, customer_id, assigned_employee_id, created_at")
      .eq("company_id", access.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("quotes")
      .select("id, project_id, quote_type, created_at")
      .eq("company_id", access.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("employees")
      .select("id, teams ( name )")
      .eq("company_id", access.companyId)
      .eq("is_active", true)
      .is("merged_into_employee_id", null),
  ]);

  const warnings: string[] = [];
  if (contractsResult.error) warnings.push("계약 Preview를 불러오지 못했습니다.");
  if (receiptsResult.error) warnings.push("수금 Preview를 불러오지 못했습니다.");
  if (expensesResult.error) warnings.push("지출 Preview를 불러오지 못했습니다.");
  if (projectsResult.error) warnings.push("현장 Preview를 불러오지 못했습니다.");
  if (quotesResult.error) warnings.push("견적 사업부 정보를 불러오지 못했습니다.");
  if (employeesResult.error) warnings.push("직원 소속팀 정보를 불러오지 못했습니다.");

  const contracts = (contractsResult.data ?? []) as ContractRow[];
  const receipts = (receiptsResult.data ?? []) as ReceiptRow[];
  const expenses = (expensesResult.data ?? []) as ExpenseRow[];
  const projects = (projectsResult.data ?? []) as ProjectRow[];
  const quotes = (quotesResult.data ?? []) as QuoteRow[];
  const employees = (employeesResult.data ?? []) as EmployeeRow[];

  const eligibleContracts = contracts.filter(
    (row) => row.contract_kind === "original" && !["draft", "cancelled", "terminated"].includes(row.status),
  );
  const pendingReceipts = receipts.filter((row) => row.status === "pending");
  const confirmedReceipts = receipts.filter((row) => row.status === "confirmed");
  const pendingExpenses = expenses.filter((row) => row.status === "pending");
  const missingEvidence = expenses.filter((row) => row.tax_evidence_type === "unverified");
  const postSettlementExpenses = expenses.filter((row) => row.is_post_settlement);

  const latestQuoteByProject = new Map<string, QuoteRow>();
  for (const quote of quotes) {
    if (!quote.project_id || latestQuoteByProject.has(quote.project_id)) continue;
    latestQuoteByProject.set(quote.project_id, quote);
  }

  const employeeById = new Map<string, EmployeeRow>();
  for (const employee of employees) employeeById.set(employee.id, employee);

  const contractByProject = new Map<string, ContractRow>();
  for (const contract of eligibleContracts) {
    if (!contract.project_id || contractByProject.has(contract.project_id)) continue;
    contractByProject.set(contract.project_id, contract);
  }

  const approvedExpenseByProject = new Map<string, number>();
  for (const expense of expenses) {
    if (!expense.project_id || !["approved", "paid"].includes(expense.status)) continue;
    approvedExpenseByProject.set(
      expense.project_id,
      (approvedExpenseByProject.get(expense.project_id) ?? 0) + Number(expense.cost_basis_amount || expense.total_amount || 0),
    );
  }

  const projectRows: ProjectFinancePreview[] = projects.map((project) => {
    const contract = contractByProject.get(project.id);
    const quote = latestQuoteByProject.get(project.id);
    const quoteUnit = normalizeBusinessUnit(quote?.quote_type);
    const assignedTeam = teamName(project.assigned_employee_id ? employeeById.get(project.assigned_employee_id) : undefined);
    const employeeUnit = normalizeBusinessUnit(assignedTeam);
    const businessUnit = quoteUnit !== "unclassified" ? quoteUnit : employeeUnit;
    const businessUnitSource: ProjectFinancePreview["businessUnitSource"] =
      quoteUnit !== "unclassified"
        ? "quote"
        : employeeUnit !== "unclassified"
          ? "employee_team"
          : "unclassified";
    const contractAmount = Number(contract?.cumulative_contract_amount || contract?.contract_amount || 0);
    const receivedAmount = Number(contract?.received_amount || 0);
    const outstandingAmount = Number(contract?.outstanding_amount || Math.max(0, contractAmount - receivedAmount));
    const approvedExpenseAmount = approvedExpenseByProject.get(project.id) ?? 0;
    const contributionMargin = contractAmount > 0 ? contractAmount - approvedExpenseAmount : 0;
    const provisionalSettlement =
      businessUnit === "interior"
        ? Math.floor(Math.max(0, contributionMargin) * 0.5)
        : businessUnit === "window"
          ? Math.floor(Math.max(0, contractAmount) * 0.02)
          : null;

    return {
      projectId: project.id,
      projectName: project.name,
      address: project.address,
      businessUnit,
      businessUnitSource,
      contractAmount,
      receivedAmount,
      outstandingAmount,
      approvedExpenseAmount,
      contributionMargin,
      provisionalSettlement,
    };
  });

  const priorities: FinancePriorityItem[] = [
    {
      key: "post-settlement",
      label: "정산완료 현장 추가지출",
      count: postSettlementExpenses.length,
      amount: postSettlementExpenses.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      severity: postSettlementExpenses.length > 0 ? "critical" : "normal",
      hint: "기존 확정정산을 덮어쓰지 않고 사후조정 검토가 필요합니다.",
    },
    {
      key: "collection-pending",
      label: "수금 확인대기",
      count: pendingReceipts.length,
      amount: pendingReceipts.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      severity: pendingReceipts.length > 0 ? "warning" : "normal",
      hint: "확정 전 수금은 계약 누계와 매출에 반영하지 않습니다.",
    },
    {
      key: "expense-pending",
      label: "지출 승인대기",
      count: pendingExpenses.length,
      amount: pendingExpenses.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      severity: pendingExpenses.length > 0 ? "warning" : "normal",
      hint: "일반건은 30초 승인, 위험건은 상세검토로 분리합니다.",
    },
    {
      key: "missing-evidence",
      label: "증빙·세무구분 미확인",
      count: missingEvidence.length,
      amount: missingEvidence.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      severity: missingEvidence.length > 0 ? "warning" : "normal",
      hint: "지급상태와 증빙보완 상태를 별도로 관리합니다.",
    },
    {
      key: "contract-opening",
      label: "기존 계약·미수금 이관 필요",
      count: eligibleContracts.length === 0 ? 1 : 0,
      amount: 0,
      severity: eligibleContracts.length === 0 ? "critical" : "normal",
      hint: "현재 계약 원장이 비어 있으면 수금관리 실사용이 불가능합니다.",
    },
  ];
  const priorityRank: Record<FinancePriorityItem["severity"], number> = {
    critical: 0,
    warning: 1,
    normal: 2,
  };
  priorities.sort((a, b) =>
    priorityRank[a.severity] - priorityRank[b.severity] ||
    b.amount - a.amount ||
    b.count - a.count,
  );

  return {
    contractCount: eligibleContracts.length,
    confirmedCollectionAmount: confirmedReceipts.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    pendingCollectionCount: pendingReceipts.length,
    pendingCollectionAmount: pendingReceipts.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    pendingExpenseCount: pendingExpenses.length,
    pendingExpenseAmount: pendingExpenses.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    missingEvidenceCount: missingEvidence.length,
    postSettlementExpenseCount: postSettlementExpenses.length,
    projects: projectRows,
    priorities,
    warnings,
  };
}
