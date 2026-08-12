"use server";

import { revalidatePath } from "next/cache";
import { getExpenseAccess, setExpenseTaxEvidence } from "@/lib/crm/expenses";
import type { ExpenseTaxEvidenceType } from "@/lib/crm/expense-shared";

export type ExpenseTaxEvidenceResult = {
  success: boolean;
  message?: string;
  error?: string;
};

function parseMoney(value: FormDataEntryValue | null, label: string): number {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error(`${label}을 원 단위 정수로 입력해 주세요.`);
  }
  return amount;
}

export async function setExpenseTaxEvidenceAction(
  expenseId: string,
  formData: FormData,
): Promise<ExpenseTaxEvidenceResult> {
  try {
    const access = await getExpenseAccess();
    if (!access.isFinanceAdmin) {
      throw new Error("관리자만 세무증빙을 정리할 수 있습니다.");
    }

    const taxEvidenceType = String(
      formData.get("tax_evidence_type") ?? "unverified",
    ) as ExpenseTaxEvidenceType;
    const supplyAmount = parseMoney(formData.get("supply_amount"), "공급가");
    const vatAmount = parseMoney(formData.get("vat_amount"), "부가세");
    const totalAmount = parseMoney(formData.get("total_amount"), "합계");

    if (totalAmount <= 0) throw new Error("합계는 0원보다 커야 합니다.");
    if (supplyAmount + vatAmount !== totalAmount) {
      throw new Error("공급가 + 부가세 = 합계가 되도록 입력해 주세요.");
    }

    const result = await setExpenseTaxEvidence({
      expenseId,
      taxEvidenceType,
      supplyAmount,
      vatAmount,
      totalAmount,
    });

    revalidatePath("/finance/payments");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `세무증빙을 반영했습니다. 현장손익 반영액 ${Number(result.cost_basis_amount).toLocaleString("ko-KR")}원`,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "세무증빙 반영에 실패했습니다.",
    };
  }
}
