import { createClient } from "@/lib/supabase-server";
import { requireCustomerAccess } from "@/lib/crm/customer-access";

export type CrmAlertItem = {
  id: string;
  eventType: string;
  customerId: string | null;
  scheduleId: string | null;
  title: string;
  body: string;
  href: string;
  status: string | null;
  createdAt: string;
  tone: "info" | "warning" | "danger";
};

const SCHEDULE_EVENT_TYPES = [
  "schedule_changed",
  "consult_remind_1h",
  "consult_unhandled",
  "customer_assignment_uncontacted_30m",
  "customer_stale_3d",
  "customer_stale_7d",
] as const;

function scheduleAlertCopy(eventType: string) {
  switch (eventType) {
    case "schedule_changed":
      return {
        title: "고객 일정 등록·변경",
        body: "새 일정 또는 변경된 일정을 확인해 주세요.",
        tone: "info" as const,
      };
    case "consult_remind_1h":
      return {
        title: "1시간 후 고객 일정",
        body: "상담·실측·재연락 예정시간이 가까워졌습니다.",
        tone: "warning" as const,
      };
    case "consult_unhandled":
      return {
        title: "미처리 고객 일정",
        body: "예정시간이 30분 이상 지났습니다. 완료 또는 재예약해 주세요.",
        tone: "danger" as const,
      };
    case "customer_assignment_uncontacted_30m":
      return {
        title: "배분 후 30분 미연락",
        body: "신규 배분 고객의 첫 연락이 아직 확인되지 않았습니다.",
        tone: "danger" as const,
      };
    case "customer_stale_3d":
      return {
        title: "3일 이상 후속 없음",
        body: "최근 활동과 다음 일정이 없습니다. 후속 행동을 등록해 주세요.",
        tone: "warning" as const,
      };
    case "customer_stale_7d":
      return {
        title: "7일 이상 장기 방치",
        body: "장기간 후속 행동이 없습니다. 연락·재예약·보류 여부를 확인해 주세요.",
        tone: "danger" as const,
      };
    default:
      return {
        title: "CRM 알림",
        body: "확인할 고객 업무가 있습니다.",
        tone: "info" as const,
      };
  }
}

export async function listMyCrmAlerts(limit = 40): Promise<CrmAlertItem[]> {
  const access = await requireCustomerAccess();
  if (!access.employeeId) return [];

  const supabase = await createClient();
  const safeLimit = Math.max(1, Math.min(limit, 80));

  const [assignedResult, scheduleResult] = await Promise.all([
    supabase
      .from("notification_events")
      .select("id, event_type, customer_id, payload, status, created_at")
      .eq("event_type", "customer_assigned")
      .contains("payload", { assigned_employee_id: access.employeeId })
      .order("created_at", { ascending: false })
      .limit(Math.min(safeLimit, 30)),
    supabase
      .from("schedule_alert_events")
      .select(
        "id, event_type, schedule_id, customer_id, payload, status, created_at, customers ( id, name, phone, address, status )",
      )
      .eq("assigned_employee_id", access.employeeId)
      .in("event_type", [...SCHEDULE_EVENT_TYPES])
      .order("created_at", { ascending: false })
      .limit(safeLimit),
  ]);

  const alerts: CrmAlertItem[] = [];

  if (!assignedResult.error) {
    for (const row of assignedResult.data ?? []) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      alerts.push({
        id: `assigned:${row.id}`,
        eventType: row.event_type,
        customerId: row.customer_id,
        scheduleId: null,
        title: "신규 고객 배분",
        body: `${String(payload.customer_name ?? "고객")} 고객이 내 담당으로 배분되었습니다.`,
        href: row.customer_id ? `/crm/customers/${row.customer_id}` : "/crm/customers",
        status: row.status,
        createdAt: row.created_at,
        tone: "info",
      });
    }
  }

  if (!scheduleResult.error) {
    for (const row of scheduleResult.data ?? []) {
      const copy = scheduleAlertCopy(row.event_type);
      const customerRaw = row.customers as
        | { id: string; name: string; phone: string; address: string | null; status: string }
        | { id: string; name: string; phone: string; address: string | null; status: string }[]
        | null;
      const customer = Array.isArray(customerRaw) ? customerRaw[0] ?? null : customerRaw;
      const isScheduleDeepLink = [
        "schedule_changed",
        "consult_remind_1h",
        "consult_unhandled",
      ].includes(row.event_type);
      const href =
        isScheduleDeepLink && row.schedule_id
          ? `/crm/schedules/${row.schedule_id}`
          : row.customer_id
            ? `/crm/customers/${row.customer_id}`
            : "/crm";

      alerts.push({
        id: `schedule:${row.id}`,
        eventType: row.event_type,
        customerId: row.customer_id,
        scheduleId: row.schedule_id,
        title: customer?.name ? `${copy.title} · ${customer.name}` : copy.title,
        body: copy.body,
        href,
        status: row.status,
        createdAt: row.created_at,
        tone: copy.tone,
      });
    }
  }

  return alerts
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, safeLimit);
}
