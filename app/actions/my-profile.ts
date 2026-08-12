"use server";

import { revalidatePath } from "next/cache";
import { saveMyProfile } from "@/lib/crm/my-profile";

export type MyProfileSaveResult =
  | { success: true }
  | { success: false; error: string };

export async function saveMyProfileAction(
  formData: FormData,
): Promise<MyProfileSaveResult> {
  try {
    const fileEntry = formData.get("business_card");
    const businessCardFile =
      fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    await saveMyProfile({
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      businessCardFile,
      clearBusinessCard: formData.get("clear_business_card") === "1",
      showBusinessCardOnQuote:
        formData.get("show_business_card_on_quote") === "on",
    });

    revalidatePath("/me");
    revalidatePath("/system/employees");
    revalidatePath("/quotes");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "내 정보 저장에 실패했습니다.",
    };
  }
}
