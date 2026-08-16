import { createClient } from "@/lib/supabase-server";
import { koreaDayBounds } from "@/lib/crm/korea-date";
import {
  assertAssigneeInScope,
  canSoftDeleteSchedule,
  getScheduleAccess,
  type ScheduleAccess,
} from "@/lib/crm/schedule-access";
import type { EmployeeTask } from "@/types/database";

const SELECT =
  "*, customers ( id, name, phone, address ), employees ( id, name, title, team_id )";

const PRIORITIES = ["낮음", "보통", "높음", "긴급"] as const;
const STATUSES = ["대기", "진행중", "완료", "취소"] as const;

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export type EmployeeTaskForm = {
  title: string;
  description: string | null;
  assigned_employee_id: string;
  customer_id: string | null;
  project_id: string | null;
  quote_id: string | null;
  due_at: string | null;
  priority: string;
  status: string;
};

export function parseEmployeeTaskForm(formData: FormData): EmployeeTaskForm {
  const title = String(formData.get("title") ?? "").trim();
  const assignee = String(formData.get("assigned_employee_id") ?? "").trim();
  const priority = String(formData.get("priority") ?? "보통").trim() || "보통";
  const status = String(formData.get("status") ?? "대기").trim() || "대기";
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (!assignee) throw new Error("담당자를 선택해 주세요.");
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    throw new Error("우선순위가 올바르지 않습니다.");
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new Error("상태가 올바르지 않습니다.");
  }
  const dueRaw = emptyToNull(String(formData.get("due_at") ?? ""));
  return {
    title,
    description: emptyToNull(String(formData.get("description") ?? "")),
    assigned_employee_id: assignee,
    customer_id: emptyToNull(String(formData.get("customer_id") ?? "")),
    project_id: emptyToNull(String(formData.get("project_id") ?? "")),
    quote_id: emptyToNull(String(formData.get("quote_id") ?? "")),
    due_at: dueRaw ? new Date(dueRaw).toISOString() : null,
    priority,
    status,
  };
}

export async function listEmployeeTasks(
  filters: {
    employeeId?: string;
    teamId?: string;
    todayOnly?: boolean;
    includeCompleted?: boolean;
  } = {},
  access?: ScheduleAccess,
): Promise<EmployeeTask[]> {
  const sch = access ?? (await getScheduleAccess());
  const supabase = await createClient();

  let query = supabase
    .from("employee_tasks")
    .select(SELECT)
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(400);

  if (filters.employeeId) {
    query = query.eq("assigned_employee_id", filters.employeeId);
  } else if (!sch.canViewAll && sch.employeeId && !sch.canViewTeam) {
    query = query.eq("assigned_employee_id", sch.employeeId);
  }

  if (!filters.includeCompleted) {
    query = query.neq("status", "완료").neq("status", "취소");
  }

  const { data, error } = await query;
  if (error) {
    if (/employee_tasks|schema cache|Could not find/i.test(error.message)) {
      return [];
    }
    throw new Error("할 일 목록을 불러오지 못했습니다.");
  }

  let rows = (data ?? []) as EmployeeTask[];

  if (!sch.canViewAll && sch.canViewTeam && sch.teamId) {
    rows = rows.filter(
      (r) =>
        r.assigned_employee_id === sch.employeeId ||
        r.employees?.team_id === sch.teamId,
    );
  }

  if (filters.teamId && sch.canViewAll) {
    rows = rows.filter((r) => r.employees?.team_id === filters.teamId);
  }

  if (filters.todayOnly) {
    const { start, end } = koreaDayBounds();
    rows = rows.filter((r) => {
      if (!r.due_at) return r.status !== "완료" && r.status !== "취소";
      const t = new Date(r.due_at).getTime();
      return t <= end.getTime() && (t >= start.getTime() || r.status !== "완료");
    });
  }

  return rows;
}

export async function createEmployeeTask(
  form: EmployeeTaskForm,
): Promise<EmployeeTask> {
  const access = await getScheduleAccess();
  await assertAssigneeInScope(access, form.assigned_employee_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_tasks")
    .insert({
      ...form,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("할 일 등록에 실패했습니다.");
  return (await getEmployeeTask(data.id))!;
}

export async function getEmployeeTask(id: string): Promise<EmployeeTask | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_tasks")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("할 일을 불러오지 못했습니다.");
  return data as EmployeeTask | null;
}

export async function completeEmployeeTask(id: string): Promise<EmployeeTask> {
  const access = await getScheduleAccess();
  const existing = await getEmployeeTask(id);
  if (!existing) throw new Error("할 일을 찾을 수 없습니다.");
  await assertAssigneeInScope(access, existing.assigned_employee_id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_tasks")
    .update({
      status: "완료",
      completed_at: new Date().toISOString(),
      updated_by: access.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error("완료 처리에 실패했습니다.");
  return (await getEmployeeTask(id))!;
}

export async function softDeleteEmployeeTask(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await getScheduleAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");
  const existing = await getEmployeeTask(input.id);
  if (!existing) throw new Error("할 일을 찾을 수 없습니다.");
  if (!canSoftDeleteSchedule(access, existing)) {
    throw new Error("삭제 권한이 없습니다.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_tasks")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) throw new Error("할 일 삭제에 실패했습니다.");
}

export function toTaskSafeError(
  error: unknown,
  fallback = "처리 중 오류가 발생했습니다.",
): string {
  if (error instanceof Error) {
    const msg = error.message || "";
    if (
      /[가-힣]/.test(msg) &&
      msg.length < 180 &&
      !/PGRST|postgres|permission|JWT|schema cache/i.test(msg)
    ) {
      return msg;
    }
  }
  return fallback;
}
