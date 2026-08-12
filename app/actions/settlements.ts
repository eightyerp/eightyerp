"use server";

import { revalidatePath } from "next/cache";
import { importLegacy2026Settlement } from "@/lib/crm/settlements";

export type SettlementActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  settlementId?: string;
};

function money(value: FormDataEntryValue | null, label: string) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim() || 0);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${label}은 원 단위 0 이상 금액으로 입력해 주세요.`);
  }
  return n;
}

export async function importLegacy2026SettlementAction(
  _prev: SettlementActionResult,
  formData: FormData,
): Promise<SettlementActionResult> {
  try {
    const employeeId = String(formData.get("employee_id") ?? "").trim();
    const payoutDate = String(formData.get("payout_date") ?? "").trim();
    if (!employeeId) throw new Error("직원을 선택해 주세요.");
    if (!/^2026-\d{2}-\d{2}$/.test(payoutDate)) {
      throw new Error("2026년 실제 지급일을 선택해 주세요.");
    }

    const revenueAmount = money(formData.get("revenue_amount"), "매출액");
    const costAmount = money(formData.get("cost_amount"), "매출원가");
    const baseSettlementAmount = money(formData.get("base_settlement_amount"), "기본 정산금액");
    const additionalIncentiveAmount = money(formData.get("additional_incentive_amount"), "추가 인센티브");
    const deductionAmount = money(formData.get("deduction_amount"), "차감액");
    const actualPaidAmount = money(formData.get("actual_paid_amount"), "실제 지급액");

    const expected = baseSettlementAmount + additionalIncentiveAmount - deductionAmount;
    if (expected !== actualPaidAmount) {
      throw new Error("기본정산 + 추가인센 - 차감 = 실제 지급액이 되도록 확인해 주세요.");
    }

    const result = await importLegacy2026Settlement({
      employeeId,
      payoutDate,
      projectId: String(formData.get("project_id") ?? "").trim() || null,
      projectName: String(formData.get("project_name") ?? "").trim() || null,
      revenueAmount,
      costAmount,
      baseSettlementAmount,
      additionalIncentiveAmount,
      deductionAmount,
      actualPaidAmount,
      memo: String(formData.get("memo") ?? "").trim() || null,
    });

    revalidatePath("/finance/settlements");
    return {
      success: true,
      settlementId: result.settlement_id,
      message: "2026 기존 정산 지급분을 확정 이관했습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "기존 정산 이관에 실패했습니다.",
    };
  }
}
