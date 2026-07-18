import { createClient } from "@/lib/supabase-server";
import {
  assertAssigneeInScope,
  canSoftDeleteSchedule,
  getScheduleAccess,
  type ScheduleAccess,
} from "@/lib/crm/schedule-access";
import {
  PROCESS_SCHEDULE_STATUSES,
  type ScheduleAlertType,
} from "@/lib/crm/schedule-constants";
import type { ProjectProcessSchedule } from "@/types/database";
import { isProcessDelayed } from "@/lib/crm/schedule-utils";

export { isProcessDelayed };

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export type ProcessScheduleForm = {
  project_id: string | null;
  customer_id: string;
  assigned_employee_id: string | null;
  process_name: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  status: string;
  progress: number;
  contractor_name: string | null;
  contractor_contact: string | null;
  location: string | null;
  dependency_schedule_id: string | null;
  color_key: string | null;
  checklist_note: string | null;
  completion_note: string | null;
};

export function parseProcessScheduleForm(formData: FormData): ProcessScheduleForm {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const processName = String(formData.get("process_name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const startAt = String(formData.get("start_at") ?? "").trim();
  const status = String(formData.get("status") ?? "예정").trim() || "예정";
  const progressRaw = Number(String(formData.get("progress") ?? "0").trim() || 0);

  if (!customerId) throw new Error("고객을 선택해 주세요.");
  if (!processName) throw new Error("공정명을 입력해 주세요.");
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (!startAt) throw new Error("시작일을 입력해 주세요.");
  if (!(PROCESS_SCHEDULE_STATUSES as readonly string[]).includes(status)) {
    throw new Error("상태가 올바르지 않습니다.");
  }
  if (!Number.isFinite(progressRaw) || progressRaw < 0 || progressRaw > 100) {
    throw new Error("진행률은 0~100이어야 합니다.");
  }

  return {
    project_id: emptyToNull(String(formData.get("project_id") ?? "")),
    customer_id: customerId,
    assigned_employee_id: emptyToNull(
      String(formData.get("assigned_employee_id") ?? ""),
    ),
    process_name: processName,
    title,
    description: emptyToNull(String(formData.get("description") ?? "")),
    start_at: new Date(startAt).toISOString(),
    end_at: emptyToNull(String(formData.get("end_at") ?? ""))
      ? new Date(String(formData.get("end_at"))).toISOString()
      : null,
    all_day: !["off", "false", "0"].includes(
      String(formData.get("all_day") ?? "true").toLowerCase(),
    ),
    status,
    progress: Math.round(progressRaw),
    contractor_name: emptyToNull(String(formData.get("contractor_name") ?? "")),
    contractor_contact: emptyToNull(
      String(formData.get("contractor_contact") ?? ""),
    ),
    location: emptyToNull(String(formData.get("location") ?? "")),
    dependency_schedule_id: emptyToNull(
      String(formData.get("dependency_schedule_id") ?? ""),
    ),
    color_key: emptyToNull(String(formData.get("color_key") ?? "")),
    checklist_note: emptyToNull(String(formData.get("checklist_note") ?? "")),
    completion_note: emptyToNull(String(formData.get("completion_note") ?? "")),
  };
}

const SELECT =
  "*, customers ( id, name, phone, address ), employees ( id, name, title, team_id ), projects ( id, name, address, status, construction_start_at )";

export type ProcessScheduleFilters = {
  from?: string;
  to?: string;
  employeeId?: string;
  teamId?: string;
  projectId?: string;
  customerId?: string;
  processName?: string;
  status?: string;
  delayedOnly?: boolean;
  todayOnly?: boolean;
  q?: string;
};

export async function listProcessSchedules(
  filters: ProcessScheduleFilters = {},
  access?: ScheduleAccess,
): Promise<ProjectProcessSchedule[]> {
  const sch = access ?? (await getScheduleAccess());
  const supabase = await createClient();

  let query = supabase
    .from("project_process_schedules")
    .select(SELECT)
    .is("deleted_at", null)
    .order("start_at", { ascending: true })
    .limit(800);

  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.processName) {
    query = query.ilike("process_name", `%${filters.processName}%`);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("start_at", filters.from);
  if (filters.to) query = query.lte("start_at", filters.to);

  if (sch.canViewAll) {
    if (filters.employeeId) {
      query = query.eq("assigned_employee_id", filters.employeeId);
    }
  } else if (sch.canViewTeam && sch.teamId) {
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
  if (error) throw new Error("공정 일정을 불러오지 못했습니다.");

  let rows = (data ?? []) as ProjectProcessSchedule[];

  if (!sch.canViewAll && sch.canViewTeam && sch.teamId && !filters.employeeId) {
    rows = rows.filter(
      (r) =>
        !r.assigned_employee_id || r.employees?.team_id === sch.teamId,
    );
  }

  if (filters.teamId && sch.canViewAll) {
    rows = rows.filter((r) => r.employees?.team_id === filters.teamId);
  }

  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [
        r.customers?.name,
        r.projects?.name,
        r.projects?.address,
        r.customers?.address,
        r.process_name,
        r.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }

  if (filters.todayOnly) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    rows = rows.filter((r) => {
      const t = new Date(r.start_at).getTime();
      const e = r.end_at ? new Date(r.end_at).getTime() : t;
      return t <= end.getTime() && e >= start.getTime();
    });
  }

  if (filters.delayedOnly) {
    rows = rows.filter((r) => isProcessDelayed(r));
  }

  return rows;
}

export async function getProcessSchedule(
  id: string,
): Promise<ProjectProcessSchedule | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_process_schedules")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("공정 일정을 불러오지 못했습니다.");
  return data as ProjectProcessSchedule | null;
}

export async function findProcessAssigneeConflicts(input: {
  assignedEmployeeId: string;
  startAt: string;
  endAt?: string | null;
  excludeId?: string;
}): Promise<ProjectProcessSchedule[]> {
  const start = new Date(input.startAt).getTime();
  const end = input.endAt
    ? new Date(input.endAt).getTime()
    : start + 8 * 60 * 60 * 1000;
  const list = await listProcessSchedules({
    employeeId: input.assignedEmployeeId,
    from: new Date(start - 14 * 86400000).toISOString(),
    to: new Date(end + 14 * 86400000).toISOString(),
  });
  return list.filter((s) => {
    if (input.excludeId && s.id === input.excludeId) return false;
    if (["취소", "완료"].includes(s.status)) return false;
    const sStart = new Date(s.start_at).getTime();
    const sEnd = s.end_at
      ? new Date(s.end_at).getTime()
      : sStart + 8 * 60 * 60 * 1000;
    return sStart < end && sEnd > start;
  });
}

export async function findProjectOverlaps(input: {
  projectId: string;
  startAt: string;
  endAt?: string | null;
  excludeId?: string;
}): Promise<ProjectProcessSchedule[]> {
  const start = new Date(input.startAt).getTime();
  const end = input.endAt
    ? new Date(input.endAt).getTime()
    : start + 8 * 60 * 60 * 1000;
  const list = await listProcessSchedules({ projectId: input.projectId });
  return list.filter((s) => {
    if (input.excludeId && s.id === input.excludeId) return false;
    if (["취소", "완료"].includes(s.status)) return false;
    const sStart = new Date(s.start_at).getTime();
    const sEnd = s.end_at
      ? new Date(s.end_at).getTime()
      : sStart + 8 * 60 * 60 * 1000;
    return sStart < end && sEnd > start;
  });
}

export function constructionPeriodWarning(
  schedule: Pick<ProcessScheduleForm, "start_at" | "end_at">,
  constructionStartAt?: string | null,
): string | null {
  if (!constructionStartAt) return null;
  const start = new Date(schedule.start_at);
  const cStart = new Date(`${constructionStartAt}T00:00:00`);
  if (start.getTime() < cStart.getTime()) {
    return "공정 시작일이 공사 시작일보다 이전입니다.";
  }
  return null;
}

export function dependencyDelayWarning(
  current: ProjectProcessSchedule,
  dependency: ProjectProcessSchedule | null,
): string | null {
  if (!dependency) return null;
  if (isProcessDelayed(dependency) || dependency.status === "지연") {
    return `선행 공정(${dependency.process_name})이 지연되었습니다.`;
  }
  return null;
}

async function queueAlert(
  eventType: ScheduleAlertType,
  schedule: ProjectProcessSchedule,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = await createClient();
    await supabase.from("schedule_alert_events").insert({
      event_type: eventType,
      schedule_kind: "process",
      schedule_id: schedule.id,
      customer_id: schedule.customer_id,
      project_id: schedule.project_id,
      assigned_employee_id: schedule.assigned_employee_id,
      payload,
      status: "pending",
    });
  } catch {
    // ignore
  }
}

export async function createProcessSchedule(
  form: ProcessScheduleForm,
): Promise<ProjectProcessSchedule> {
  const access = await getScheduleAccess();
  if (form.assigned_employee_id) {
    await assertAssigneeInScope(access, form.assigned_employee_id);
  } else if (!access.canViewAll && !access.canViewTeam) {
    if (!access.employeeId) throw new Error("담당자를 지정해 주세요.");
    form.assigned_employee_id = access.employeeId;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_process_schedules")
    .insert({
      ...form,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("공정 일정 등록에 실패했습니다.");

  const created = (await getProcessSchedule(data.id))!;
  await queueAlert("schedule_changed", created, { action: "create" });
  return created;
}

export async function updateProcessSchedule(input: {
  id: string;
  form: ProcessScheduleForm;
}): Promise<ProjectProcessSchedule> {
  const access = await getScheduleAccess();
  if (input.form.assigned_employee_id) {
    await assertAssigneeInScope(access, input.form.assigned_employee_id);
  }

  const existing = await getProcessSchedule(input.id);
  if (!existing) throw new Error("공정 일정을 찾을 수 없습니다.");

  const patch: Record<string, unknown> = {
    ...input.form,
    updated_by: access.userId,
  };
  if (input.form.status === "완료") {
    patch.completed_at = new Date().toISOString();
    patch.progress = 100;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_process_schedules")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) throw new Error("공정 일정 수정에 실패했습니다.");

  const updated = (await getProcessSchedule(input.id))!;
  await queueAlert("schedule_changed", updated, { action: "update" });
  if (isProcessDelayed(updated)) {
    await queueAlert("process_delayed", updated);
  }
  return updated;
}

export async function moveProcessSchedule(input: {
  id: string;
  startAt: string;
  endAt?: string | null;
}): Promise<ProjectProcessSchedule> {
  const existing = await getProcessSchedule(input.id);
  if (!existing) throw new Error("공정 일정을 찾을 수 없습니다.");
  return updateProcessSchedule({
    id: input.id,
    form: {
      project_id: existing.project_id,
      customer_id: existing.customer_id,
      assigned_employee_id: existing.assigned_employee_id,
      process_name: existing.process_name,
      title: existing.title,
      description: existing.description,
      start_at: new Date(input.startAt).toISOString(),
      end_at: input.endAt
        ? new Date(input.endAt).toISOString()
        : existing.end_at,
      all_day: existing.all_day,
      status: existing.status,
      progress: existing.progress,
      contractor_name: existing.contractor_name,
      contractor_contact: existing.contractor_contact,
      location: existing.location,
      dependency_schedule_id: existing.dependency_schedule_id,
      color_key: existing.color_key,
      checklist_note: existing.checklist_note,
      completion_note: existing.completion_note,
    },
  });
}

export async function softDeleteProcessSchedule(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await getScheduleAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");
  const existing = await getProcessSchedule(input.id);
  if (!existing) throw new Error("공정 일정을 찾을 수 없습니다.");
  if (!canSoftDeleteSchedule(access, existing)) {
    throw new Error("삭제 권한이 없습니다.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_process_schedules")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) throw new Error("공정 일정 삭제에 실패했습니다.");
}
