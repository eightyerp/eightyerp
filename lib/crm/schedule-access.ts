import { createClient } from "@/lib/supabase-server";
import {
  isAdminRole,
  isManagerOrAboveRole,
} from "@/lib/crm/constants";
import {
  getCurrentUserAccess,
  requireAuthenticatedAccess,
  type CurrentUserAccess,
} from "@/lib/crm/access";
import type { Employee, Team, UserRole } from "@/types/database";

export type ScheduleAccess = CurrentUserAccess & {
  employeeId: string | null;
  teamId: string | null;
  /** admin / super_admin — 전체 조회·필터·내보내기 */
  canViewAll: boolean;
  /** manager — 소속팀 범위 (admin 포함 시에도 true) */
  canViewTeam: boolean;
  role: UserRole | null;
};

export async function getScheduleAccess(): Promise<ScheduleAccess> {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }

  let teamId: string | null = null;
  const employeeId = access.profile?.employee_id ?? null;

  if (employeeId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("employees")
      .select("id, team_id")
      .eq("id", employeeId)
      .maybeSingle();
    teamId = (data?.team_id as string | null) ?? null;
  }

  const role = access.role;
  const canViewAll = isAdminRole(role);
  const canViewTeam = isManagerOrAboveRole(role);

  return {
    ...access,
    employeeId,
    teamId,
    canViewAll,
    canViewTeam,
    role,
  };
}

export async function requireScheduleAccess() {
  return getScheduleAccess();
}

/** 서버에서 담당자 범위 강제 */
export function assertCanAssignEmployee(
  access: ScheduleAccess,
  assignedEmployeeId: string | null | undefined,
) {
  if (access.canViewAll) return;
  if (!assignedEmployeeId) {
    if (access.canViewTeam) return;
    throw new Error("담당자를 지정해 주세요.");
  }
  if (assignedEmployeeId === access.employeeId) return;
  if (!access.canViewTeam) {
    throw new Error("본인 담당 일정만 등록·수정할 수 있습니다.");
  }
  // manager: 팀 검증은 DB RLS + listEmployeesInScope에서 처리
}

export async function listEmployeesInScope(
  access: ScheduleAccess,
): Promise<Employee[]> {
  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (access.canViewAll) {
    // all
  } else if (access.canViewTeam && access.teamId) {
    query = query.eq("team_id", access.teamId);
  } else if (access.employeeId) {
    query = query.eq("id", access.employeeId);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error("직원 목록을 불러오지 못했습니다.");
  return (data ?? []) as Employee[];
}

export async function listTeams(): Promise<Team[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error("팀 목록을 불러오지 못했습니다.");
  return (data ?? []) as Team[];
}

export async function assertAssigneeInScope(
  access: ScheduleAccess,
  assignedEmployeeId: string,
) {
  if (access.canViewAll) return;
  const scoped = await listEmployeesInScope(access);
  if (!scoped.some((e) => e.id === assignedEmployeeId)) {
    throw new Error("권한이 없는 담당자입니다.");
  }
}

export function canSoftDeleteSchedule(
  access: ScheduleAccess,
  row: { assigned_employee_id: string | null; created_by: string | null },
): boolean {
  if (access.canViewAll) return true;
  if (row.created_by && row.created_by === access.userId) return true;
  if (
    row.assigned_employee_id &&
    row.assigned_employee_id === access.employeeId
  ) {
    return true;
  }
  if (access.canViewTeam && row.assigned_employee_id) {
    // team delete for manager — verified by caller loading scoped list
    return true;
  }
  return false;
}

export { requireAuthenticatedAccess };
export { canEditCustomerSchedule } from "@/lib/crm/schedule-utils";
