"use server";

import { revalidatePath } from "next/cache";
import {
  addFromCatalog,
  CatalogDuplicateError,
  createSiteMaterial,
  duplicateSiteMaterial,
  parseSiteMaterialForm,
  reorderSiteMaterial,
  reorderSiteMaterialsByIds,
  setSiteImageCover,
  softDeleteSiteMaterial,
  updateSiteMaterial,
} from "@/lib/crm/site-materials";
import {
  listMaterialHistory,
  reorderSiteMaterialImages,
  restoreSiteMaterial,
  toStaffSafeError,
  updateOrderStatus,
} from "@/lib/crm/site-material-ops";
import type { ProjectMaterialHistory } from "@/types/database";

export type SiteMaterialActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  materialId?: string;
  catalogDuplicate?: boolean;
  duplicateNames?: string[];
  history?: ProjectMaterialHistory[];
};

function collectFiles(formData: FormData, key: string): File[] {
  return formData
    .getAll(key)
    .filter((v): v is File => v instanceof File && v.size > 0);
}

function empty(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function revalidateCustomer(customerId: string, projectId?: string | null) {
  revalidatePath(`/customers/${customerId}/materials`);
  revalidatePath(`/customers/${customerId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}/materials`);
    revalidatePath(`/customers/${customerId}/projects/${projectId}/materials`);
  }
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
    if (
      error instanceof CatalogDuplicateError ||
      (error instanceof Error && error.message === "CATALOG_DUPLICATE")
    ) {
      const duplicates =
        error instanceof CatalogDuplicateError ? error.duplicates : [];
      return {
        success: false,
        catalogDuplicate: true,
        error:
          "카탈로그에 비슷한 제품이 있습니다. 그래도 저장하려면 ‘중복 무시하고 저장’을 체크한 뒤 다시 저장해 주세요.",
        duplicateNames: duplicates.map(
          (d) =>
            `${d.product_name}${d.model_number ? ` (${d.model_number})` : ""}`,
        ),
      };
    }
    return {
      success: false,
      error: toStaffSafeError(error, "자재 등록에 실패했습니다."),
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
      error: toStaffSafeError(error, "자재 수정에 실패했습니다."),
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
      error: toStaffSafeError(error, "삭제에 실패했습니다."),
    };
  }
}

export async function restoreSiteMaterialAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "").trim();
    const restoreReason = String(formData.get("restore_reason") ?? "").trim();
    await restoreSiteMaterial({ id, restoreReason });
    revalidateCustomer(customerId, projectId || null);
    return { success: true, message: "복원되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "복원에 실패했습니다."),
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
      error: toStaffSafeError(error, "복제에 실패했습니다."),
    };
  }
}

export async function reorderSiteMaterialAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "").trim();
    const direction = String(formData.get("direction") ?? "") as "up" | "down";
    await reorderSiteMaterial({ id, direction });
    revalidateCustomer(customerId, projectId || null);
    return { success: true, message: "순서가 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "순서 변경에 실패했습니다."),
    };
  }
}

export async function reorderSiteMaterialsDragAction(input: {
  customerId: string;
  projectId?: string | null;
  orderedIds: string[];
}): Promise<SiteMaterialActionResult> {
  try {
    await reorderSiteMaterialsByIds(input);
    revalidateCustomer(input.customerId, input.projectId);
    return { success: true, message: "순서가 저장되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "순서 변경에 실패했습니다."),
    };
  }
}

export async function setSiteCoverAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const materialId = String(formData.get("material_id") ?? "").trim();
    const imageId = String(formData.get("image_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = empty(formData.get("project_id"));
    await setSiteImageCover({ materialId, imageId });
    revalidateCustomer(customerId, projectId);
    return { success: true, message: "대표사진이 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "대표사진 변경에 실패했습니다."),
    };
  }
}

export async function reorderSiteImagesAction(input: {
  customerId: string;
  projectId?: string | null;
  materialId: string;
  orderedImageIds: string[];
}): Promise<SiteMaterialActionResult> {
  try {
    await reorderSiteMaterialImages({
      materialId: input.materialId,
      orderedImageIds: input.orderedImageIds,
    });
    revalidateCustomer(input.customerId, input.projectId);
    return { success: true, message: "사진 순서가 저장되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "사진 순서 저장에 실패했습니다."),
    };
  }
}

export async function updateOrderStatusAction(
  formData: FormData,
): Promise<SiteMaterialActionResult> {
  try {
    const id = String(formData.get("material_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = empty(formData.get("project_id"));
    const orderStatus = String(formData.get("order_status") ?? "").trim();
    const orderNote = empty(formData.get("order_note"));
    const expectedDeliveryAt = empty(formData.get("expected_delivery_at"));
    const reason = empty(formData.get("reason"));
    await updateOrderStatus({
      id,
      orderStatus,
      orderNote,
      expectedDeliveryAt,
      reason,
    });
    revalidateCustomer(customerId, projectId);
    return { success: true, message: "발주상태가 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "발주상태 변경에 실패했습니다."),
    };
  }
}

export async function loadMaterialHistoryAction(
  materialId: string,
): Promise<SiteMaterialActionResult> {
  try {
    const history = await listMaterialHistory(materialId);
    return { success: true, history };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "이력을 불러오지 못했습니다."),
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
    const unitRaw = String(
      formData.get("unit_price") ?? formData.get("base_price") ?? "",
    ).replace(/,/g, "");
    const unitPrice = unitRaw ? Number(unitRaw) : undefined;

    const item = await addFromCatalog({
      customerId,
      projectId,
      catalogId,
      spaceName,
      color,
      quantity,
      applicationLocation,
      additionalPrice,
      unitPrice,
    });
    revalidateCustomer(customerId, projectId);
    return {
      success: true,
      message: "카탈로그 자재가 추가되었습니다.",
      materialId: item.id,
    };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "카탈로그 자재 추가에 실패했습니다."),
    };
  }
}
