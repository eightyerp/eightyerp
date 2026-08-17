"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerById, updateCustomerQuickFields } from "@/lib/crm/customers";

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} 값이 필요합니다.`);
  return value;
}

export async function updateCrmCustomerAssigneeAction(formData: FormData) {
  const customerId = requiredText(formData, "customer_id");
  const employeeId = requiredText(formData, "assigned_employee_id");

  const customer = await getCustomerById(customerId);
  if (!customer || customer.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }

  await updateCustomerQuickFields({
    customer_id: customerId,
    assigned_employee_id: employeeId,
    change_assignee: true,
  });

  revalidatePath("/crm");
  revalidatePath("/crm/customers");
  revalidatePath("/crm/notifications");
  revalidatePath(`/crm/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/customers/pipeline");
  revalidatePath("/dashboard");

  redirect(`/crm/customers/${customerId}?saved=assignee`);
}
