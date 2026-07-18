"use server";

import { revalidatePath } from "next/cache";
import {
  completeCustomerSchedule,
  createCustomerSchedule,
  findCustomerScheduleConflicts,
  getCustomerSchedule,
  moveCustomerSchedule,
  parseCustomerScheduleForm,
  softDeleteCustomerSchedule,
  toScheduleSafeError,
  updateCustomerSchedule,
} from "@/lib/crm/customer-schedules";
import {
  createProcessSchedule,
  findProcessAssigneeConflicts,
  findProjectOverlaps,
  moveProcessSchedule,
  parseProcessScheduleForm,
  softDeleteProcessSchedule,
  updateProcessSchedule,
} from "@/lib/crm/process-schedules";
import type { CustomerSchedule } from "@/types/database";

export type ScheduleActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  id?: string;
  /** 저장 후 관계 포함 전체 일정 (부분 패치 금지) */
  schedule?: CustomerSchedule;
  conflicts?: { id: string; title: string; start_at: string }[];
  warnings?: string[];
};

function revalidateSchedules(customerId?: string | null, projectId?: string | null) {
  revalidatePath("/schedules/customers");
  revalidatePath("/schedules/processes");
  revalidatePath("/dashboard");
  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/customers/${customerId}/schedules`);
  }
  if (projectId) {
    revalidatePath(`/projects/${projectId}/schedule`);
  }
}

export async function createCustomerScheduleAction(
  _prev: ScheduleActionResult,
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const form = parseCustomerScheduleForm(formData);
    const force = String(formData.get("force_save") ?? "") === "1";
    const conflicts = await findCustomerScheduleConflicts({
      assignedEmployeeId: form.assigned_employee_id,
      startAt: form.start_at,
      endAt: form.end_at,
    });
    if (conflicts.length && !force) {
      return {
        success: false,
        error: "담당자 일정이 겹칩니다. 확인 후 다시 저장할 수 있습니다.",
        conflicts: conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          start_at: c.start_at,
        })),
      };
    }
    const row = await createCustomerSchedule(form);
    revalidateSchedules(form.customer_id);
    return {
      success: true,
      message: "상담 일정이 등록되었습니다.",
      id: row.id,
      schedule: row,
    };
  } catch (error) {
    console.error("[createCustomerScheduleAction]", error);
    return {
      success: false,
      error: toScheduleSafeError(error, "일정 등록에 실패했습니다."),
    };
  }
}

/** 관계 포함 일정 1건 재조회 (클라이언트 목록/상세 동기화용) */
export async function fetchCustomerScheduleAction(
  id: string,
): Promise<{ success: true; schedule: CustomerSchedule } | { success: false; error: string }> {
  try {
    const schedule = await getCustomerSchedule(id);
    if (!schedule) {
      return { success: false, error: "일정을 찾을 수 없습니다." };
    }
    return { success: true, schedule };
  } catch (error) {
    console.error("[fetchCustomerScheduleAction]", error);
    return {
      success: false,
      error: toScheduleSafeError(error, "일정을 불러오지 못했습니다."),
    };
  }
}

export async function updateCustomerScheduleAction(
  _prev: ScheduleActionResult,
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const id = String(formData.get("schedule_id") ?? "").trim();
    if (!id) return { success: false, error: "일정 ID가 없습니다." };
    const form = parseCustomerScheduleForm(formData);
    const force = String(formData.get("force_save") ?? "") === "1";
    const conflicts = await findCustomerScheduleConflicts({
      assignedEmployeeId: form.assigned_employee_id,
      startAt: form.start_at,
      endAt: form.end_at,
      excludeId: id,
    });
    if (conflicts.length && !force) {
      return {
        success: false,
        error: "담당자 일정이 겹칩니다. 확인 후 다시 저장할 수 있습니다.",
        conflicts: conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          start_at: c.start_at,
        })),
      };
    }
    const row = await updateCustomerSchedule({ id, form });
    revalidateSchedules(form.customer_id);
    return {
      success: true,
      message: "일정이 수정되었습니다.",
      id: row.id,
      schedule: row,
    };
  } catch (error) {
    console.error("[updateCustomerScheduleAction]", error);
    return {
      success: false,
      error: toScheduleSafeError(error, "일정 수정에 실패했습니다."),
    };
  }
}

export async function moveCustomerScheduleAction(input: {
  id: string;
  startAt: string;
  endAt?: string | null;
  customerId?: string;
  force?: boolean;
}): Promise<ScheduleActionResult> {
  try {
    const existing = await getCustomerScheduleForMove(input.id);
    if (!existing) {
      return { success: false, error: "일정을 찾을 수 없습니다." };
    }
    const conflicts = await findCustomerScheduleConflicts({
      assignedEmployeeId: existing.assigned_employee_id,
      startAt: input.startAt,
      endAt: input.endAt ?? existing.end_at,
      excludeId: input.id,
    });
    if (conflicts.length && !input.force) {
      return {
        success: false,
        error: "이동 시간에 담당자 일정이 겹칩니다. 확인 후 강제 이동할 수 있습니다.",
        conflicts: conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          start_at: c.start_at,
        })),
      };
    }
    await moveCustomerSchedule(input);
    revalidateSchedules(input.customerId ?? existing.customer_id);
    return { success: true, message: "일정이 이동되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "일정 이동에 실패했습니다."),
    };
  }
}

async function getCustomerScheduleForMove(id: string) {
  const { getCustomerSchedule } = await import("@/lib/crm/customer-schedules");
  return getCustomerSchedule(id);
}

export async function completeCustomerScheduleAction(
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const id = String(formData.get("schedule_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    if (!id) return { success: false, error: "일정 ID가 없습니다." };
    const row = await completeCustomerSchedule({
      id,
      resultNote: String(formData.get("result_note") ?? ""),
      customerReaction: String(formData.get("customer_reaction") ?? ""),
      nextAction: String(formData.get("next_action") ?? ""),
      nextContactAt: String(formData.get("next_contact_at") ?? "").trim() || null,
      updateCustomerStatus:
        String(formData.get("update_customer_status") ?? "").trim() || null,
    });
    revalidateSchedules(customerId || row.customer_id);
    return { success: true, message: "일정이 완료 처리되었습니다.", id };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "완료 처리에 실패했습니다."),
    };
  }
}

export async function deleteCustomerScheduleAction(
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const id = String(formData.get("schedule_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteCustomerSchedule({ id, deleteReason });
    revalidateSchedules(customerId);
    return { success: true, message: "일정이 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "일정 삭제에 실패했습니다."),
    };
  }
}

export async function createProcessScheduleAction(
  _prev: ScheduleActionResult,
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const form = parseProcessScheduleForm(formData);
    const force = String(formData.get("force_save") ?? "") === "1";
    const warnings: string[] = [];
    if (form.assigned_employee_id) {
      const conflicts = await findProcessAssigneeConflicts({
        assignedEmployeeId: form.assigned_employee_id,
        startAt: form.start_at,
        endAt: form.end_at,
      });
      if (conflicts.length && !force) {
        return {
          success: false,
          error: "담당자 공정 일정이 겹칩니다. 확인 후 저장할 수 있습니다.",
          conflicts: conflicts.map((c) => ({
            id: c.id,
            title: c.title,
            start_at: c.start_at,
          })),
        };
      }
    }
    if (form.project_id) {
      const overlaps = await findProjectOverlaps({
        projectId: form.project_id,
        startAt: form.start_at,
        endAt: form.end_at,
      });
      if (overlaps.length) {
        warnings.push("같은 현장에 겹치는 공정이 있습니다. (저장은 가능)");
      }
    }
    const row = await createProcessSchedule(form);
    revalidateSchedules(form.customer_id, form.project_id);
    return {
      success: true,
      message: "공정 일정이 등록되었습니다.",
      id: row.id,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "공정 일정 등록에 실패했습니다."),
    };
  }
}

export async function updateProcessScheduleAction(
  _prev: ScheduleActionResult,
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const id = String(formData.get("schedule_id") ?? "").trim();
    if (!id) return { success: false, error: "일정 ID가 없습니다." };
    const form = parseProcessScheduleForm(formData);
    const force = String(formData.get("force_save") ?? "") === "1";
    const warnings: string[] = [];
    if (form.assigned_employee_id) {
      const conflicts = await findProcessAssigneeConflicts({
        assignedEmployeeId: form.assigned_employee_id,
        startAt: form.start_at,
        endAt: form.end_at,
        excludeId: id,
      });
      if (conflicts.length && !force) {
        return {
          success: false,
          error: "담당자 공정 일정이 겹칩니다. 확인 후 저장할 수 있습니다.",
          conflicts: conflicts.map((c) => ({
            id: c.id,
            title: c.title,
            start_at: c.start_at,
          })),
        };
      }
    }
    if (form.project_id) {
      const overlaps = await findProjectOverlaps({
        projectId: form.project_id,
        startAt: form.start_at,
        endAt: form.end_at,
        excludeId: id,
      });
      if (overlaps.length) {
        warnings.push("같은 현장에 겹치는 공정이 있습니다. (저장은 가능)");
      }
    }
    await updateProcessSchedule({ id, form });
    revalidateSchedules(form.customer_id, form.project_id);
    return {
      success: true,
      message: "공정 일정이 수정되었습니다.",
      id,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "공정 일정 수정에 실패했습니다."),
    };
  }
}

export async function moveProcessScheduleAction(input: {
  id: string;
  startAt: string;
  endAt?: string | null;
  customerId?: string;
  projectId?: string | null;
}): Promise<ScheduleActionResult> {
  try {
    await moveProcessSchedule(input);
    revalidateSchedules(input.customerId, input.projectId);
    return { success: true, message: "공정 일정이 이동되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "공정 일정 이동에 실패했습니다."),
    };
  }
}

export async function deleteProcessScheduleAction(
  formData: FormData,
): Promise<ScheduleActionResult> {
  try {
    const id = String(formData.get("schedule_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteProcessSchedule({ id, deleteReason });
    revalidateSchedules(customerId, projectId || null);
    return { success: true, message: "공정 일정이 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "공정 일정 삭제에 실패했습니다."),
    };
  }
}
