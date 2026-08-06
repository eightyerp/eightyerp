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
  const access = await requireAuthenticatedAccess();
  const supabase = await (await import("@/lib/supabase-server")).createClient();
  const { data: companyRole, error } = await supabase.rpc("current_company_role");
  if (error) throw new Error("회사 역할을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.");
  const role = typeof companyRole === "string" ? companyRole : null;
  const allowed = access.isAdmin || role === "owner" || role === "director" || role === "admin";
  if (!allowed) throw new Error("권한 부족: owner, director, admin 또는 super_admin만 직원을 병합할 수 있습니다.");
  return supabase;
}

function employeeMergeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "직원 병합에 실패했습니다.";
  const reasons: Array<[RegExp, string]> = [
    [/관리자만 직원 병합|관리자만 직원을 병합|권한 부족/, "권한 부족: owner, director, admin 또는 super_admin만 직원을 병합할 수 있습니다."],
    [/현재 로그인한 본인/, "본인 계정에 연결된 직원은 중복 직원으로 병합할 수 없습니다."],
    [/대표\(owner\)|대표.*계정/, "owner 대표 계정이 연결된 직원은 중복 직원으로 병합할 수 없습니다."],
    [/이미 병합된 직원/, "이미 병합된 직원은 다시 병합할 수 없습니다."],
    [/두 직원 모두 로그인 계정/, "양쪽 직원에 로그인 계정이 있습니다. 유지할 로그인 계정을 선택해 주세요."],
    [/동일 회사|다른 회사/, "다른 회사 직원끼리는 병합할 수 없습니다."],
    [/Could not find the function|schema cache/i, "운영 DB에 Employee Merge RPC가 없거나 스키마 캐시가 갱신되지 않았습니다."],
  ];
  return reasons.find(([pattern]) => pattern.test(message))?.[1] ?? message;
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
    if (loginRole) {
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
    const args = employeeId
      ? {
          p_employee_id: employeeId,
          p_name: name,
          p_team_id: teamId,
          p_title: title,
          p_phone: phone,
          p_email: email,
          p_is_active: String(formData.get("is_active") ?? "true") === "true",
        }
      : { p_name: name, p_team_id: teamId, p_title: title, p_phone: phone, p_email: email };
    const { error } = await supabase.rpc(rpc, args);
    if (error) throw new Error(error.message);
    const loginRole = String(formData.get("login_role") ?? "").trim();
    if (employeeId && loginRole) {
      const { error: roleError } = await supabase.rpc("update_employee_login_role", {
        p_employee_id: employeeId,
        p_role: loginRole,
      });
      if (roleError) throw new Error(roleError.message);
    }
    revalidatePath("/system/employees");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "직원 저장에 실패했습니다." };
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
