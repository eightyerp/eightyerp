"use server";

import { getCurrentCompanyAccess } from "@/lib/crm/access";
import type { CollectionNotificationItem } from "@/lib/crm/collection-shared";
import type { CustomerPushItem } from "@/lib/crm/customer-push";
import type { ExpenseNotificationItem } from "@/lib/crm/expense-shared";

export type ErpNotificationBundle = {
  customers: CustomerPushItem[];
  collections: CollectionNotificationItem[];
  expenses: ExpenseNotificationItem[];
};

type NotificationEventRow = {
  id: string;
  event_type: string;
  customer_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const FINANCE_ADMIN_ROLES = new Set(["owner", "director", "admin"]);
const ERP_NOTIFICATION_EVENT_TYPES = [
  "customer_assigned",
  "collection_reported",
  "collection_confirmed",
  "expense_requested",
  "expense_approved",
  "expense_paid",
] as const;

function payloadValue(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return value == null || value === "" ? null : String(value);
}

/**
 * 상단 알림은 사용자/회사 권한을 한 번만 계산하고 notification_events도 한 번만 읽는다.
 * 이전에는 고객/수금/지출이 각각 access + DB query를 수행해 동일 화면에서 불필요한
 * 네트워크 왕복이 발생했다. RLS가 회사 경계를 지키고 이 함수가 역할/담당자별 노출을
 * 다시 좁혀서 기존 표시 규칙을 유지한다.
 */
export async function getErpNotificationsAction(): Promise<ErpNotificationBundle> {
  try {
    const { access, companyRole, supabase } = await getCurrentCompanyAccess();
    const employeeId = access.profile?.employee_id ?? null;
    const isFinanceAdmin = Boolean(
      companyRole && FINANCE_ADMIN_ROLES.has(companyRole),
    );

    const { data, error } = await supabase
      .from("notification_events")
      .select("id, event_type, customer_id, payload, created_at")
      .in("event_type", [...ERP_NOTIFICATION_EVENT_TYPES])
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      console.error("[erp-notifications] bundle query failed", error.message);
      return { customers: [], collections: [], expenses: [] };
    }

    const rows = (data ?? []) as NotificationEventRow[];

    const customers = rows
      .flatMap((row): CustomerPushItem[] => {
        if (row.event_type !== "customer_assigned" || !employeeId) return [];
        const payload = row.payload ?? {};
        if (payloadValue(payload, "assigned_employee_id") !== employeeId) {
          return [];
        }
        if (!row.customer_id) return [];
        return [
          {
            id: row.id,
            customerId: row.customer_id,
            customerName: String(payload.customer_name ?? "고객"),
            phone: String(payload.phone ?? ""),
            address: payloadValue(payload, "address"),
            consultationType: payloadValue(payload, "consultation_type"),
            status: payloadValue(payload, "status"),
            note: payloadValue(payload, "note"),
            createdAt: row.created_at,
          },
        ];
      })
      .slice(0, 10);

    const collections = rows
      .flatMap((row): CollectionNotificationItem[] => {
        const isVisible = isFinanceAdmin
          ? row.event_type === "collection_reported"
          : row.event_type === "collection_confirmed" &&
            employeeId != null &&
            payloadValue(row.payload ?? {}, "assigned_employee_id") === employeeId;
        if (!isVisible) return [];
        const payload = row.payload ?? {};
        return [
          {
            id: row.id,
            eventType: row.event_type as CollectionNotificationItem["eventType"],
            receiptId: payloadValue(payload, "receipt_id"),
            customerId: row.customer_id,
            customerName: String(payload.customer_name ?? "고객"),
            amount: Number(payload.amount ?? 0),
            paymentMethod: String(payload.payment_method ?? ""),
            collectionType: String(payload.collection_type ?? ""),
            reporterName: payloadValue(payload, "reporter_name"),
            assigneeName: payloadValue(payload, "assignee_name"),
            createdAt: row.created_at,
          },
        ];
      })
      .slice(0, 10);

    const expenses = rows
      .flatMap((row): ExpenseNotificationItem[] => {
        const employeeExpenseEvent =
          row.event_type === "expense_approved" || row.event_type === "expense_paid";
        const isVisible = isFinanceAdmin
          ? row.event_type === "expense_requested"
          : employeeExpenseEvent &&
            employeeId != null &&
            payloadValue(row.payload ?? {}, "requester_employee_id") === employeeId;
        if (!isVisible) return [];
        const payload = row.payload ?? {};
        return [
          {
            id: row.id,
            eventType: row.event_type as ExpenseNotificationItem["eventType"],
            expenseId: String(payload.expense_id ?? ""),
            requesterEmployeeId: payloadValue(payload, "requester_employee_id"),
            requesterName: payloadValue(payload, "requester_name"),
            vendorName: payloadValue(payload, "vendor_name"),
            description: String(payload.description ?? "지출요청"),
            amount: Number(payload.amount ?? 0),
            status: String(payload.status ?? ""),
            createdAt: row.created_at,
          },
        ];
      })
      .slice(0, 10);

    return { customers, collections, expenses };
  } catch (error) {
    console.error(
      "[erp-notifications] bundle load failed",
      error instanceof Error ? error.message : error,
    );
    return { customers: [], collections: [], expenses: [] };
  }
}
