"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  createCustomer,
  createCustomerConsultLog,
  getLeadSources,
  logPlaceholderAction,
  logQuickChannelActivity,
  permanentlyDeleteCustomer,
  registerConsultation,
  registerCustomerFromInquiry,
  resolveLeadSourceIdByName,
  restoreCustomer,
  softDeleteCustomer,
  updateChecklistItem,
  updateCustomer,
  updateCustomerQuickFields,
} from "@/lib/crm/customers";
import {
  parseInquiryText,
  parseInterestItemsInput,
} from "@/lib/crm/parse-inquiry";
import type {
  ActivityType,
  ConsultationType,
  ConsultType,
  CustomerInsert,
  CustomerStatus,
  InquirySourceType,
  ParsedInquiryData,
} from "@/types/database";

export type ActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  customerId?: string;
  parsed?: ParsedInquiryData;
  sourceType?: InquirySourceType;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function formDataToCustomerInsert(formData: FormData): CustomerInsert {
  const interestFromChecks = formData
    .getAll("interest_items")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    address: emptyToNull(formData.get("address")),
    consultation_type: (formData.get("consultation_type") ||
      "기타") as ConsultationType,
    status: (formData.get("status") || "신규") as CustomerStatus,
    lead_source_id: emptyToNull(formData.get("lead_source_id")),
    assigned_employee_id: emptyToNull(formData.get("assigned_employee_id")),
    consultation_notes: emptyToNull(formData.get("consultation_notes")),
    next_contact_at: emptyToNull(formData.get("next_contact_at")),
    interest_items:
      interestFromChecks.length > 0
        ? interestFromChecks
        : parseInterestItemsInput(String(formData.get("interest_items") ?? "")),
    desired_timing: emptyToNull(formData.get("desired_timing")),
    special_notes: emptyToNull(formData.get("special_notes")),
    happy_call_required: formData.get("happy_call_required") === "true",
  };
}

export async function createCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const input = formDataToCustomerInsert(formData);
    if (!input.name || !input.phone) {
      return { success: false, error: "고객명과 연락처는 필수입니다." };
    }

    await createCustomer(input);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    redirect("/customers?created=1");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객 등록에 실패했습니다.",
    };
  }
}

export async function updateCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { success: false, error: "고객 ID가 없습니다." };

    const input = formDataToCustomerInsert(formData);
    if (!input.name || !input.phone) {
      return { success: false, error: "고객명과 연락처는 필수입니다." };
    }

    await updateCustomer(id, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    revalidatePath(`/customers/${id}/edit`);
    revalidatePath("/dashboard");
    redirect("/customers?updated=1");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객 수정에 실패했습니다.",
    };
  }
}

export async function softDeleteCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!id) return { success: false, error: "고객 ID가 없습니다." };

    await softDeleteCustomer({ id, reason });
    revalidatePath("/customers");
    revalidatePath("/customers/trash");
    revalidatePath("/dashboard");
    redirect("/customers?deleted=1");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객 삭제에 실패했습니다.",
    };
  }
}

export async function restoreCustomerAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  await restoreCustomer(id);
  revalidatePath("/customers");
  revalidatePath("/customers/trash");
  revalidatePath("/dashboard");
  redirect("/customers/trash?restored=1");
}

export async function permanentlyDeleteCustomerAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  await permanentlyDeleteCustomer(id);
  revalidatePath("/customers");
  revalidatePath("/customers/trash");
  redirect("/customers/trash?purged=1");
}

export async function toggleChecklistAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const isCompleted = formData.get("is_completed") === "true";
  const note = emptyToNull(formData.get("note"));

  await updateChecklistItem({
    id,
    is_completed: isCompleted,
    note,
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

export async function addActivityAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const activityType = String(formData.get("activity_type") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const result = emptyToNull(formData.get("result"));
    const nextContactAt = emptyToNull(formData.get("next_contact_at"));
    const statusRaw = emptyToNull(formData.get("status"));
    const employeeId = emptyToNull(formData.get("employee_id"));

    if (!customerId || !activityType || !content) {
      return { success: false, error: "필수 항목을 입력해 주세요." };
    }

    await registerConsultation({
      customer_id: customerId,
      activity_type: activityType as ActivityType,
      content,
      result,
      next_contact_at: nextContactAt,
      status: (statusRaw as CustomerStatus | null) || null,
      employee_id: employeeId,
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { success: true, message: "상담 이력이 등록되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "이력 등록에 실패했습니다.",
    };
  }
}

export async function addConsultLogAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const consultType = String(formData.get("consult_type") ?? "").trim();
    const content = String(formData.get("consult_content") ?? "").trim();
    const nextContactDate = emptyToNull(formData.get("next_contact_date"));

    if (!customerId || !consultType || !content) {
      return { success: false, error: "상담유형과 상담내용은 필수입니다." };
    }

    await createCustomerConsultLog({
      customer_id: customerId,
      consult_type: consultType as ConsultType,
      consult_content: content,
      next_contact_date: nextContactDate,
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { success: true, message: "상담이력이 등록되었습니다." };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "상담이력 등록에 실패했습니다.",
    };
  }
}

export async function quickUpdateCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const mode = String(formData.get("mode") ?? "").trim();

    if (!customerId || !mode) {
      return { success: false, error: "필수 정보가 없습니다." };
    }

    if (mode === "status") {
      const status = emptyToNull(formData.get("status")) as CustomerStatus | null;
      if (!status) return { success: false, error: "상담상태를 선택해 주세요." };
      await updateCustomerQuickFields({ customer_id: customerId, status });
    } else if (mode === "assignee") {
      await updateCustomerQuickFields({
        customer_id: customerId,
        assigned_employee_id: emptyToNull(formData.get("assigned_employee_id")),
        change_assignee: true,
      });
    } else if (mode === "next_contact") {
      await updateCustomerQuickFields({
        customer_id: customerId,
        next_contact_at: emptyToNull(formData.get("next_contact_at")),
      });
    } else if (mode === "placeholder") {
      const label = String(formData.get("action_label") ?? "기능").trim();
      await logPlaceholderAction({
        customer_id: customerId,
        action_label: label,
      });
    } else {
      return { success: false, error: "지원하지 않는 작업입니다." };
    }

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { success: true, message: "저장되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "저장에 실패했습니다.",
    };
  }
}

export async function quickChannelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const activityType = String(formData.get("activity_type") ?? "").trim() as
      | "전화"
      | "문자"
      | "카카오톡";

    if (!customerId || !activityType) {
      return { success: false, error: "필수 정보가 없습니다." };
    }

    await logQuickChannelActivity({
      customer_id: customerId,
      activity_type: activityType,
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return {
      success: true,
      message: `${activityType} 시도가 기록되었습니다.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "기록에 실패했습니다.",
    };
  }
}

export async function analyzeInquiryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const rawText = String(formData.get("raw_text") ?? "").trim();
    if (!rawText) {
      return { success: false, error: "문의 내용을 입력해 주세요." };
    }

    const { sourceType, parsed } = parseInquiryText(rawText);
    return {
      success: true,
      message: "내용 분석이 완료되었습니다.",
      parsed,
      sourceType,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "분석에 실패했습니다.",
    };
  }
}

export async function registerInquiryCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const rawText = String(formData.get("raw_text") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    if (!rawText) {
      return { success: false, error: "원본 문의 내용이 필요합니다." };
    }
    if (!name || !phone) {
      return { success: false, error: "고객명과 연락처는 필수입니다." };
    }

    const sources = await getLeadSources();
    const leadSourceName = String(formData.get("lead_source_name") ?? "");
    const lead_source_id =
      emptyToNull(formData.get("lead_source_id")) ??
      (await resolveLeadSourceIdByName(leadSourceName, sources));

    const sourceType = (formData.get("source_type") ||
      "other") as InquirySourceType;

    const parsed: ParsedInquiryData = {
      name,
      phone,
      address: emptyToNull(formData.get("address")) ?? undefined,
      lead_source_name: leadSourceName || undefined,
      consultation_type: (formData.get("consultation_type") ||
        "기타") as ConsultationType,
      interest_items: parseInterestItemsInput(
        String(formData.get("interest_items") ?? ""),
      ),
      desired_timing: emptyToNull(formData.get("desired_timing")) ?? undefined,
      special_notes: emptyToNull(formData.get("special_notes")) ?? undefined,
      event_memo: emptyToNull(formData.get("event_memo")) ?? undefined,
      consultation_notes:
        emptyToNull(formData.get("consultation_notes")) ?? undefined,
      assigned_employee_id: emptyToNull(formData.get("assigned_employee_id")),
      status: (formData.get("status") || "신규") as CustomerStatus,
      next_contact_at: emptyToNull(formData.get("next_contact_at")),
      happy_call_required: formData.get("happy_call_required") === "true",
    };

    const customer = await registerCustomerFromInquiry({
      raw_text: rawText,
      source_type: sourceType,
      parsed,
      lead_source_id,
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");
    redirect(`/customers/${customer.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "고객 등록에 실패했습니다.",
    };
  }
}
