"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCatalogItem,
  duplicateCatalogItem,
  parseCatalogForm,
  reorderCatalogImage,
  setCatalogImageCover,
  softDeleteCatalogItem,
  toggleCatalogFavorite,
  updateCatalogItem,
} from "@/lib/crm/catalog";

export type CatalogActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  catalogId?: string;
};

function collectFiles(formData: FormData, key: string): File[] {
  return formData
    .getAll(key)
    .filter((v): v is File => v instanceof File && v.size > 0);
}

function revalidateCatalog(id?: string) {
  revalidatePath("/materials/catalog");
  if (id) revalidatePath(`/materials/catalog/${id}/edit`);
}

export async function createCatalogAction(
  _prev: CatalogActionResult,
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const form = parseCatalogForm(formData);
    const item = await createCatalogItem({
      form,
      coverFiles: collectFiles(formData, "cover_images"),
      galleryFiles: collectFiles(formData, "gallery_images"),
    });
    revalidateCatalog(item.id);
    redirect(`/materials/catalog/${item.id}/edit`);
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "등록 실패",
    };
  }
}

export async function updateCatalogAction(
  _prev: CatalogActionResult,
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const id = String(formData.get("catalog_id") ?? "").trim();
    if (!id) return { success: false, error: "카탈로그 ID가 없습니다." };
    const form = parseCatalogForm(formData);
    await updateCatalogItem({
      id,
      form,
      coverFiles: collectFiles(formData, "cover_images"),
      galleryFiles: collectFiles(formData, "gallery_images"),
    });
    revalidateCatalog(id);
    return { success: true, message: "수정되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수정 실패",
    };
  }
}

export async function deleteCatalogAction(
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const id = String(formData.get("catalog_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteCatalogItem({ id, deleteReason });
    revalidateCatalog();
    return { success: true, message: "삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "삭제 실패",
    };
  }
}

export async function duplicateCatalogAction(
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const id = String(formData.get("catalog_id") ?? "").trim();
    const item = await duplicateCatalogItem(id);
    revalidateCatalog(item.id);
    redirect(`/materials/catalog/${item.id}/edit`);
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "복제 실패",
    };
  }
}

export async function toggleFavoriteCatalogAction(
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const id = String(formData.get("catalog_id") ?? "").trim();
    const isFavorite = String(formData.get("is_favorite") ?? "") === "true";
    await toggleCatalogFavorite(id, isFavorite);
    revalidateCatalog(id);
    return {
      success: true,
      message: isFavorite ? "즐겨찾기 추가" : "즐겨찾기 해제",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "처리 실패",
    };
  }
}

export async function setCatalogCoverAction(
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const materialId = String(formData.get("catalog_id") ?? "").trim();
    const imageId = String(formData.get("image_id") ?? "").trim();
    await setCatalogImageCover({ materialId, imageId });
    revalidateCatalog(materialId);
    return { success: true, message: "대표사진이 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "처리 실패",
    };
  }
}

export async function reorderCatalogImageAction(
  formData: FormData,
): Promise<CatalogActionResult> {
  try {
    const materialId = String(formData.get("catalog_id") ?? "").trim();
    const imageId = String(formData.get("image_id") ?? "").trim();
    const direction = String(formData.get("direction") ?? "") as "up" | "down";
    await reorderCatalogImage({ materialId, imageId, direction });
    revalidateCatalog(materialId);
    return { success: true, message: "순서가 변경되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "처리 실패",
    };
  }
}
