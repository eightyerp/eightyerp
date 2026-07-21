"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  createSignedEmployeeCardUrl,
  updateEmployeeContactProfile,
  uploadEmployeeBusinessCard,
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
    const showCard = ["on", "true", "1"].includes(
      String(formData.get("show_business_card_on_quote") ?? "").toLowerCase(),
    );
    const clearCard = ["on", "true", "1"].includes(
      String(formData.get("clear_business_card") ?? "").toLowerCase(),
    );

    const file = formData.get("business_card");
    let cardPath: string | null | undefined = undefined;

    if (file instanceof File && file.size > 0) {
      const supabase = await createClient();
      const { data: emp, error } = await supabase
        .from("employees")
        .select("id, company_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (error || !emp) {
        return { success: false, error: "직원 정보를 찾을 수 없습니다." };
      }
      const companyId = String(
        (emp as { company_id?: string | null }).company_id ?? "",
      ).trim();
      if (!companyId) {
        return {
          success: false,
          error: "직원 회사 정보가 없어 명함을 업로드할 수 없습니다.",
        };
      }
      cardPath = await uploadEmployeeBusinessCard({
        employeeId,
        companyId,
        file,
      });
    }

    await updateEmployeeContactProfile({
      employeeId,
      title,
      phone,
      email,
      businessCardPath: cardPath,
      clearBusinessCard: clearCard && !cardPath,
      showBusinessCardOnQuote: showCard,
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
