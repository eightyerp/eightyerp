import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import { getQuoteById } from "@/lib/crm/quote-mgmt";
import { writeAuditLog } from "@/lib/crm/customers";

export type ContractTransitionProjectOption = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  assigned_employee_id: string | null;
};

export type QuoteContractTransitionOptions = {
  quoteId: string;
  customerId: string;
  quoteProjectId: string | null;
  projects: ContractTransitionProjectOption[];
};

export type QuoteContractTransitionResult = {
  contractId: string;
  projectId: string;
  executionBudgetId: string;
  idempotent: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOptionalUuid(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (!UUID_PATTERN.test(normalized)) throw new Error("연결 정보가 올바르지 않습니다.");
  return normalized;
}

function normalizeOptionalDate(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("계약일 형식이 올바르지 않습니다.");
  }
  return normalized;
}

function normalizeText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export async function getQuoteContractTransitionOptions(
  quoteId: string,
): Promise<QuoteContractTransitionOptions> {
  await requireAuthenticatedAccess();
  const quote = await getQuoteById(quoteId);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const companyId = String(quote.company_id ?? "").trim();
  if (!UUID_PATTERN.test(companyId)) {
    throw new Error("견적의 회사 정보를 확인할 수 없습니다.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, address, status, assigned_employee_id")
    .eq("company_id", companyId)
    .eq("customer_id", quote.customer_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error("고객 현장 정보를 불러오지 못했습니다.");

  return {
    quoteId: quote.id,
    customerId: quote.customer_id,
    quoteProjectId: normalizeOptionalUuid(quote.project_id),
    projects: (data ?? []) as ContractTransitionProjectOption[],
  };
}

export async function transitionQuoteToContract(input: {
  quoteId: string;
  projectMode: "link" | "create";
  projectId?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  contractDate?: string | null;
}): Promise<QuoteContractTransitionResult> {
  const access = await requireAuthenticatedAccess();
  const quote = await getQuoteById(input.quoteId);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const companyId = String(quote.company_id ?? "").trim();
  if (!UUID_PATTERN.test(companyId)) {
    throw new Error("견적의 회사 정보를 확인할 수 없습니다.");
  }

  const supabase = await createClient();
  const projectId = normalizeOptionalUuid(input.projectId);
  const contractDate = normalizeOptionalDate(input.contractDate);
  const projectName = normalizeText(input.projectName, 120);
  const projectAddress = normalizeText(input.projectAddress, 300);

  if (input.projectMode === "link") {
    if (!projectId) throw new Error("계약에 연결할 현장을 선택해 주세요.");
    const { data: project, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .eq("customer_id", quote.customer_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !project) {
      throw new Error("현재 고객에게 연결할 수 있는 현장이 아닙니다.");
    }
  } else {
    const { count, error } = await supabase
      .from("projects")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .eq("customer_id", quote.customer_id)
      .is("deleted_at", null);
    if (error) throw new Error("기존 현장 확인에 실패했습니다.");
    if ((count ?? 0) > 0) {
      throw new Error("기존 현장이 있습니다. 새로 만들지 말고 기존 현장을 연결해 주세요.");
    }
  }

  const { data, error } = await supabase.rpc("transition_quote_to_contract", {
    p_quote_id: quote.id,
    p_project_mode: input.projectMode,
    p_project_id: input.projectMode === "link" ? projectId : null,
    p_project_name: input.projectMode === "create" ? projectName : null,
    p_project_address: input.projectMode === "create" ? projectAddress : null,
    p_assigned_employee_id: quote.assigned_employee_id ?? access.profile?.employee_id ?? null,
    p_contract_date: contractDate,
    p_contract_number: null,
  });

  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("발송완료")) {
      throw new Error("고객전송을 완료한 견적만 계약으로 전환할 수 있습니다.");
    }
    if (message.includes("contract replay project mismatch")) {
      throw new Error(
        "이미 전환된 계약의 현장과 선택한 현장이 다릅니다. 기존 계약 현장을 확인해 주세요.",
      );
    }
    if (message.includes("project")) {
      throw new Error("계약에 연결할 현장 정보를 다시 확인해 주세요.");
    }
    throw new Error("계약 전환에 실패했습니다. 견적과 현장 상태를 확인해 주세요.");
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const contractId = String(result.contract_id ?? "");
  const resultProjectId = String(result.project_id ?? "");
  const executionBudgetId = String(result.execution_budget_id ?? "");
  if (
    !UUID_PATTERN.test(contractId) ||
    !UUID_PATTERN.test(resultProjectId) ||
    !UUID_PATTERN.test(executionBudgetId)
  ) {
    throw new Error("계약 전환 결과를 확인할 수 없습니다.");
  }

  await writeAuditLog({
    entity_type: "contract",
    entity_id: contractId,
    action: "transition_from_quote",
    payload: {
      quote_id: quote.id,
      customer_id: quote.customer_id,
      project_id: resultProjectId,
      project_mode: input.projectMode,
    },
  });

  return {
    contractId,
    projectId: resultProjectId,
    executionBudgetId,
    idempotent:
      result.already_converted === true || result.idempotent === true,
  };
}
