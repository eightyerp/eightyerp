"use server";

import { revalidatePath } from "next/cache";
import { saveCompanySalesTarget } from "@/lib/crm/company-sales-target";

export async function updateCompanySalesTargetAction(formData: FormData) {
  const targetYear = Number(formData.get("targetYear") ?? 2026);
  const targetEok = Number(formData.get("targetEok") ?? 0);

  if (!Number.isFinite(targetEok) || targetEok <= 0) {
    throw new Error("회사 목표액을 억원 단위로 입력해 주세요.");
  }

  const targetAmount = Math.round(targetEok * 100_000_000);
  await saveCompanySalesTarget({ targetYear, targetAmount });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
}
