import { createClient } from "@/lib/supabase-server";
import {
  assertAssigneeInScope,
  canSoftDeleteSchedule,
  getScheduleAccess,
  type ScheduleAccess,
} from "@/lib/crm/schedule-access";
import {
  CUSTOMER_SCHEDULE_STATUSES,
  CUSTOMER_SCHEDULE_TYPES,
  SCHEDULE_PRIORITIES,
  type ScheduleAlertType,
} from "@/lib/crm/schedule-constants";
import type { CustomerSchedule } from "@/types/database";
import {
  canEditCustomerSchedule,
  isCustomerScheduleOverdue,
} from "@/lib/crm/schedule-utils";

export { isCustomerScheduleOverdue };

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export type CustomerScheduleForm = {
  customer_id: string;
  assigned_employee_id: string;
  schedule_type: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  status: string;
  priority: string;
  location: string | null;
  result_note: string | null;
  customer_reaction: string | null;
  next_action: string | null;
  next_contact_at: string | null;
};

export function parseCustomerScheduleForm(
  formData: FormData,
): CustomerScheduleForm {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const assignee = String(formData.get("assigned_employee_id") ?? "").trim();
  const scheduleType = String(formData.get("schedule_type") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const startAt = String(formData.get("start_at") ?? "").trim();
  const status = String(formData.get("status") ?? "예정").trim() || "예정";
  const priority = String(formData.get("priority") ?? "보통").trim() || "보통";

  if (!customerId) throw new Error("고객을 선택해 주세요.");
  if (!assignee) throw new Error("담당자를 선택해 주세요.");
  if (!(CUSTOMER_SCHEDULE_TYPES as readonly string[]).includes(scheduleType)) {
    throw new Error("일정유형이 올바르지 않습니다.");
  }
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (!startAt) throw new Error("시작일시를 입력해 주세요.");
  if (!(CUSTOMER_SCHEDULE_STATUSES as readonly string[]).includes(status)) {
    throw new Error("상태가 올바르지 않습니다.");
  }
  if (!(SCHEDULE_PRIORITIES as readonly string[]).includes(priority)) {
    throw new Error("우선순위가 올바르지 않습니다.");
  }

  const startIso = new Date(startAt).toISOString();
  const endRaw = emptyToNull(String(formData.get("end_at") ?? ""));
  const endIso = endRaw ? new Date(endRaw).toISOString() : null;
  if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
    throw new Error("종료시간은 시작시간보다 빠를 수 없습니다.");
  }

  return {
    customer_id: customerId,
    assigned_employee_id: assignee,
    schedule_type: scheduleType,
    title,
    description: emptyToNull(String(formData.get("description") ?? "")),
    start_at: startIso,
    end_at: endIso,
    all_day: ["on", "true", "1"].includes(
      String(formData.get("all_day") ?? "").toLowerCase(),
    ),
    status,
    priority,
    location: emptyToNull(String(formData.get("location") ?? "")),
    result_note: emptyToNull(String(formData.get("result_note") ?? "")),
    customer_reaction: emptyToNull(
      String(formData.get("customer_reaction") ?? ""),
    ),
    next_action: emptyToNull(String(formData.get("next_action") ?? "")),
    next_contact_at: emptyToNull(String(formData.get("next_contact_at") ?? ""))
      ? new Date(String(formData.get("next_contact_at"))).toISOString()
      : null,
  };
}

const SELECT =
  "*, customers ( id, name, phone, address, status ), employees ( id, name, title, team_id )";

export type CustomerScheduleFilters = {
  from?: string;
  to?: string;
  employeeId?: string;
  teamId?: string;
  scheduleType?: string;
  status?: string;
  priority?: string;
  customerId?: string;
  q?: string;
  unhandledOnly?: boolean;
  todayOnly?: boolean;
  nextContactOnly?: boolean;
};

export async function listCustomerSchedules(
  filters: CustomerScheduleFilters = {},
  access?: ScheduleAccess,
): Promise<CustomerSchedule[]> {
  const sch = access ?? (await getScheduleAccess());
  const supabase = await createClient();

  let query = supabase
    .from("customer_schedules")
    .select(SELECT)
    .is("deleted_at", null)
    .order("start_at", { ascending: true })
    .limit(800);

  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.scheduleType) query = query.eq("schedule_type", filters.scheduleType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.from) query = query.gte("start_at", filters.from);
  if (filters.to) query = query.lte("start_at", filters.to);

  if (sch.canViewAll) {
    if (filters.employeeId) {
      query = query.eq("assigned_employee_id", filters.employeeId);
    }
  } else if (sch.canViewTeam && sch.teamId) {
    // filter team in JS after fetch of team employees, or filter assignee list
    if (filters.employeeId) {
      await assertAssigneeInScope(sch, filters.employeeId);
      query = query.eq("assigned_employee_id", filters.employeeId);
    }
  } else if (sch.employeeId) {
    query = query.eq("assigned_employee_id", sch.employeeId);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error("상담 일정을 불러오지 못했습니다.");

  let rows = (data ?? []) as CustomerSchedule[];

  if (!sch.canViewAll && sch.canViewTeam && sch.teamId && !filters.employeeId) {
    rows = rows.filter((r) => r.employees?.team_id === sch.teamId);
  }

  if (filters.teamId && sch.canViewAll) {
    rows = rows.filter((r) => r.employees?.team_id === filters.teamId);
  }

  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [
        r.customers?.name,
        r.customers?.phone,
        r.customers?.address,
        r.title,
        r.description,
        r.result_note,
        r.customer_reaction,
        r.next_action,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }

  if (filters.todayOnly) {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());
    rows = rows.filter((r) => {
      const t = new Date(r.start_at).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
  }

  if (filters.unhandledOnly) {
    rows = rows.filter((r) => {
      if (r.status === "미처리") return true;
      if (
        ["예정", "진행중"].includes(r.status) &&
        new Date(r.start_at).getTime() < Date.now()
      ) {
        return true;
      }
      if (r.status === "연기") {
        const start = new Date(r.start_at).getTime();
        return !rows.some(
          (o) =>
            o.id !== r.id &&
            o.customer_id === r.customer_id &&
            o.status !== "취소" &&
            new Date(o.start_at).getTime() > start,
        );
      }
      if (r.next_contact_at && !["완료", "취소"].includes(r.status)) {
        const next = new Date(r.next_contact_at).getTime();
        if (next < Date.now()) {
          return !rows.some(
            (o) =>
              o.id !== r.id &&
              o.customer_id === r.customer_id &&
              !["취소", "완료"].includes(o.status) &&
              new Date(o.start_at).getTime() >= next,
          );
        }
      }
      return false;
    });
  }

  if (filters.nextContactOnly) {
    rows = rows.filter((r) => Boolean(r.next_contact_at));
  }

  return rows;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function getCustomerSchedule(
  id: string,
): Promise<CustomerSchedule | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_schedules")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("일정을 불러오지 못했습니다.");
  return data as CustomerSchedule | null;
}

export async function findCustomerScheduleConflicts(input: {
  assignedEmployeeId: string;
  startAt: string;
  endAt?: string | null;
  excludeId?: string;
}): Promise<CustomerSchedule[]> {
  const start = new Date(input.startAt).getTime();
  const end = input.endAt
    ? new Date(input.endAt).getTime()
    : start + 60 * 60 * 1000;
  const list = await listCustomerSchedules({
    employeeId: input.assignedEmployeeId,
    from: new Date(start - 7 * 86400000).toISOString(),
    to: new Date(end + 7 * 86400000).toISOString(),
  });
  return list.filter((s) => {
    if (input.excludeId && s.id === input.excludeId) return false;
    if (["취소", "완료"].includes(s.status)) return false;
    const sStart = new Date(s.start_at).getTime();
    const sEnd = s.end_at
      ? new Date(s.end_at).getTime()
      : sStart + 60 * 60 * 1000;
    return sStart < end && sEnd > start;
  });
}

async function queueAlert(
  eventType: ScheduleAlertType,
  schedule: CustomerSchedule,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = await createClient();
    await supabase.from("schedule_alert_events").insert({
      event_type: eventType,
      schedule_kind: "customer",
      schedule_id: schedule.id,
      customer_id: schedule.customer_id,
      assigned_employee_id: schedule.assigned_employee_id,
      payload,
      status: "pending",
    });
  } catch {
    // 알림 테이블 미적용 시 무시
  }
}

function toCustomerScheduleWritePayload(
  form: CustomerScheduleForm,
  userId: string | null,
  options?: { includeOptionalColumns?: boolean },
) {
  const base = {
    customer_id: form.customer_id,
    assigned_employee_id: form.assigned_employee_id,
    schedule_type: form.schedule_type,
    title: form.title,
    description: form.description,
    start_at: form.start_at,
    end_at: form.end_at,
    all_day: form.all_day,
    status: form.status,
    priority: form.priority,
    location: form.location,
    result_note: form.result_note,
    next_contact_at: form.next_contact_at,
    updated_by: userId,
  };
  if (options?.includeOptionalColumns === false) {
    return base;
  }
  return {
    ...base,
    customer_reaction: form.customer_reaction,
    next_action: form.next_action,
  };
}

function isMissingOptionalScheduleColumnError(message: string): boolean {
  return /customer_reaction|next_action/i.test(message);
}

export async function createCustomerSchedule(
  form: CustomerScheduleForm,
): Promise<CustomerSchedule> {
  const access = await getScheduleAccess();
  await assertAssigneeInScope(access, form.assigned_employee_id);

  if (!access.canViewAll && form.assigned_employee_id !== access.employeeId) {
    if (!access.canViewTeam) {
      throw new Error("본인 담당 일정만 등록할 수 있습니다.");
    }
  }

  const supabase = await createClient();
  const fullPayload = {
    ...toCustomerScheduleWritePayload(form, access.userId),
    created_by: access.userId,
  };

  let { data, error } = await supabase
    .from("customer_schedules")
    .insert(fullPayload)
    .select("id")
    .single();

  if (
    error &&
    isMissingOptionalScheduleColumnError(error.message ?? "")
  ) {
    const fallbackPayload = {
      ...toCustomerScheduleWritePayload(form, access.userId, {
        includeOptionalColumns: false,
      }),
      created_by: access.userId,
    };
    const retry = await supabase
      .from("customer_schedules")
      .insert(fallbackPayload)
      .select("id")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    console.error("[createCustomerSchedule]", error);
    throw new Error(error?.message || "일정 등록에 실패했습니다.");
  }
  const created = await getCustomerSchedule(data.id);
  if (!created) {
    throw new Error(
      "일정은 저장되었으나 조회에 실패했습니다. 목록을 새로고침해 주세요.",
    );
  }
  await queueAlert("schedule_changed", created, { action: "create" });
  return created;
}

export async function updateCustomerSchedule(input: {
  id: string;
  form: CustomerScheduleForm;
}): Promise<CustomerSchedule> {
  const access = await getScheduleAccess();

  const existing = await getCustomerSchedule(input.id);
  if (!existing) throw new Error("일정을 찾을 수 없습니다.");

  if (!canEditCustomerSchedule(access, existing)) {
    throw new Error("이 일정을 수정할 권한이 없습니다.");
  }

  await assertAssigneeInScope(access, input.form.assigned_employee_id);

  const patch: Record<string, unknown> = {
    ...toCustomerScheduleWritePayload(input.form, access.userId),
  };
  if (input.form.status === "완료" && !existing.completed_at) {
    patch.completed_at = new Date().toISOString();
  }
  if (input.form.status !== "완료") {
    patch.completed_at = null;
  }

  const supabase = await createClient();
  let { error } = await supabase
    .from("customer_schedules")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error && isMissingOptionalScheduleColumnError(error.message ?? "")) {
    const fallback = toCustomerScheduleWritePayload(input.form, access.userId, {
      includeOptionalColumns: false,
    }) as Record<string, unknown>;
    if (input.form.status === "완료" && !existing.completed_at) {
      fallback.completed_at = new Date().toISOString();
    }
    if (input.form.status !== "완료") {
      fallback.completed_at = null;
    }
    const retry = await supabase
      .from("customer_schedules")
      .update(fallback)
      .eq("id", input.id)
      .is("deleted_at", null);
    error = retry.error;
  }

  if (error) {
    console.error("[updateCustomerSchedule]", error);
    throw new Error(error.message || "일정 수정에 실패했습니다.");
  }

  const updated = (await getCustomerSchedule(input.id))!;
  await queueAlert("schedule_changed", updated, { action: "update" });
  if (updated.status === "미처리") {
    await queueAlert("consult_unhandled", updated);
  }
  return updated;
}

export async function completeCustomerSchedule(input: {
  id: string;
  resultNote: string;
  customerReaction?: string | null;
  nextAction?: string | null;
  nextContactAt?: string | null;
  updateCustomerStatus?: string | null;
}): Promise<CustomerSchedule> {
  const note = input.resultNote.trim();
  if (!note) throw new Error("상담결과 메모는 필수입니다.");

  const existing = await getCustomerSchedule(input.id);
  if (!existing) throw new Error("일정을 찾을 수 없습니다.");

  const updated = await updateCustomerSchedule({
    id: input.id,
    form: {
      customer_id: existing.customer_id,
      assigned_employee_id: existing.assigned_employee_id,
      schedule_type: existing.schedule_type,
      title: existing.title,
      description: existing.description,
      start_at: existing.start_at,
      end_at: existing.end_at,
      all_day: existing.all_day,
      status: "완료",
      priority: existing.priority,
      location: existing.location,
      result_note: note,
      customer_reaction: emptyToNull(input.customerReaction),
      next_action: emptyToNull(input.nextAction),
      next_contact_at: input.nextContactAt
        ? new Date(input.nextContactAt).toISOString()
        : existing.next_contact_at,
    },
  });

  const nextStatus = (input.updateCustomerStatus ?? "").trim();
  if (nextStatus) {
    const { CUSTOMER_STATUSES } = await import("@/lib/crm/constants");
    if (!(CUSTOMER_STATUSES as readonly string[]).includes(nextStatus)) {
      throw new Error("고객 상담상태가 올바르지 않습니다.");
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("customers")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
        ...(input.nextContactAt
          ? { next_contact_at: new Date(input.nextContactAt).toISOString() }
          : {}),
      })
      .eq("id", existing.customer_id)
      .is("deleted_at", null);
    if (error) {
      throw new Error(
        "일정은 완료되었으나 고객 상담상태 변경에 실패했습니다.",
      );
    }
  } else if (input.nextContactAt) {
    const supabase = await createClient();
    await supabase
      .from("customers")
      .update({
        next_contact_at: new Date(input.nextContactAt).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.customer_id)
      .is("deleted_at", null);
  }

  return updated;
}

export async function moveCustomerSchedule(input: {
  id: string;
  startAt: string;
  endAt?: string | null;
}): Promise<CustomerSchedule> {
  const existing = await getCustomerSchedule(input.id);
  if (!existing) throw new Error("일정을 찾을 수 없습니다.");
  return updateCustomerSchedule({
    id: input.id,
    form: {
      customer_id: existing.customer_id,
      assigned_employee_id: existing.assigned_employee_id,
      schedule_type: existing.schedule_type,
      title: existing.title,
      description: existing.description,
      start_at: new Date(input.startAt).toISOString(),
      end_at: input.endAt
        ? new Date(input.endAt).toISOString()
        : existing.end_at,
      all_day: existing.all_day,
      status: existing.status,
      priority: existing.priority,
      location: existing.location,
      result_note: existing.result_note,
      customer_reaction: existing.customer_reaction ?? null,
      next_action: existing.next_action ?? null,
      next_contact_at: existing.next_contact_at,
    },
  });
}

export async function softDeleteCustomerSchedule(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await getScheduleAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");
  const existing = await getCustomerSchedule(input.id);
  if (!existing) throw new Error("일정을 찾을 수 없습니다.");
  if (!canSoftDeleteSchedule(access, existing)) {
    throw new Error("삭제 권한이 없습니다.");
  }
  if (
    access.canViewTeam &&
    !access.canViewAll &&
    existing.assigned_employee_id !== access.employeeId
  ) {
    await assertAssigneeInScope(access, existing.assigned_employee_id);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_schedules")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) throw new Error("일정 삭제에 실패했습니다.");
}

export function toScheduleSafeError(
  error: unknown,
  fallback = "처리 중 오류가 발생했습니다.",
): string {
  if (error instanceof Error) {
    const msg = (error.message || "").trim();
    if (msg && msg.length < 400) {
      return msg;
    }
  }
  return fallback;
}
