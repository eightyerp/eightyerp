"use server";

import { revalidatePath } from "next/cache";
import {
  approveSignup,
  deactivateUser,
  rejectSignup,
  type ApproveSignupInput,
} from "@/lib/crm/staff-approvals";
import type { UserRole } from "@/types/database";

export type StaffApprovalResult = {
  success: boolean;
  error?: string;
  message?: string;
};

const ROLES: UserRole[] = ["admin", "manager", "staff"];

function revalidateApprovals() {
  revalidatePath("/system/approvals");
}

export async function approveSignupAction(
  _prev: StaffApprovalResult,
  formData: FormData,
): Promise<StaffApprovalResult> {
  try {
    const userId = String(formData.get("user_id") ?? "").trim();
    const role = String(formData.get("role") ?? "staff").trim() as UserRole;
    const mode = String(formData.get("mode") ?? "link").trim() as
      | "link"
      | "create";
    if (!userId) return { success: false, error: "대상 사용자가 없습니다." };
    if (!ROLES.includes(role)) {
      return { success: false, error: "역할이 올바르지 않습니다." };
    }

    const input: ApproveSignupInput = {
      userId,
      role,
      mode,
      employeeId: String(formData.get("employee_id") ?? "").trim() || null,
      employeeName: String(formData.get("employee_name") ?? "").trim(),
      employeeTitle: String(formData.get("employee_title") ?? "").trim(),
      teamId: String(formData.get("team_id") ?? "").trim() || null,
    };

    if (mode === "link" && !input.employeeId) {
      return { success: false, error: "연결할 직원을 선택해 주세요." };
    }
    if (mode === "create") {
      if (!input.employeeName) {
        return { success: false, error: "새 직원 이름을 입력해 주세요." };
      }
      if (!input.employeeTitle) {
        return { success: false, error: "직급을 입력해 주세요." };
      }
    }

    await approveSignup(input);
    revalidateApprovals();
    return { success: true, message: "가입이 승인되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "승인 실패",
    };
  }
}

export async function rejectSignupAction(
  _prev: StaffApprovalResult,
  formData: FormData,
): Promise<StaffApprovalResult> {
  try {
    const userId = String(formData.get("user_id") ?? "").trim();
    const reason = String(formData.get("rejection_reason") ?? "").trim();
    if (!userId) return { success: false, error: "대상 사용자가 없습니다." };
    await rejectSignup(userId, reason);
    revalidateApprovals();
    return { success: true, message: "가입을 거절했습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "거절 실패",
    };
  }
}

export async function deactivateUserAction(
  _prev: StaffApprovalResult,
  formData: FormData,
): Promise<StaffApprovalResult> {
  try {
    const userId = String(formData.get("user_id") ?? "").trim();
    if (!userId) return { success: false, error: "대상 사용자가 없습니다." };
    await deactivateUser(userId);
    revalidateApprovals();
    return { success: true, message: "계정을 비활성화했습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "비활성화 실패",
    };
  }
}
