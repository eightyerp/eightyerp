"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  appendInquiryToExistingCustomer,
  consultationTypeEnumDiagnosticHint,
  createCustomer,
  createCustomerConsultLog,
  getLeadSources,
  isConsultationTypeEnumError,
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
import { canShowDevDiagnostics } from "@/lib/crm/dev-diagnostics";
import { findInquiryDuplicates, findPhoneDuplicates } from "@/lib/crm/inquiry-duplicates";
import type { DuplicateCandidate } from "@/lib/crm/inquiry-duplicates";
import type { InquiryMissingField } from "@/lib/crm/parse-inquiry";
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
  /** 개발환경 admin 전용 — SQL/경로 안내. production에서는 절대 설정하지 않음 */
  diagnosticHint?: string;
  message?: string;
  customerId?: string;
  parsed?: ParsedInquiryData;
  sourceType?: InquirySourceType;
  missingFields?: InquiryMissingField[];
  duplicates?: DuplicateCandidate[];
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

async function customerWriteFailureResult(
  error: unknown,
  fallback: string,
): Promise<ActionResult> {
  const message =
    error instanceof Error ? error.message : fallback;
  const access = await getCurrentUserAccess();
  const showDiag = canShowDevDiagnostics(access.isAdmin);

  return {
    success: false,
    error: message || fallback,
    diagnosticHint:
      showDiag && isConsultationTypeEnumError(message)
        ? consultationTypeEnumDiagnosticHint()
        : undefined,
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
    if (!input.assigned_employee_id) {
      return { success: false, error: "담당자를 선택해 주세요." };
    }

    const phoneDuplicates = await findPhoneDuplicates({ phone: input.phone });
    if (phoneDuplicates.length > 0) {
      return {
        success: false,
        error:
          "같은 연락처의 고객이 이미 있습니다. 기존 고객을 확인하거나 열어 주세요.",
        duplicates: phoneDuplicates,
      };
    }

    await createCustomer(input);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    redirect("/customers?created=1");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return customerWriteFailureResult(error, "고객 등록에 실패했습니다.");
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
    if (!input.assigned_employee_id) {
      return { success: false, error: "담당자를 선택해 주세요." };
    }

    const phoneDuplicates = await findPhoneDuplicates({
      phone: input.phone,
      excludeId: id,
    });
    if (phoneDuplicates.length > 0) {
      return {
        success: false,
        error:
          "같은 연락처의 고객이 이미 있습니다. 기존 고객을 확인하거나 열어 주세요.",
        duplicates: phoneDuplicates,
      };
    }

    await updateCustomer(id, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    revalidatePath(`/customers/${id}/edit`);
    revalidatePath("/dashboard");
    redirect("/customers?updated=1");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return customerWriteFailureResult(error, "고객 수정에 실패했습니다.");
  }
}

/** 수동 등록/수정 폼 — 연락처 soft 중복 확인 */
export async function checkCustomerPhoneDuplicateAction(
  phone: string,
  excludeId?: string | null,
): Promise<{ duplicates: DuplicateCandidate[] }> {
  const duplicates = await findPhoneDuplicates({
    phone,
    excludeId: excludeId || undefined,
  });
  return { duplicates };
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

    const { sourceType, parsed, missingFields } = parseInquiryText(rawText);
    const duplicates = await findInquiryDuplicates({
      source_order_no: parsed.source_order_no,
      phone: parsed.phone,
      name: parsed.name,
      address: parsed.address,
    });

    return {
      success: true,
      message: "내용 분석이 완료되었습니다. 미리보기를 확인한 뒤 등록해 주세요.",
      parsed,
      sourceType,
      missingFields,
      duplicates,
    };
  } catch {
    return {
      success: false,
      error: "내용 분석에 실패했습니다. 형식을 확인한 뒤 다시 시도해 주세요.",
    };
  }
}

function buildParsedFromInquiryForm(formData: FormData): ParsedInquiryData {
  const interestFromChecks = formData
    .getAll("interest_item")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const interestText = String(
    formData.get("interest_items_text") ?? formData.get("interest_items") ?? "",
  );
  const interestItems =
    interestFromChecks.length > 0
      ? interestFromChecks
      : parseInterestItemsInput(interestText);

  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    address: emptyToNull(formData.get("address")) ?? undefined,
    lead_source_name:
      String(formData.get("lead_source_name") ?? "").trim() || undefined,
    consultation_type: (formData.get("consultation_type") ||
      "기타") as ConsultationType,
    interest_items: interestItems,
    desired_timing: emptyToNull(formData.get("desired_timing")) ?? undefined,
    special_notes: emptyToNull(formData.get("special_notes")) ?? undefined,
    event_memo: emptyToNull(formData.get("event_memo")) ?? undefined,
    consultation_notes:
      emptyToNull(formData.get("consultation_notes")) ?? undefined,
    source_order_no:
      emptyToNull(formData.get("source_order_no")) ?? undefined,
    source_channel:
      emptyToNull(formData.get("source_channel")) ?? undefined,
    source_round: emptyToNull(formData.get("source_round")) ?? undefined,
    assigned_employee_id: emptyToNull(formData.get("assigned_employee_id")),
    status: (formData.get("status") || "신규") as CustomerStatus,
    next_contact_at: emptyToNull(formData.get("next_contact_at")),
    happy_call_required: formData.get("happy_call_required") === "true",
  };
}

export async function registerInquiryCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const rawText = String(formData.get("raw_text") ?? "").trim();
    const mode = String(formData.get("duplicate_mode") ?? "create").trim() as
      | "create"
      | "append"
      | "view";
    const existingId = String(formData.get("existing_customer_id") ?? "").trim();

    if (!rawText) {
      return { success: false, error: "원본 문의 내용이 필요합니다." };
    }

    const parsed = buildParsedFromInquiryForm(formData);
    if (!parsed.name || !parsed.phone) {
      return { success: false, error: "고객명과 연락처는 필수입니다." };
    }

    const sourceType = (formData.get("source_type") ||
      "other") as InquirySourceType;

    if (mode === "view" && existingId) {
      redirect(`/customers/${existingId}`);
    }

    if (mode === "append") {
      if (!existingId) {
        return { success: false, error: "기존 고객을 선택해 주세요." };
      }
      await appendInquiryToExistingCustomer({
        customer_id: existingId,
        raw_text: rawText,
        source_type: sourceType,
        parsed,
      });
      revalidatePath("/customers");
      revalidatePath(`/customers/${existingId}`);
      redirect(`/customers/${existingId}`);
    }

    // create — 강제 신규 또는 중복 없음
    const forceCreate = String(formData.get("force_create") ?? "") === "1";
    if (!forceCreate) {
      const duplicates = await findInquiryDuplicates({
        source_order_no: parsed.source_order_no,
        phone: parsed.phone,
        name: parsed.name,
        address: parsed.address,
      });
      if (duplicates.length > 0) {
        return {
          success: false,
          error: "중복 가능성이 있는 고객이 있습니다. 처리 방법을 선택해 주세요.",
          duplicates,
          parsed,
          sourceType,
        };
      }
    }

    if (!parsed.assigned_employee_id) {
      return { success: false, error: "담당자를 선택해 주세요." };
    }

    const sources = await getLeadSources();
    const leadSourceName = parsed.lead_source_name ?? "";
    const lead_source_id =
      emptyToNull(formData.get("lead_source_id")) ??
      (await resolveLeadSourceIdByName(leadSourceName, sources));

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
    const message =
      error instanceof Error ? error.message : "고객 등록에 실패했습니다.";
    // 개인정보 노출 방지
    if (/already|duplicate|23505|이미 등록된 연락처/i.test(message)) {
      return {
        success: false,
        error: "이미 등록된 고객일 수 있습니다. 중복 처리 방법을 선택해 주세요.",
      };
    }
    return {
      success: false,
      error: "고객 등록에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.",
    };
  }
}
