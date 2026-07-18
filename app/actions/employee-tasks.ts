"use server";

import { revalidatePath } from "next/cache";
import {
  completeEmployeeTask,
  createEmployeeTask,
  parseEmployeeTaskForm,
  softDeleteEmployeeTask,
  toTaskSafeError,
} from "@/lib/crm/employee-tasks";
import {
  logQuickChannelActivity,
  updateCustomerQuickFields,
} from "@/lib/crm/customers";
import {
  getCustomerSchedule,
  updateCustomerSchedule,
  toScheduleSafeError,
} from "@/lib/crm/customer-schedules";

export type TaskActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function revalidateToday(customerId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/schedules/customers");
  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/customers/${customerId}/schedules`);
  }
}

export async function createEmployeeTaskAction(
  _prev: TaskActionResult,
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const form = parseEmployeeTaskForm(formData);
    const row = await createEmployeeTask(form);
    revalidateToday(form.customer_id);
    return { success: true, message: "할 일이 등록되었습니다.", id: row.id };
  } catch (error) {
    return {
      success: false,
      error: toTaskSafeError(error, "할 일 등록에 실패했습니다."),
    };
  }
}

export async function completeEmployeeTaskAction(
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const id = String(formData.get("task_id") ?? "").trim();
    if (!id) return { success: false, error: "할 일 ID가 없습니다." };
    const row = await completeEmployeeTask(id);
    revalidateToday(row.customer_id);
    return { success: true, message: "할 일을 완료했습니다.", id };
  } catch (error) {
    return {
      success: false,
      error: toTaskSafeError(error, "완료 처리에 실패했습니다."),
    };
  }
}

export async function deleteEmployeeTaskAction(
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const id = String(formData.get("task_id") ?? "").trim();
    const reason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteEmployeeTask({ id, deleteReason: reason });
    revalidateToday();
    return { success: true, message: "할 일이 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toTaskSafeError(error, "삭제에 실패했습니다."),
    };
  }
}

/** 오늘 다음 연락 고객 — 전화 완료 기록 */
export async function markPhoneCompleteAction(
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    if (!customerId) return { success: false, error: "고객 ID가 없습니다." };
    const note = String(formData.get("note") ?? "").trim();

    await logQuickChannelActivity({
      customer_id: customerId,
      activity_type: "전화",
      content: note || "오늘 할 일 대시보드에서 전화 완료 처리했습니다.",
    });

    // 다음 연락일 비우거나 유지 — 오늘은 처리했으므로 당일 할 일에서 빠지도록 null
    await updateCustomerQuickFields({
      customer_id: customerId,
      next_contact_at: null,
    });

    revalidateToday(customerId);
    return { success: true, message: "전화 완료가 기록되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "전화 완료 기록에 실패했습니다."),
    };
  }
}

/** 미처리 일정을 오늘로 연기 */
export async function postponeScheduleToTodayAction(
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const id = String(formData.get("schedule_id") ?? "").trim();
    if (!id) return { success: false, error: "일정 ID가 없습니다." };
    const existing = await getCustomerSchedule(id);
    if (!existing) return { success: false, error: "일정을 찾을 수 없습니다." };

    const old = new Date(existing.start_at);
    const today = new Date();
    today.setHours(old.getHours(), old.getMinutes(), old.getSeconds(), 0);
    let endAt: string | null = null;
    if (existing.end_at) {
      const duration =
        new Date(existing.end_at).getTime() - new Date(existing.start_at).getTime();
      endAt = new Date(today.getTime() + duration).toISOString();
    }

    await updateCustomerSchedule({
      id,
      form: {
        customer_id: existing.customer_id,
        assigned_employee_id: existing.assigned_employee_id,
        schedule_type: existing.schedule_type,
        title: existing.title,
        description: existing.description,
        start_at: today.toISOString(),
        end_at: endAt,
        all_day: existing.all_day,
        status: "예정",
        priority: existing.priority,
        location: existing.location,
        result_note: existing.result_note,
        customer_reaction: existing.customer_reaction ?? null,
        next_action: existing.next_action ?? null,
        next_contact_at: existing.next_contact_at,
      },
    });

    revalidateToday(existing.customer_id);
    return { success: true, message: "일정을 오늘로 연기했습니다." };
  } catch (error) {
    return {
      success: false,
      error: toScheduleSafeError(error, "연기 처리에 실패했습니다."),
    };
  }
}

export async function refreshDashboardAction(): Promise<TaskActionResult> {
  revalidatePath("/dashboard");
  return { success: true, message: "대시보드를 새로고침했습니다." };
}
