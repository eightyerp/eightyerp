import { getCustomerAgeDays } from "@/lib/crm/customer-age";
import { requireCustomerAccess } from "@/lib/crm/customer-access";
import { toKoreaDateKey } from "@/lib/crm/korea-date";
import { createClient } from "@/lib/supabase-server";
import type { TodayWorkItem } from "@/lib/crm/today-work-shared";

const ACTIVE_STATUSES = [
  "신규",
  "미연락",
  "1차 연락완료",
  "상담중",
  "방문예약",
  "실측예약",
  "견적작성중",
  "견적제출",
  "계약협의",
  "계약완료",
  "계약",
  "시공예정",
  "시공중",
] as const;

const OPEN_SCHEDULE_STATUSES = ["예정", "진행중", "연기", "미처리"] as const;

type CandidateCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  status: string;
  assigned_employee_id: string | null;
  next_contact_at: string | null;
  created_at: string;
  employees:
    | { id: string; name: string; title: string | null }
    | { id: string; name: string; title: string | null }[]
    | null;
};

function employeeLabel(value: CandidateCustomer["employees"]): string | null {
  const employee = Array.isArray(value) ? value[0] ?? null : value;
  if (!employee) return null;
  return [employee.name, employee.title].filter(Boolean).join(" ");
}

export async function listCrmCustomersWithoutNextAction(input: {
  employeeId?: string | null;
  limit?: number;
} = {}): Promise<TodayWorkItem[]> {
  const access = await requireCustomerAccess();
  const supabase = await createClient();
  const employeeId = input.employeeId ?? access.employeeId;
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const todayKey = toKoreaDateKey(new Date());

  if (!access.canViewAllCompanyCustomers && !access.employeeId) return [];

  let customerQuery = supabase
    .from("customers")
    .select(
      "id, name, phone, address, status, assigned_employee_id, next_contact_at, created_at, employees ( id, name, title )",
    )
    .is("deleted_at", null)
    .in("status", [...ACTIVE_STATUSES])
    // 진행 고객 중 오늘 이후의 다음 연락일이 이미 잡힌 고객은 DB에서 제외한다.
    .or(`next_contact_at.is.null,next_contact_at.lt.${todayKey}`)
    .order("created_at", { ascending: true })
    .limit(100);

  if (employeeId) {
    customerQuery = customerQuery.eq("assigned_employee_id", employeeId);
  } else if (!access.canViewAllCompanyCustomers && access.employeeId) {
    customerQuery = customerQuery.eq("assigned_employee_id", access.employeeId);
  }

  const { data, error } = await customerQuery;
  if (error) throw new Error("다음 행동이 없는 고객을 확인하지 못했습니다.");

  const candidates = (data ?? []) as unknown as CandidateCustomer[];
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((customer) => customer.id);
  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("customer_schedules")
    .select("customer_id")
    .in("customer_id", candidateIds)
    .is("deleted_at", null)
    .in("status", [...OPEN_SCHEDULE_STATUSES])
    .limit(300);

  if (scheduleError) {
    throw new Error("고객의 예정 일정을 확인하지 못했습니다.");
  }

  // 과거 일정이라도 아직 미처리/진행중이면 그 일정 자체가 다음 행동이다.
  // 이 경우 별도 '다음 행동 없음' 경고를 중복 표시하지 않는다.
  const customersWithOpenSchedule = new Set(
    (scheduleRows ?? []).map((row) => String(row.customer_id)),
  );

  return candidates
    .filter((customer) => !customersWithOpenSchedule.has(customer.id))
    .slice(0, limit)
    .map((customer) => {
      const ageDays = getCustomerAgeDays(customer.created_at);
      return {
        id: `next-action:${customer.id}`,
        kind: "no_next_action",
        badge: "경고",
        title: "다음 행동 없음",
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        address: customer.address,
        employeeId: customer.assigned_employee_id,
        employeeName: employeeLabel(customer.employees),
        priority: ageDays >= 3 ? "높음" : "보통",
        status: customer.status,
        startAt: customer.created_at,
        dueAt: null,
        amount: null,
        memo: "다음 연락 또는 고객 일정을 등록해 주세요.",
        completedAt: null,
        source: "customer",
        sourceId: customer.id,
        isCompleted: false,
        isOverdue: false,
        isUrgent: ageDays >= 7,
      } satisfies TodayWorkItem;
    });
}
