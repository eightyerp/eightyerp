"use server";

import { revalidatePath } from "next/cache";
import {
  listMyCustomerPushes,
  pushCustomerInfo,
  type CustomerPushItem,
} from "@/lib/crm/customer-push";

export type CustomerPushActionResult = {
  success: boolean;
  message?: string;
  error?: string;
};

export async function pushCustomerInfoAction(
  _prev: CustomerPushActionResult,
  formData: FormData,
): Promise<CustomerPushActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    if (!customerId) return { success: false, error: "고객 정보가 없습니다." };

    const result = await pushCustomerInfo(customerId);
    revalidatePath(`/customers/${customerId}`);
    return {
      success: true,
      message: `${result.assigneeName}님에게 고객정보 PUSH를 보냈습니다.`,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "고객정보 PUSH에 실패했습니다.",
    };
  }
}

export async function getMyCustomerPushesAction(): Promise<CustomerPushItem[]> {
  try {
    return await listMyCustomerPushes(10);
  } catch {
    return [];
  }
}
