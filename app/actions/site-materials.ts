"use server";

import { revalidatePath } from "next/cache";
import {
  addFromCatalog,
  createSiteMaterial,
  duplicateSiteMaterial,
  parseSiteMaterialForm,
  reorderSiteMaterial,
  softDeleteSiteMaterial,
  updateSiteMaterial,
} from "@/lib/crm/site-materials";

export type SiteMaterialActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  materialId?: string;
};

function collectFiles(formData: FormData, key: string): File[] {
  return formData
    .getAll(key)
    .filter((v): v is File => v instanceof File && v.size > 0);
}

function revalidateCustomer(customerId: string, projectId?: string | null) {
  revalidatePath(`/customers/${customerId}/materials`);
  revalidatePath(`/customers/${customerId}`);
  if (projectId) revalidatePath(`/projects/${projectId}/materials`);
  revalidatePath("/materials/catalog");
}

export async function createSiteMaterialAction(
  _prev: SiteMaterialActionResult,
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const form = parseSiteMaterialForm(formData);
    const item = await createSiteMaterial({
      form,
      files: collectFiles(formData, "images"),
    });
    revalidateCustomer(form.customer_id, form.project_id);
    return {
      success: true,
      message: "자재가 추가되었습니다.",
      materialId: item.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "등록 실패",
    };
  }
}

export async function updateSiteMaterialAction(
  _prev: SiteMaterialActionResult,
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    if (!id) return { success: false, error: "자재 ID가 없습니다." };
    const form = parseSiteMaterialForm(formData);
    await updateSiteMaterial({
      id,
      form,
      files: collectFiles(formData, "images"),
    });
    revalidateCustomer(form.customer_id, form.project_id);
    return { success: true, message: "수정되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수정 실패",
    };
  }
}

export async function deleteSiteMaterialAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteSiteMaterial({ id, deleteReason });
    revalidateCustomer(customerId, projectId || null);
    return { success: true, message: "삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "삭제 실패",
    };
  }
}

export async function duplicateSiteMaterialAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    const item = await duplicateSiteMaterial(id);
    revalidateCustomer(item.customer_id, item.project_id);
    return {
      success: true,
      message: "복제되었습니다.",
      materialId: item.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "복제 실패",
    };
  }
}

export async function reorderSiteMaterialAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const direction = String(formData.get("direction") ?? "") as "up" | "down";
    await reorderSiteMaterial({ id, direction });
    revalidateCustomer(customerId);
    return { success: true, message: "순서가 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "순서 변경 실패",
    };
  }
}

export async function addCatalogToSiteAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = empty(formData.get("project_id"));
    const catalogId = String(formData.get("catalog_id") ?? "").trim();
    const spaceName = empty(formData.get("space_name")) || "공통";
    const color = empty(formData.get("color"));
    const applicationLocation = empty(formData.get("application_location"));
    const qtyRaw = String(formData.get("quantity") ?? "1").trim();
    const quantity = Number(qtyRaw || 1);
    const addRaw = String(formData.get("additional_price") ?? "0").replace(
      /,/g,
      "",
    );
    const additionalPrice = Number(addRaw || 0);

    const item = await addFromCatalog({
      customerId,
      projectId,
      catalogId,
      spaceName,
      color,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      applicationLocation,
      additionalPrice: Number.isFinite(additionalPrice) ? additionalPrice : 0,
    });
    revalidateCustomer(customerId, projectId);
    return {
      success: true,
      message: "카탈로그 자재를 추가했습니다.",
      materialId: item.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "추가 실패",
    };
  }
}

function empty(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
