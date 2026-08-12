"use server";

import { revalidatePath } from "next/cache";
import {
  cancelCollectionReceipt,
  confirmCollectionReceipt,
  getCollectionReceiptContext,
  listMyCollectionNotifications,
  registerCollectionReceipt,
} from "@/lib/crm/collections";
import {
  COLLECTION_PAYMENT_LABELS,
  COLLECTION_TYPE_LABELS,
  type CollectionNotificationItem,
  type CollectionPaymentMethod,
  type CollectionType,
} from "@/lib/crm/collection-shared";
import { enqueueNotificationEvent } from "@/lib/crm/notifications";

export type CollectionActionResult = {
  success: boolean;
  message?: string;
  error?: string;
};

function parseAmount(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw new Error("수금액은 0원보다 큰 원 단위 정수로 입력해 주세요.");
  }
  return amount;
}

function receivedDateToTimestamp(value: FormDataEntryValue | null): string | null {
  const date = String(value ?? "").trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("수금일을 확인해 주세요.");
  }
  return `${date}T12:00:00+09:00`;
}

async function enqueueCollectionConfirmed(receiptId: string) {
  const receipt = await getCollectionReceiptContext(receiptId);
  if (!receipt) return;
  const employee = receipt.assigned_employee;
  if (!employee?.id) return;
  const customerName = receipt.customers?.name ?? "고객";
  const assigneeName = [employee.name, employee.title].filter(Boolean).join(" ");
  const paymentLabel = COLLECTION_PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method;
  const typeLabel = COLLECTION_TYPE_LABELS[receipt.collection_type] ?? receipt.collection_type;

  await enqueueNotificationEvent({
    event_type: "collection_confirmed",
    customer_id: receipt.customer_id,
    project_id: receipt.project_id,
    recipient: employee.phone || employee.email || null,
    body: `[에잇티 수금확인] ${customerName} / ${typeLabel} / ${paymentLabel} / ${Number(receipt.amount).toLocaleString("ko-KR")}원`,
    payload: {
      receipt_id: receipt.id,
      contract_id: receipt.contract_id,
      assigned_employee_id: employee.id,
      assignee_name: assigneeName,
      customer_name: customerName,
      amount: receipt.amount,
      payment_method: receipt.payment_method,
      collection_type: receipt.collection_type,
      received_at: receipt.received_at,
    },
  });
}

async function enqueueCollectionReported(receiptId: string) {
  const receipt = await getCollectionReceiptContext(receiptId);
  if (!receipt) return;
  const customerName = receipt.customers?.name ?? "고객";
  const reporterName = receipt.reported_employee
    ? [receipt.reported_employee.name, receipt.reported_employee.title]
        .filter(Boolean)
        .join(" ")
    : "직원";
  const paymentLabel = COLLECTION_PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method;

  await enqueueNotificationEvent({
    event_type: "collection_reported",
    customer_id: receipt.customer_id,
    project_id: receipt.project_id,
    body: `[에잇티 수금확인 요청] ${reporterName} / ${customerName} / ${paymentLabel} ${Number(receipt.amount).toLocaleString("ko-KR")}원`,
    payload: {
      target: "finance_admins",
      receipt_id: receipt.id,
      contract_id: receipt.contract_id,
      assigned_employee_id: receipt.assigned_employee_id,
      reporter_employee_id: receipt.reported_by_employee_id,
      reporter_name: reporterName,
      assignee_name: receipt.assigned_employee
        ? [receipt.assigned_employee.name, receipt.assigned_employee.title]
            .filter(Boolean)
            .join(" ")
        : null,
      customer_name: customerName,
      amount: receipt.amount,
      payment_method: receipt.payment_method,
      collection_type: receipt.collection_type,
      received_at: receipt.received_at,
    },
  });
}

export async function registerCollectionReceiptAction(
  _prev: CollectionActionResult,
  formData: FormData,
): Promise<CollectionActionResult> {
  try {
    const contractId = String(formData.get("contract_id") ?? "").trim();
    if (!contractId) throw new Error("계약을 선택해 주세요.");
    const collectionType = String(formData.get("collection_type") ?? "other") as CollectionType;
    const paymentMethod = String(formData.get("payment_method") ?? "") as CollectionPaymentMethod;
    const amount = parseAmount(formData.get("amount"));
    const receivedAt = receivedDateToTimestamp(formData.get("received_date"));
    const memo = String(formData.get("memo") ?? "").trim() || null;

    const result = await registerCollectionReceipt({
      contractId,
      collectionType,
      paymentMethod,
      amount,
      receivedAt,
      memo,
    });

    if (result.status === "pending") {
      await enqueueCollectionReported(result.receipt_id);
    } else {
      await enqueueCollectionConfirmed(result.receipt_id);
    }

    revalidatePath("/finance/collections");
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      message:
        result.status === "pending"
          ? "수금 등록 완료. 관리자 확인대기로 등록하고 관리자에게 PUSH했습니다."
          : "수금이 확정 등록되었고 담당직원에게 PUSH했습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수금 등록에 실패했습니다.",
    };
  }
}

export async function confirmCollectionReceiptAction(
  receiptId: string,
): Promise<CollectionActionResult> {
  try {
    const normalized = receiptId.trim();
    if (!normalized) throw new Error("수금내역이 없습니다.");
    const result = await confirmCollectionReceipt(normalized);
    await enqueueCollectionConfirmed(result.receipt_id);
    revalidatePath("/finance/collections");
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${result.contract_id}`);
    revalidatePath("/dashboard");
    return {
      success: true,
      message: "수금을 확정했고 담당직원에게 PUSH했습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수금 확인에 실패했습니다.",
    };
  }
}

export async function cancelCollectionReceiptAction(
  receiptId: string,
  reason: string,
): Promise<CollectionActionResult> {
  try {
    const result = await cancelCollectionReceipt(receiptId, reason);
    revalidatePath("/finance/collections");
    revalidatePath("/contracts");
    if (result.contract_id) revalidatePath(`/contracts/${result.contract_id}`);
    return { success: true, message: "수금내역을 취소했습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수금 취소에 실패했습니다.",
    };
  }
}

export async function getMyCollectionNotificationsAction(): Promise<
  CollectionNotificationItem[]
> {
  try {
    return await listMyCollectionNotifications(10);
  } catch {
    return [];
  }
}
