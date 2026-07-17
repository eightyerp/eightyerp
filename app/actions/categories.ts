"use server";

import { revalidatePath } from "next/cache";
import {
  createMaterialCategory,
  parseCategoryForm,
  reorderMaterialCategory,
  softDeleteMaterialCategory,
  updateMaterialCategory,
} from "@/lib/crm/categories";
import type { MaterialCategory } from "@/types/database";

export type CategoryActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  category?: MaterialCategory;
};

function revalidateMaterialPaths() {
  revalidatePath("/materials/settings/categories");
  revalidatePath("/materials/catalog");
  revalidatePath("/materials/catalog/new");
}

export async function createCategoryAction(
  _prev: CategoryActionResult,
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const form = parseCategoryForm(formData);
    const category = await createMaterialCategory(form);
    revalidateMaterialPaths();
    return {
      success: true,
      message: "분류가 추가되었습니다.",
      category,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "분류 등록 실패",
    };
  }
}

export async function updateCategoryAction(
  _prev: CategoryActionResult,
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const id = String(formData.get("category_id") ?? "").trim();
    if (!id) return { success: false, error: "분류 ID가 없습니다." };
    const form = parseCategoryForm(formData);
    const category = await updateMaterialCategory({ id, form });
    revalidateMaterialPaths();
    return { success: true, message: "분류가 수정되었습니다.", category };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "분류 수정 실패",
    };
  }
}

export async function deleteCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const id = String(formData.get("category_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteMaterialCategory({ id, deleteReason });
    revalidateMaterialPaths();
    return { success: true, message: "분류가 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "분류 삭제 실패",
    };
  }
}

export async function reorderCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const id = String(formData.get("category_id") ?? "").trim();
    const direction = String(formData.get("direction") ?? "") as "up" | "down";
    if (direction !== "up" && direction !== "down") {
      return { success: false, error: "순서 방향이 올바르지 않습니다." };
    }
    await reorderMaterialCategory({ id, direction });
    revalidateMaterialPaths();
    return { success: true, message: "순서가 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "순서 변경 실패",
    };
  }
}

/** 등록 폼에서 즉시 분류 추가 */
export async function quickCreateCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { success: false, error: "분류 이름을 입력해 주세요." };
    const category = await createMaterialCategory({
      name,
      code: null,
      description: null,
      sort_order: 9999,
      is_active: true,
    });
    revalidateMaterialPaths();
    return {
      success: true,
      message: "분류가 추가되었습니다.",
      category,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "분류 등록 실패",
    };
  }
}
