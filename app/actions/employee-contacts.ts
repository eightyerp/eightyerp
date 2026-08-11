"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  createSignedEmployeeCardUrl,
  updateEmployeeContactProfile,
} from "@/lib/crm/employee-contacts";
import type { EmployeeMergeImpact, EmployeeMergeResult } from "@/lib/crm/employee-contacts";
import { approveSignup } from "@/lib/crm/staff-approvals";
import type { UserRole } from "@/types/database";

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

async function requireEmployeeMergeAccess() {
  await requireAuthenticatedAccess();
  const supabase = await (await import("@/lib/supabase-server")).createClient();
  const { data: companyRole, error } = await supabase.rpc("current_company_role");
  if (error) throw new Error("회사 역할을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.");
  const role = typeof companyRole === "string" ? companyRole : null;
  const allowed = role === "owner" || role === "director" || role === "admin";
  if (!allowed) throw new Error("권한 부족: 현재 회사의 owner, director 또는 admin만 직원을 병합할 수 있습니다.");
  return supabase;
}

function employeeMergeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "직원 병합에 실패했습니다.";
  const reasons: Array<[RegExp, string]> = [
    [/관리자만 직원 병합|관리자만 직원을 병합|권한 부족/, "권한 부족: 현재 회사의 owner, director 또는 admin만 직원을 병합할 수 있습니다."],
    [/현재 로그인한 본인/, "본인 계정에 연결된 직원은 중복 직원으로 병합할 수 없습니다."],
    [/대표\(owner\)|대표.*계정/, "owner 대표 계정이 연결된 직원은 중복 직원으로 병합할 수 없습니다."],
    [/이미 병합된 직원/, "이미 병합된 직원은 다시 병합할 수 없습니다."],
    [/두 직원 모두 로그인 계정/, "양쪽 직원에 로그인 계정이 있습니다. 유지할 로그인 계정을 선택해 주세요."],
    [/동일 회사|다른 회사/, "다른 회사 직원끼리는 병합할 수 없습니다."],
    [/Could not find the function|schema cache/i, "운영 DB에 Employee Merge RPC가 없거나 스키마 캐시가 갱신되지 않았습니다."],
  ];
  return reasons.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

function employeeArchiveError(error: unknown): string {
  const message = error instanceof Error ? error.message : "직원 보관 처리에 실패했습니다.";
  const reasons: Array<[RegExp, string]> = [
    [
      /담당 업무\(([^)]+)\)가 남아 있어 비활성화할 수 없습니다/,
      "이 직원에게 담당 업무가 남아 있습니다. 먼저 ‘담당업무 일괄 이전’을 완료해 주세요.",
    ],
    [/현재 로그인한 본인 직원/, "현재 로그인한 본인 직원은 보관할 수 없습니다."],
    [
      /상위 권한 계정이 연결된 직원/,
      "대표·이사·관리자 계정이 연결된 직원은 권한을 먼저 이전하거나 계정 연결을 정리해 주세요.",
    ],
    [/이미 병합된 직원/, "이미 병합된 직원은 보관 상태를 변경할 수 없습니다."],
    [
      /owner·director·admin만 직원 (?:Master를 수정|상태를 변경)/,
      "권한 부족: 현재 회사의 대표·이사·관리자만 직원을 보관하거나 복원할 수 있습니다.",
    ],
    [/직원 Master를 찾을 수 없습니다/, "현재 회사에서 해당 직원을 찾을 수 없습니다."],
  ];
  return reasons.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

async function setEmployeeActiveStatus(
  employeeId: string,
  isActive: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAuthenticatedAccess();
    const normalizedEmployeeId = employeeId.trim();
    if (!normalizedEmployeeId) throw new Error("직원을 선택해 주세요.");

    const supabase = await (await import("@/lib/supabase-server")).createClient();
    const { data: companyRole, error: roleError } = await supabase.rpc("current_company_role");
    if (roleError) {
      throw new Error("회사 역할을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.");
    }
    const role = typeof companyRole === "string" ? companyRole : null;
    if (role !== "owner" && role !== "director" && role !== "admin") {
      throw new Error("권한 부족: 현재 회사의 대표·이사·관리자만 직원 상태를 변경할 수 있습니다.");
    }

    // The status-only RPC locks the employee and changes no contact fields, so
    // a concurrent detail edit cannot be overwritten by archive/restore.
    const { error } = await supabase.rpc("set_employee_active_status", {
      p_employee_id: normalizedEmployeeId,
      p_is_active: isActive,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/system/employees");
    revalidatePath("/dashboard");
    revalidatePath("/customers");
    revalidatePath("/quotes");
    revalidatePath("/schedules/customers");
    revalidatePath("/schedules/processes");
    return { success: true };
  } catch (error) {
    return { success: false, error: employeeArchiveError(error) };
  }
}

/**
 * Safe employee "delete": archives the employee instead of deleting the row.
 * set_employee_active_status enforces self/owner/linked-assignment guards and
 * records the status change in employee_master_events.
 */
export async function archiveEmployeeAction(
  employeeId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  return setEmployeeActiveStatus(employeeId, false);
}

export async function restoreEmployeeAction(
  employeeId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  return setEmployeeActiveStatus(employeeId, true);
}

export async function updateEmployeeContactAction(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAuthenticatedAccess();
    const employeeId = String(formData.get("employee_id") ?? "").trim();
    if (!employeeId) {
      return { success: false, error: "직원을 선택해 주세요." };
    }

    const title = String(formData.get("title") ?? "").trim();
    const phone = emptyToNull(String(formData.get("phone") ?? ""));
    const email = emptyToNull(String(formData.get("email") ?? ""));

    // 명함 UI 제거 — 기존 명함 경로·표시 설정은 변경하지 않음 (데이터 보존)
    await updateEmployeeContactProfile({
      employeeId,
      title,
      phone,
      email,
      clearBusinessCard: false,
      showBusinessCardOnQuote: null,
    });

    const loginRole = String(formData.get("login_role") ?? "").trim();
    const originalLoginRole = String(formData.get("original_login_role") ?? "").trim();
    if (loginRole && loginRole !== originalLoginRole) {
      if (!["admin", "manager", "staff"].includes(loginRole)) {
        throw new Error("유효하지 않은 로그인 권한입니다.");
      }
      const supabase = await (await import("@/lib/supabase-server")).createClient();
      const { error } = await supabase.rpc("update_employee_login_role", {
        p_employee_id: employeeId,
        p_role: loginRole,
      });
      if (error) throw new Error(error.message);
    }

    revalidatePath("/system/employees");
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "저장에 실패했습니다.",
    };
  }
}

export async function getEmployeeCardSignedUrlAction(
  path: string,
): Promise<string | null> {
  try {
    await requireAuthenticatedAccess();
    return await createSignedEmployeeCardUrl(path, 60 * 30);
  } catch {
    return null;
  }
}

export async function unlinkEmployeeLoginAction(
  employeeId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAuthenticatedAccess();
    const supabase = await (await import("@/lib/supabase-server")).createClient();
    const { error } = await supabase.rpc("unlink_employee_login", {
      p_employee_id: employeeId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/system/employees");
    revalidatePath("/system/approvals");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "계정 연결 해제에 실패했습니다.",
    };
  }
}

export async function saveEmployeeMasterAction(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAuthenticatedAccess();
    const employeeId = String(formData.get("employee_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const teamId = String(formData.get("team_id") ?? "").trim() || null;
    const phone = emptyToNull(String(formData.get("phone") ?? ""));
    const email = emptyToNull(String(formData.get("email") ?? ""));
    const supabase = await (await import("@/lib/supabase-server")).createClient();
    const rpc = employeeId ? "update_employee_master" : "create_employee_master";
    const currentStatus = employeeId
      ? await supabase
          .from("employees")
          .select("is_active")
          .eq("id", employeeId)
          .maybeSingle()
      : null;
    if (currentStatus?.error) throw new Error(currentStatus.error.message);
    if (employeeId && !currentStatus?.data) throw new Error("직원 Master를 찾을 수 없습니다.");
    const args = employeeId
      ? {
          p_employee_id: employeeId,
          p_name: name,
          p_team_id: teamId,
          p_title: title,
          p_phone: phone,
          p_email: email,
          // Never accept employee status from FormData. The generic DB RPC
          // also locks the row and rejects a stale status, so a detail save
          // cannot undo another manager's archive/restore.
          p_is_active: currentStatus?.data?.is_active === true,
        }
      : { p_name: name, p_team_id: teamId, p_title: title, p_phone: phone, p_email: email };
    const { error } = await supabase.rpc(rpc, args);
    if (error) throw new Error(error.message);
    const loginRole = String(formData.get("login_role") ?? "").trim();
    const originalLoginRole = String(formData.get("original_login_role") ?? "").trim();
    if (employeeId && loginRole && loginRole !== originalLoginRole) {
      if (!["admin", "manager", "staff"].includes(loginRole)) {
        throw new Error("유효하지 않은 로그인 권한입니다.");
      }
      const { error: roleError } = await supabase.rpc("update_employee_login_role", {
        p_employee_id: employeeId,
        p_role: loginRole,
      });
      if (roleError) throw new Error(roleError.message);
    }
    revalidatePath("/system/employees");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "직원 저장에 실패했습니다.";
    return {
      success: false,
      error: /직원 상태 변경은 전용 보관·복원 절차/.test(message)
        ? "직원 상태가 다른 관리자에 의해 변경되었습니다. 화면을 새로고침한 뒤 다시 수정해 주세요."
        : message,
    };
  }
}

export async function linkEmployeeLoginAction(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const employeeId = String(formData.get("employee_id") ?? "").trim();
    const userId = String(formData.get("user_id") ?? "").trim();
    const role = String(formData.get("role") ?? "staff") as UserRole;
    if (!employeeId || !userId) throw new Error("직원과 가입 계정을 선택해 주세요.");
    if (!["admin", "manager", "staff"].includes(role)) {
      throw new Error("유효하지 않은 로그인 권한입니다.");
    }
    await approveSignup({ userId, role, mode: "link", employeeId });
    revalidatePath("/system/employees");
    revalidatePath("/system/approvals");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "계정 연결에 실패했습니다." };
  }
}

export async function transferEmployeeAssignmentsAction(
  fromEmployeeId: string,
  toEmployeeId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAuthenticatedAccess();
    const supabase = await (await import("@/lib/supabase-server")).createClient();
    const { error } = await supabase.rpc("transfer_employee_assignments", {
      p_from_employee_id: fromEmployeeId,
      p_to_employee_id: toEmployeeId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/system/employees");
    revalidatePath("/customers");
    revalidatePath("/quotes");
    revalidatePath("/schedules/customers");
    revalidatePath("/schedules/processes");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "담당 업무 이전에 실패했습니다." };
  }
}

export async function analyzeEmployeeMergeAction(
  sourceEmployeeId: string,
  targetEmployeeId: string,
): Promise<{ success: true; impact: EmployeeMergeImpact } | { success: false; error: string }> {
  try {
    const supabase = await requireEmployeeMergeAccess();
    const { data, error } = await supabase.rpc("get_employee_merge_impact", {
      p_source_employee_id: sourceEmployeeId,
      p_target_employee_id: targetEmployeeId,
    });
    if (error) throw new Error(error.message);
    return { success: true, impact: data as EmployeeMergeImpact };
  } catch (error) {
    return { success: false, error: employeeMergeError(error) };
  }
}

export async function mergeEmployeesAction(input: {
  sourceEmployeeId: string;
  targetEmployeeId: string;
  keepProfileId: string | null;
  otherLoginAction: "unlink" | "deactivate";
}): Promise<{ success: true; report: EmployeeMergeResult } | { success: false; error: string }> {
  try {
    const supabase = await requireEmployeeMergeAccess();
    const { data, error } = await supabase.rpc("merge_employees", {
      p_source_employee_id: input.sourceEmployeeId,
      p_target_employee_id: input.targetEmployeeId,
      p_keep_profile_id: input.keepProfileId,
      p_other_login_action: input.otherLoginAction,
    });
    if (error) throw new Error(error.message);
    for (const path of [
      "/system/employees", "/customers", "/quotes", "/schedules/customers",
      "/schedules/processes", "/contracts", "/projects",
    ]) revalidatePath(path);
    return { success: true, report: data as EmployeeMergeResult };
  } catch (error) {
    return { success: false, error: employeeMergeError(error) };
  }
}
