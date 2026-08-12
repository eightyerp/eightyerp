"use server";

import { revalidatePath } from "next/cache";
import {
  approveExpenseRequest,
  getExpenseAccess,
  markExpensePaid,
  rejectExpenseRequest,
} from "@/lib/crm/expenses";
import { enqueueNotificationEvent } from "@/lib/crm/notifications";
import { createClient } from "@/lib/supabase-server";

export type ExpenseCockpitActionResult = {
  success: boolean;
  message?: string;
  error?: string;
};

async function requireFinanceAdmin() {
  const access = await getExpenseAccess();
  if (!access.isFinanceAdmin) {
    throw new Error("관리자만 처리할 수 있습니다.");
  }
  return access;
}

async function expenseContext(expenseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_requests")
    .select(`
      id, customer_id, project_id, description, total_amount, status, payment_method,
      vendor_name_snapshot, requested_by_employee_id,
      requested_employee:employees!expense_requests_requested_by_employee_id_fkey (
        id, name, title, phone, email
      )
    `)
    .eq("id", expenseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("지출요청을 찾을 수 없습니다.");
  const employee = Array.isArray(data.requested_employee)
    ? data.requested_employee[0] ?? null
    : data.requested_employee;
  return { ...data, requested_employee: employee };
}

async function pushToRequester(
  eventType: "expense_approved" | "expense_paid",
  expenseId: string,
) {
  const row = await expenseContext(expenseId);
  const employee = row.requested_employee;
  const requesterName = employee
    ? [employee.name, employee.title].filter(Boolean).join(" ")
    : "직원";

  await enqueueNotificationEvent({
    event_type: eventType,
    customer_id: row.customer_id,
    project_id: row.project_id,
    recipient: employee?.phone || employee?.email || null,
    body: `[에잇티 지출] ${requesterName} / ${row.vendor_name_snapshot ?? "거래처"} / ${Number(row.total_amount).toLocaleString("ko-KR")}원`,
    payload: {
      target: "requester",
      expense_id: row.id,
      requester_employee_id: row.requested_by_employee_id,
      requester_name: requesterName,
      vendor_name: row.vendor_name_snapshot,
      description: row.description,
      amount: row.total_amount,
      status: eventType === "expense_paid" ? "paid" : "approved",
    },
  });
}

function refreshExpensePages() {
  revalidatePath("/finance/payments");
  revalidatePath("/dashboard");
}

export async function cockpitApproveExpenseAction(
  expenseId: string,
): Promise<ExpenseCockpitActionResult> {
  try {
    await requireFinanceAdmin();
    await approveExpenseRequest(expenseId);
    await pushToRequester("expense_approved", expenseId);
    refreshExpensePages();
    return { success: true, message: "승인했습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "승인에 실패했습니다.",
    };
  }
}

export async function cockpitApproveAndPayExpenseAction(
  expenseId: string,
): Promise<ExpenseCockpitActionResult> {
  try {
    await requireFinanceAdmin();
    const before = await expenseContext(expenseId);
    if (before.status !== "pending") {
      throw new Error("승인대기 상태의 지출만 처리할 수 있습니다.");
    }
    if (before.payment_method !== "company_card") {
      throw new Error("법인카드 지출만 승인과 지급완료를 한 번에 처리할 수 있습니다.");
    }

    await approveExpenseRequest(expenseId);
    await markExpensePaid(expenseId, new Date().toISOString(), "company_card");
    await pushToRequester("expense_paid", expenseId);
    refreshExpensePages();
    return { success: true, message: "승인하고 지급완료 처리했습니다." };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "승인·지급완료 처리에 실패했습니다.",
    };
  }
}

export async function cockpitRejectExpenseAction(
  expenseId: string,
  reason: string,
): Promise<ExpenseCockpitActionResult> {
  try {
    await requireFinanceAdmin();
    if (!reason.trim()) throw new Error("반려 사유를 입력해 주세요.");
    await rejectExpenseRequest(expenseId, reason.trim());
    refreshExpensePages();
    return { success: true, message: "반려했습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반려에 실패했습니다.",
    };
  }
}

export async function cockpitMarkPaidAction(
  expenseId: string,
  paymentMethod: string,
): Promise<ExpenseCockpitActionResult> {
  try {
    await requireFinanceAdmin();
    await markExpensePaid(
      expenseId,
      new Date().toISOString(),
      paymentMethod || null,
    );
    await pushToRequester("expense_paid", expenseId);
    refreshExpensePages();
    return { success: true, message: "지급완료 처리했습니다." };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "지급완료 처리에 실패했습니다.",
    };
  }
}
