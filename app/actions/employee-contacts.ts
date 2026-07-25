"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  createSignedEmployeeCardUrl,
  updateEmployeeContactProfile,
} from "@/lib/crm/employee-contacts";

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

export async function updateEmployeeContactAction(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const access = await requireAuthenticatedAccess();
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

    void access;
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
