import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import { writeAuditLog } from "@/lib/crm/customers";
import {
  CATALOG_BUCKET,
  CATALOG_PAGE_SIZE,
  MATERIAL_ALLOWED_MIME,
  MATERIAL_MAX_FILE_BYTES,
  MATERIAL_MAX_IMAGES,
} from "@/lib/crm/material-constants";
import type { MaterialCatalogItem } from "@/types/database";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function assertImageFile(file: File) {
  if (file.size <= 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  if (file.size > MATERIAL_MAX_FILE_BYTES) {
    throw new Error("이미지 파일은 10MB 이하여야 합니다.");
  }
  const mime = (file.type || "").toLowerCase();
  if (
    !(MATERIAL_ALLOWED_MIME as readonly string[]).includes(mime) &&
    !/\.(jpe?g|png|webp)$/i.test(file.name)
  ) {
    throw new Error("허용 이미지: jpg, jpeg, png, webp");
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\-()가-힣\s]/g, "_").slice(0, 180);
}

export type CatalogFormInput = {
  category_id: string;
  brand: string | null;
  product_name: string;
  model_number: string | null;
  color: string | null;
  specification: string | null;
  unit: string | null;
  base_price: number;
  supplier: string | null;
  description: string | null;
  internal_memo: string | null;
  is_favorite: boolean;
  is_active: boolean;
};

export function parseCatalogForm(formData: FormData): CatalogFormInput {
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const productName = String(formData.get("product_name") ?? "").trim();
  if (!categoryId) throw new Error("자재분류를 선택해 주세요.");
  if (!productName) throw new Error("제품명을 입력해 주세요.");

  const priceRaw = String(formData.get("base_price") ?? "0").replace(/,/g, "").trim();
  const basePrice = Number(priceRaw || 0);
  if (!Number.isFinite(basePrice) || basePrice < 0 || !Number.isInteger(basePrice)) {
    throw new Error("기본단가는 0 이상 정수(원)여야 합니다.");
  }

  return {
    category_id: categoryId,
    brand: emptyToNull(String(formData.get("brand") ?? "")),
    product_name: productName,
    model_number: emptyToNull(String(formData.get("model_number") ?? "")),
    color: emptyToNull(String(formData.get("color") ?? "")),
    specification: emptyToNull(String(formData.get("specification") ?? "")),
    unit: emptyToNull(String(formData.get("unit") ?? "")),
    base_price: basePrice,
    supplier: emptyToNull(String(formData.get("supplier") ?? "")),
    description: emptyToNull(String(formData.get("description") ?? "")),
    internal_memo: emptyToNull(String(formData.get("internal_memo") ?? "")),
    is_favorite: ["on", "true", "1"].includes(
      String(formData.get("is_favorite") ?? "").toLowerCase(),
    ),
    is_active: ["on", "true", "1"].includes(
      String(formData.get("is_active") ?? "").toLowerCase(),
    ),
  };
}

export type CatalogListFilters = {
  q?: string;
  categoryId?: string;
  brand?: string;
  favoriteOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type CatalogListResult = {
  items: MaterialCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listMaterialCatalog(
  filters: CatalogListFilters = {},
): Promise<MaterialCatalogItem[]> {
  const result = await listMaterialCatalogPaged(filters);
  return result.items;
}

export async function listMaterialCatalogPaged(
  filters: CatalogListFilters = {},
): Promise<CatalogListResult> {
  const supabase = await createClient();
  const pageSize = filters.pageSize ?? CATALOG_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("material_catalog")
    .select("*, material_categories (*), material_catalog_images (*)", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.favoriteOnly) query = query.eq("is_favorite", true);
  if (filters.q) {
    const q = filters.q.trim().replace(/[%_,]/g, " ");
    query = query.or(
      `product_name.ilike.%${q}%,brand.ilike.%${q}%,model_number.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    items: (data ?? []) as MaterialCatalogItem[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listCatalogBrands(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_catalog")
    .select("brand")
    .is("deleted_at", null)
    .not("brand", "is", null);

  if (error) throw new Error(error.message);
  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.brand)
        .filter((b): b is string => Boolean(b && String(b).trim())),
    ),
  ].sort((a, b) => a.localeCompare(b, "ko"));
}

export async function listFavoriteCatalog(): Promise<MaterialCatalogItem[]> {
  return listMaterialCatalog({ favoriteOnly: true, pageSize: 100 });
}

export async function getCatalogItem(
  id: string,
): Promise<MaterialCatalogItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_catalog")
    .select("*, material_categories (*), material_catalog_images (*)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const item = data as MaterialCatalogItem;
  if (item.material_catalog_images) {
    item.material_catalog_images = [...item.material_catalog_images].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }
  return item;
}

async function countImages(materialId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("material_catalog_images")
    .select("id", { count: "exact", head: true })
    .eq("material_id", materialId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function uploadCatalogImages(input: {
  materialId: string;
  files: File[];
  userId: string;
  asCoverFirst: boolean;
}) {
  if (!input.files.length) return;
  const current = await countImages(input.materialId);
  if (current + input.files.length > MATERIAL_MAX_IMAGES) {
    throw new Error(`사진은 자재당 최대 ${MATERIAL_MAX_IMAGES}장까지입니다.`);
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("material_catalog_images")
    .select("sort_order")
    .eq("material_id", input.materialId)
    .order("sort_order", { ascending: false })
    .limit(1);

  let order = (existing?.[0]?.sort_order ?? -1) + 1;
  let makeNextCover = input.asCoverFirst;

  if (input.asCoverFirst) {
    await supabase
      .from("material_catalog_images")
      .update({ is_cover: false })
      .eq("material_id", input.materialId);
  } else {
    const { data: hasCover } = await supabase
      .from("material_catalog_images")
      .select("id")
      .eq("material_id", input.materialId)
      .eq("is_cover", true)
      .limit(1);
    makeNextCover = !hasCover?.length;
  }

  let coverPath: string | null = null;

  for (const file of input.files) {
    assertImageFile(file);
    const safe = sanitizeFileName(file.name);
    const path = `${input.materialId}/${Date.now()}-${order}-${safe}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upError } = await supabase.storage
      .from(CATALOG_BUCKET)
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upError) throw new Error(upError.message);

    const isCover = makeNextCover;
    makeNextCover = false;
    if (isCover) coverPath = path;

    const { error: imgError } = await supabase.from("material_catalog_images").insert({
      material_id: input.materialId,
      file_path: path,
      file_name: safe,
      file_type: file.type || null,
      file_size: file.size,
      is_cover: isCover,
      sort_order: order,
      created_by: input.userId,
    });
    if (imgError) throw new Error(imgError.message);
    order += 1;
  }

  if (coverPath) {
    await supabase
      .from("material_catalog")
      .update({ cover_image_path: coverPath })
      .eq("id", input.materialId);
  }
}

export async function createCatalogItem(input: {
  form: CatalogFormInput;
  coverFiles?: File[];
  galleryFiles?: File[];
}): Promise<MaterialCatalogItem> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("material_catalog")
    .insert({
      category_id: input.form.category_id,
      brand: input.form.brand,
      product_name: input.form.product_name,
      model_number: input.form.model_number,
      color: input.form.color,
      specification: input.form.specification,
      unit: input.form.unit,
      base_price: input.form.base_price,
      supplier: input.form.supplier,
      description: input.form.description,
      internal_memo: input.form.internal_memo,
      is_favorite: input.form.is_favorite,
      is_active: input.form.is_active,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "카탈로그 등록 실패");

  await uploadCatalogImages({
    materialId: data.id,
    files: input.coverFiles ?? [],
    userId: access.userId!,
    asCoverFirst: true,
  });
  await uploadCatalogImages({
    materialId: data.id,
    files: input.galleryFiles ?? [],
    userId: access.userId!,
    asCoverFirst: false,
  });

  await writeAuditLog({
    entity_type: "material_catalog",
    entity_id: data.id,
    action: "create",
    payload: {
      product_name: data.product_name,
      category_id: data.category_id,
    },
  });

  return (await getCatalogItem(data.id))!;
}

export async function updateCatalogItem(input: {
  id: string;
  form: CatalogFormInput;
  coverFiles?: File[];
  galleryFiles?: File[];
}): Promise<MaterialCatalogItem> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("material_catalog")
    .update({
      category_id: input.form.category_id,
      brand: input.form.brand,
      product_name: input.form.product_name,
      model_number: input.form.model_number,
      color: input.form.color,
      specification: input.form.specification,
      unit: input.form.unit,
      base_price: input.form.base_price,
      supplier: input.form.supplier,
      description: input.form.description,
      internal_memo: input.form.internal_memo,
      is_favorite: input.form.is_favorite,
      is_active: input.form.is_active,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  await uploadCatalogImages({
    materialId: input.id,
    files: input.coverFiles ?? [],
    userId: access.userId!,
    asCoverFirst: true,
  });
  await uploadCatalogImages({
    materialId: input.id,
    files: input.galleryFiles ?? [],
    userId: access.userId!,
    asCoverFirst: false,
  });

  await writeAuditLog({
    entity_type: "material_catalog",
    entity_id: input.id,
    action: "update",
    payload: { product_name: input.form.product_name },
  });

  return (await getCatalogItem(input.id))!;
}

export async function softDeleteCatalogItem(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_catalog")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
      is_active: false,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id, product_name, category_id")
    .single();

  if (error || !data) throw new Error(error?.message || "삭제 실패");

  await writeAuditLog({
    entity_type: "material_catalog",
    entity_id: input.id,
    action: "soft_delete",
    payload: {
      product_name: data.product_name,
      category_id: data.category_id,
      delete_reason: reason,
    },
  });
}

export async function duplicateCatalogItem(
  id: string,
): Promise<MaterialCatalogItem> {
  const access = await requireAuthenticatedAccess();
  const src = await getCatalogItem(id);
  if (!src) throw new Error("원본 자재를 찾을 수 없습니다.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_catalog")
    .insert({
      category_id: src.category_id,
      brand: src.brand,
      product_name: `${src.product_name} (복제)`,
      model_number: src.model_number,
      color: src.color,
      specification: src.specification,
      unit: src.unit,
      base_price: src.base_price ?? 0,
      supplier: src.supplier,
      description: src.description,
      internal_memo: src.internal_memo,
      is_favorite: false,
      is_active: true,
      cover_image_path: src.cover_image_path,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "복제 실패");

  const images = src.material_catalog_images ?? [];
  if (images.length) {
    const rows = images.map((img, index) => ({
      material_id: data.id,
      file_path: img.file_path,
      file_name: img.file_name,
      file_type: img.file_type,
      file_size: img.file_size,
      is_cover: img.is_cover,
      sort_order: img.sort_order ?? index,
      created_by: access.userId,
    }));
    const { error: imgError } = await supabase
      .from("material_catalog_images")
      .insert(rows);
    if (imgError) throw new Error(imgError.message);
  }

  await writeAuditLog({
    entity_type: "material_catalog",
    entity_id: data.id,
    action: "duplicate",
    payload: { source_id: id, product_name: data.product_name },
  });

  return (await getCatalogItem(data.id))!;
}

export async function toggleCatalogFavorite(id: string, isFavorite: boolean) {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { error } = await supabase
    .from("material_catalog")
    .update({ is_favorite: isFavorite, updated_by: access.userId })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
}

export async function setCatalogImageCover(input: {
  materialId: string;
  imageId: string;
}) {
  await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { data: image, error } = await supabase
    .from("material_catalog_images")
    .select("*")
    .eq("id", input.imageId)
    .eq("material_id", input.materialId)
    .maybeSingle();
  if (error || !image) throw new Error(error?.message || "이미지를 찾을 수 없습니다.");

  await supabase
    .from("material_catalog_images")
    .update({ is_cover: false })
    .eq("material_id", input.materialId);
  await supabase
    .from("material_catalog_images")
    .update({ is_cover: true })
    .eq("id", input.imageId);
  await supabase
    .from("material_catalog")
    .update({ cover_image_path: image.file_path })
    .eq("id", input.materialId);
}

export async function reorderCatalogImage(input: {
  materialId: string;
  imageId: string;
  direction: "up" | "down";
}) {
  await requireAuthenticatedAccess();
  const item = await getCatalogItem(input.materialId);
  if (!item) throw new Error("자재를 찾을 수 없습니다.");
  const images = [...(item.material_catalog_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const index = images.findIndex((img) => img.id === input.imageId);
  if (index < 0) throw new Error("이미지를 찾을 수 없습니다.");
  const swap = input.direction === "up" ? index - 1 : index + 1;
  if (swap < 0 || swap >= images.length) return;

  const a = images[index]!;
  const b = images[swap]!;
  const supabase = await createClient();
  await supabase
    .from("material_catalog_images")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  await supabase
    .from("material_catalog_images")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
}

export async function createSignedCatalogUrl(
  filePath: string,
  expiresInSeconds = 60 * 30,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(CATALOG_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "이미지 URL 생성 실패");
  }
  return data.signedUrl;
}
