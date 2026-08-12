import { createClient } from "@/lib/supabase-server";
import { requireCustomerAccess } from "@/lib/crm/customer-access";
import { enqueueNotificationEvent } from "@/lib/crm/notifications";

export type CustomerPushItem = {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  address: string | null;
  consultationType: string | null;
  status: string | null;
  note: string | null;
  createdAt: string;
};

export async function pushCustomerInfo(customerId: string): Promise<{ assigneeName: string }> {
  const access = await requireCustomerAccess();
  if (!access.canChangeAssignee) {
    throw new Error("고객정보 PUSH는 관리자만 사용할 수 있습니다.");
  }

  const normalizedCustomerId = customerId.trim();
  if (!normalizedCustomerId) throw new Error("고객 정보가 없습니다.");

  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, address, consultation_type, status, consultation_notes, assigned_employee_id, employees ( id, name, title, phone, email, is_active )",
    )
    .eq("id", normalizedCustomerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!customer) throw new Error("고객을 찾을 수 없습니다.");
  if (!customer.assigned_employee_id) throw new Error("담당자를 먼저 지정해 주세요.");

  const employee = Array.isArray(customer.employees)
    ? customer.employees[0] ?? null
    : customer.employees;
  if (!employee || employee.is_active !== true) {
    throw new Error("활성 담당자 정보를 확인할 수 없습니다.");
  }

  const assigneeName = [employee.name, employee.title].filter(Boolean).join(" ");
  const eventId = await enqueueNotificationEvent({
    event_type: "customer_assigned",
    customer_id: customer.id,
    recipient: employee.phone || employee.email || null,
    body: `[에잇티 고객정보] ${customer.name} / ${customer.phone} / ${customer.consultation_type ?? "상담"}`,
    payload: {
      source: "manual_customer_push",
      assigned_employee_id: customer.assigned_employee_id,
      assigned_employee_name: assigneeName,
      customer_name: customer.name,
      phone: customer.phone,
      address: customer.address,
      consultation_type: customer.consultation_type,
      status: customer.status,
      note: customer.consultation_notes,
      pushed_by_user_id: access.userId,
      pushed_by_employee_id: access.employeeId,
    },
  });

  if (!eventId) throw new Error("고객정보 PUSH 등록에 실패했습니다.");
  return { assigneeName };
}

export async function listMyCustomerPushes(limit = 10): Promise<CustomerPushItem[]> {
  const access = await requireCustomerAccess();
  if (!access.employeeId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_events")
    .select("id, customer_id, payload, created_at")
    .eq("event_type", "customer_assigned")
    .contains("payload", { assigned_employee_id: access.employeeId })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 30)));

  if (error) {
    console.error("[customer-push] list failed", error.message);
    return [];
  }

  return (data ?? []).flatMap((row) => {
    if (!row.customer_id) return [];
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return [
      {
        id: row.id as string,
        customerId: row.customer_id as string,
        customerName: String(payload.customer_name ?? "고객"),
        phone: String(payload.phone ?? ""),
        address: payload.address ? String(payload.address) : null,
        consultationType: payload.consultation_type
          ? String(payload.consultation_type)
          : null,
        status: payload.status ? String(payload.status) : null,
        note: payload.note ? String(payload.note) : null,
        createdAt: row.created_at as string,
      },
    ];
  });
}
