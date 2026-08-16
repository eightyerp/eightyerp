"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCustomerSchedule } from "@/lib/crm/customer-schedules";
import {
  createCustomerConsultLog,
  getCustomerById,
} from "@/lib/crm/customers";
import type { ConsultType } from "@/types/database";

const CONSULT_TYPES: ConsultType[] = [
  "전화",
  "방문",
  "카카오톡",
  "문자",
  "이메일",
  "기타",
];

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} 값이 필요합니다.`);
  return value;
}

function parseKoreaLocalDateTime(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    throw new Error("다음 연락 시간을 다시 확인해 주세요.");
  }
  const parsed = new Date(`${normalized}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("다음 연락 시간을 다시 확인해 주세요.");
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

  revalidatePath("/crm");
  revalidatePath("/crm/customers");
  revalidatePath(`/crm/customers/${customerId}`);
  redirect(`/crm/customers/${customerId}?saved=consult`);
}
