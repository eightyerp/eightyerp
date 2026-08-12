"use server";

import { revalidatePath } from "next/cache";
import {
  findOrCreateVendorCandidate,
  getExpenseAccess,
  registerExpenseRequest,
} from "@/lib/crm/expenses";

export type QuickCardExpenseResult = {
  success: boolean;
  message?: string;
  error?: string;
};

function parsePositiveMoney(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw new Error("결제금액을 0원보다 큰 원 단위 정수로 입력해 주세요.");
  }
  return amount;
}

function todayInKorea(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function registerQuickCompanyCardExpenseAction(
  _prev: QuickCardExpenseResult,
  formData: FormData,
): Promise<QuickCardExpenseResult> {
  try {
    const access = await getExpenseAccess();
    if (!access.isFinanceAdmin) {
      throw new Error("관리자만 법인카드 간편등록을 사용할 수 있습니다.");
    }

    const projectId = String(formData.get("project_id") ?? "").trim();
    if (!projectId) throw new Error("현장을 선택해 주세요.");

    const totalAmount = parsePositiveMoney(formData.get("total_amount"));
    const expenseDate = String(formData.get("expense_date") ?? "").trim() || todayInKorea();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      throw new Error("결제일을 확인해 주세요.");
    }

    const vendorName = String(formData.get("vendor_name") ?? "").trim();
    const description =
      String(formData.get("description") ?? "").trim() ||
      (vendorName ? `${vendorName} 법인카드 사용` : "법인카드 사용");

    let vendorId: string | null = null;
    if (vendorName) {
      const vendor = await findOrCreateVendorCandidate({
        name: vendorName,
        createdFrom: "manual",
      });
      vendorId = vendor.vendor_id;
    }

    await registerExpenseRequest({
      projectId,
      category: "site",
      vendorId,
      vendorName: vendorName || null,
      description,
      // 영수증이 없을 때는 현장 원가를 우선 정확히 반영하기 위해
      // 총액을 공급가 임시값으로 저장하고 VAT는 0(미확인)으로 둔다.
      supplyAmount: totalAmount,
      vatAmount: 0,
      totalAmount,
      expenseDate,
      paymentDueDate: null,
      paymentMethod: "company_card",
      memo:
        "법인카드 총액 우선등록 / 증빙 미첨부 / 공급가·부가세 구분 미확인 - 카드내역 또는 영수증 추후 보완",
    });

    revalidatePath("/finance/payments");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "법인카드 지출을 총액 기준으로 등록했습니다. 영수증은 나중에 보완할 수 있습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "법인카드 지출 등록에 실패했습니다.",
    };
  }
}
