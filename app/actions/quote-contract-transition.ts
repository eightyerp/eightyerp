"use server";

import { revalidatePath } from "next/cache";
import {
  getQuoteContractTransitionOptions,
  transitionQuoteToContract,
  type ContractTransitionProjectOption,
} from "@/lib/crm/quote-contract-transition";

export type ContractTransitionOptionsResult = {
  success: boolean;
  quoteProjectId?: string | null;
  projects?: ContractTransitionProjectOption[];
  error?: string;
};

export type ContractTransitionActionResult = {
  success: boolean;
  contractId?: string;
  projectId?: string;
  executionBudgetId?: string;
  message?: string;
  error?: string;
};

export async function getQuoteContractTransitionOptionsAction(
  quoteId: string,
): Promise<ContractTransitionOptionsResult> {
  try {
    const options = await getQuoteContractTransitionOptions(quoteId);
    return {
      success: true,
      quoteProjectId: options.quoteProjectId,
      projects: options.projects,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "계약 전환 정보를 불러오지 못했습니다.",
    };
  }
}

export async function transitionQuoteToContractAction(
  formData: FormData,
): Promise<ContractTransitionActionResult> {
  try {
    const quoteId = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectMode = String(formData.get("project_mode") ?? "").trim();
    if (!quoteId) return { success: false, error: "견적 ID가 없습니다." };
    if (projectMode !== "link" && projectMode !== "create") {
      return { success: false, error: "현장 연결 방식을 확인해 주세요." };
    }

    const result = await transitionQuoteToContract({
      quoteId,
      projectMode,
      projectId: String(formData.get("project_id") ?? "").trim() || null,
      projectName: String(formData.get("project_name") ?? "").trim() || null,
      projectAddress:
        String(formData.get("project_address") ?? "").trim() || null,
      contractDate: String(formData.get("contract_date") ?? "").trim() || null,
    });

    revalidatePath("/contracts");
    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quoteId}`);
    if (customerId) {
      revalidatePath(`/customers/${customerId}`);
      revalidatePath(`/customers/${customerId}/quotes`);
    }
    revalidatePath(`/projects/${result.projectId}/schedule`);

    return {
      success: true,
      contractId: result.contractId,
      projectId: result.projectId,
      executionBudgetId: result.executionBudgetId,
      message: result.idempotent
        ? "이미 전환된 계약 정보를 확인했습니다."
        : "계약 전환이 완료되었습니다. 기존 현장과 실행예산이 연결되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "계약 전환에 실패했습니다.",
    };
  }
}
