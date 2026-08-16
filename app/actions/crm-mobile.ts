"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  completeCustomerSchedule,
  createCustomerSchedule,
  getCustomerSchedule,
} from "@/lib/crm/customer-schedules";
import {
  createCustomer,
  createCustomerConsultLog,
  getCustomerById,
  updateCustomerQuickFields,
} from "@/lib/crm/customers";
import type {
  ConsultationType,
  ConsultType,
  CustomerStatus,
} from "@/types/database";

const CONSULT_TYPES: ConsultType[] = [
  "전화",
  "방문",
  "카카오톡",
  "문자",
  "이메일",
  "기타",
];

const CRM_CONSULTATION_TYPES: ConsultationType[] = [
  "창호",
  "종합인테리어",
  "부분인테리어",
  "주방",
  "욕실",
  "도배",
  "바닥재",
  "도어/중문",
  "기타",
];

const CRM_SCHEDULE_TYPES = [
  "전화상담",
  "방문상담",
  "실측",
  "견적작성",
  "견적발송",
  "계약상담",
  "재연락",
  "해피콜",
  "기타",
] as const;

const CRM_STATUS_OPTIONS: CustomerStatus[] = [
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
  "완료",
  "보류",
  "연락두절",
  "취소",
];

export type CrmCreateCustomerState = {
  success: boolean;
  error?: string;
};

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} 값이 필요합니다.`);
  return value;
}

function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function parseKoreaLocalDateTime(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    throw new Error("일정 시간을 다시 확인해 주세요.");
  }
  const parsed = new Date(`${normalized}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("일정 시간을 다시 확인해 주세요.");
  }
  return parsed.toISOString();
}

function koreaDateFromIso(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function revalidateCrmCustomer(customerId: string) {
  revalidatePath("/crm");
  revalidatePath("/crm/customers");
  revalidatePath("/crm/schedules");
  revalidatePath(`/crm/customers/${customerId}`);
  revalidatePath("/dashboard");
}

export async function createCrmCustomerAction(
  _prev: CrmCreateCustomerState,
  formData: FormData,
): Promise<CrmCreateCustomerState> {
  try {
    const name = requiredText(formData, "name");
    const phone = requiredText(formData, "phone");
    const consultationTypeRaw = String(
      formData.get("consultation_type") ?? "기타",
    ).trim();

    if (!CRM_CONSULTATION_TYPES.includes(consultationTypeRaw as ConsultationType)) {
      return { success: false, error: "상담유형을 다시 확인해 주세요." };
    }

    const customer = await createCustomer({
      name,
      phone,
      address: optionalText(formData, "address"),
      consultation_type: consultationTypeRaw as ConsultationType,
      status: "신규",
      lead_source_id: optionalText(formData, "lead_source_id"),
      assigned_employee_id: optionalText(formData, "assigned_employee_id"),
      consultation_notes: optionalText(formData, "consultation_notes"),
      next_contact_at: null,
      interest_items: [],
    });

    revalidatePath("/crm");
    revalidatePath("/crm/customers");
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    redirect(`/crm/customers/${customer.id}?created=1`);
  } catch (error) {
    // redirect()는 성공 시 throw 형태로 동작하므로 NEXT_REDIRECT는 그대로 전달한다.
    if (
      error instanceof Error &&
      (error.message === "NEXT_REDIRECT" || error.message.includes("NEXT_REDIRECT"))
    ) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객 등록에 실패했습니다.",
    };
  }
}

export async function createCrmScheduleAction(formData: FormData) {
  const customerId = requiredText(formData, "customer_id");
  const scheduleType = requiredText(formData, "schedule_type");
  const startRaw = requiredText(formData, "start_at");

  if (!CRM_SCHEDULE_TYPES.includes(scheduleType as (typeof CRM_SCHEDULE_TYPES)[number])) {
    throw new Error("일정 유형을 다시 확인해 주세요.");
  }

  const customer = await getCustomerById(customerId);
  if (!customer || customer.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }
  if (!customer.assigned_employee_id) {
    throw new Error("담당자를 먼저 지정한 뒤 일정을 등록해 주세요.");
  }

  const startAt = parseKoreaLocalDateTime(startRaw);
  const description = optionalText(formData, "description");
  const location = optionalText(formData, "location") || customer.address || null;
  const schedule = await createCustomerSchedule({
    customer_id: customerId,
    assigned_employee_id: customer.assigned_employee_id,
    schedule_type: scheduleType,
    title: `${customer.name} 고객 ${scheduleType}`,
    description,
    start_at: startAt,
    end_at: null,
    all_day: false,
    status: "예정",
    priority: "보통",
    location,
    result_note: null,
    customer_reaction: null,
    next_action: scheduleType === "재연락" ? "고객 재연락" : scheduleType,
    next_contact_at: null,
  });

  // 연락 성격 일정은 날짜 요약도 함께 맞춰 두되, 정확한 시간의 Source of Truth는 customer_schedules다.
  if (["전화상담", "재연락", "해피콜"].includes(scheduleType)) {
    try {
      await updateCustomerQuickFields({
        customer_id: customerId,
        next_contact_at: koreaDateFromIso(startAt),
      });
    } catch {
      // 정확한 일정 생성 성공을 날짜 요약 동기화 실패가 막지 않는다.
    }
  }

  revalidateCrmCustomer(customerId);
  revalidatePath(`/crm/schedules/${schedule.id}`);
  redirect(`/crm/schedules/${schedule.id}?created=1`);
}

export async function saveCrmConsultationAction(formData: FormData) {
  const customerId = requiredText(formData, "customer_id");
  const consultTypeRaw = requiredText(formData, "consult_type");
  const content = requiredText(formData, "consult_content");
  const nextContactRaw = String(formData.get("next_contact_at") ?? "").trim();

  if (!CONSULT_TYPES.includes(consultTypeRaw as ConsultType)) {
    throw new Error("상담 유형이 올바르지 않습니다.");
  }

  const customer = await getCustomerById(customerId);
  if (!customer || customer.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }

  let nextContactIso: string | null = null;
  let nextContactDate: string | null = null;
  if (nextContactRaw) {
    nextContactIso = parseKoreaLocalDateTime(nextContactRaw);
    nextContactDate = koreaDateFromIso(nextContactIso);
  }

  await createCustomerConsultLog({
    customer_id: customerId,
    consult_type: consultTypeRaw as ConsultType,
    consult_content: content,
    next_contact_date: nextContactDate,
  });

  // 직원이 첫 상담기록을 남겼는데 고객 상태가 계속 신규/미연락으로 남지 않게 자동 전진한다.
  // 이미 더 뒤 단계라면 상태를 되돌리지 않는다.
  if (customer.status === "신규" || customer.status === "미연락") {
    const nextStatus: CustomerStatus =
      consultTypeRaw === "방문" ? "상담중" : "1차 연락완료";
    try {
      await updateCustomerQuickFields({
        customer_id: customerId,
        status: nextStatus,
      });
    } catch {
      // 상담기록 자체는 성공했으므로 상태 자동전환 실패가 중복 입력을 유발하지 않게 한다.
    }
  }

  if (nextContactIso && customer.assigned_employee_id) {
    await createCustomerSchedule({
      customer_id: customerId,
      assigned_employee_id: customer.assigned_employee_id,
      schedule_type: "재연락",
      title: `${customer.name} 고객 재연락`,
      description: content,
      start_at: nextContactIso,
      end_at: null,
      all_day: false,
      status: "예정",
      priority: "보통",
      location: null,
      result_note: null,
      customer_reaction: null,
      next_action: "고객 재연락",
      next_contact_at: null,
    });
  }

  revalidateCrmCustomer(customerId);
  redirect(`/crm/customers/${customerId}?saved=consult`);
}

export async function updateCrmCustomerStatusAction(formData: FormData) {
  const customerId = requiredText(formData, "customer_id");
  const statusRaw = requiredText(formData, "status");

  if (!CRM_STATUS_OPTIONS.includes(statusRaw as CustomerStatus)) {
    throw new Error("고객 상태를 다시 확인해 주세요.");
  }

  await updateCustomerQuickFields({
    customer_id: customerId,
    status: statusRaw as CustomerStatus,
  });

  revalidateCrmCustomer(customerId);
  redirect(`/crm/customers/${customerId}?saved=status`);
}

export async function completeCrmScheduleAction(formData: FormData) {
  const scheduleId = requiredText(formData, "schedule_id");
  const customerId = requiredText(formData, "customer_id");
  const resultNote = requiredText(formData, "result_note");
  const nextContactRaw = String(formData.get("next_contact_at") ?? "").trim();

  const schedule = await getCustomerSchedule(scheduleId);
  if (!schedule || schedule.customer_id !== customerId) {
    throw new Error("처리할 고객 일정을 찾을 수 없습니다.");
  }

  let nextContactIso: string | null = null;
  let nextContactDate: string | null = null;
  if (nextContactRaw) {
    nextContactIso = parseKoreaLocalDateTime(nextContactRaw);
    nextContactDate = koreaDateFromIso(nextContactIso);
  }

  await completeCustomerSchedule({
    id: scheduleId,
    resultNote,
    customerReaction: null,
    nextAction: nextContactIso ? "고객 재연락" : "일정 완료",
    nextContactAt: null,
    updateCustomerStatus: null,
  });

  let followUpCreated = true;
  if (nextContactIso) {
    try {
      const customer = await getCustomerById(customerId);
      const assigneeId = schedule.assigned_employee_id || customer?.assigned_employee_id;
      if (!customer || !assigneeId) {
        followUpCreated = false;
      } else {
        await createCustomerSchedule({
          customer_id: customerId,
          assigned_employee_id: assigneeId,
          schedule_type: "재연락",
          title: `${customer.name} 고객 재연락`,
          description: resultNote,
          start_at: nextContactIso,
          end_at: null,
          all_day: false,
          status: "예정",
          priority: "보통",
          location: null,
          result_note: null,
          customer_reaction: null,
          next_action: "고객 재연락",
          next_contact_at: null,
        });
        if (nextContactDate) {
          try {
            await updateCustomerQuickFields({
              customer_id: customerId,
              next_contact_at: nextContactDate,
            });
          } catch {
            // 정확한 재연락 일정이 생성됐으면 고객 날짜 미러링 실패가 업무를 막지 않는다.
          }
        }
      }
    } catch {
      followUpCreated = false;
    }
  }

  revalidateCrmCustomer(customerId);
  revalidatePath(`/crm/schedules/${scheduleId}`);

  const followUpStatus = nextContactIso
    ? followUpCreated
      ? "created"
      : "failed"
    : "none";
  redirect(`/crm/schedules/${scheduleId}?completed=1&followup=${followUpStatus}`);
}
