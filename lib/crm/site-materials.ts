import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import { writeAuditLog } from "@/lib/crm/customers";
import { createCatalogItem, getCatalogItem } from "@/lib/crm/catalog";
import {
  MATERIAL_ALLOWED_MIME,
  MATERIAL_MAX_FILE_BYTES,
  MATERIAL_MAX_IMAGES,
  PROJECT_MATERIALS_BUCKET,
} from "@/lib/crm/material-constants";
import { writeMaterialHistory } from "@/lib/crm/site-material-ops";
import type { MaterialCatalogItem, ProjectMaterial } from "@/types/database";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function parsePrice(value: FormDataEntryValue | null, label: string): number {
  const raw = String(value ?? "0").replace(/,/g, "").trim();
  const num = Number(raw || 0);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    throw new Error(`${label}은(는) 0 이상 정수(원)여야 합니다.`);
  }
  return num;
}

function parseQuantity(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("수량은 0 이상이어야 합니다.");
  }
  return Math.round(num * 1000) / 1000;
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

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export type SiteMaterialFormInput = {
  customer_id: string;
  project_id: string | null;
  catalog_material_id: string | null;
  category_id: string;
  space_name: string | null;
  brand: string | null;
  product_name: string;
  model_number: string | null;
  color: string | null;
  specification: string | null;
  application_location: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number;
  additional_price: number;
  supplier: string | null;
  delivery_expected_at: string | null;
  expected_delivery_at: string | null;
  order_status: string;
  order_note: string | null;
  note: string | null;
  staff_note: string | null;
  site_note: string | null;
  is_active: boolean;
  save_to_catalog: boolean;
  force_save_catalog: boolean;
};

export function parseSiteMaterialForm(formData: FormData): SiteMaterialFormInput {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const productName = String(formData.get("product_name") ?? "").trim();
  if (!customerId) throw new Error("고객 정보가 없습니다.");
  if (!categoryId) throw new Error("자재분류를 선택해 주세요.");
  if (!productName) throw new Error("제품명을 입력해 주세요.");

  const unitPriceRaw =
    formData.get("unit_price") ?? formData.get("base_price");
  const delivery =
    emptyToNull(String(formData.get("expected_delivery_at") ?? "")) ||
    emptyToNull(String(formData.get("delivery_expected_at") ?? ""));
  const orderStatus =
    emptyToNull(String(formData.get("order_status") ?? "")) || "미발주";

  return {
    customer_id: customerId,
    project_id: emptyToNull(String(formData.get("project_id") ?? "")),
    catalog_material_id: emptyToNull(
      String(formData.get("catalog_material_id") ?? ""),
    ),
    category_id: categoryId,
    space_name: emptyToNull(String(formData.get("space_name") ?? "")),
    brand: emptyToNull(String(formData.get("brand") ?? "")),
    product_name: productName,
    model_number: emptyToNull(String(formData.get("model_number") ?? "")),
    color: emptyToNull(String(formData.get("color") ?? "")),
    specification: emptyToNull(String(formData.get("specification") ?? "")),
    application_location: emptyToNull(
      String(formData.get("application_location") ?? ""),
    ),
    quantity: parseQuantity(formData.get("quantity")),
    unit: emptyToNull(String(formData.get("unit") ?? "")),
    unit_price: parsePrice(unitPriceRaw, "단가"),
    additional_price: parsePrice(formData.get("additional_price"), "추가금액"),
    supplier: emptyToNull(String(formData.get("supplier") ?? "")),
    delivery_expected_at: delivery,
    expected_delivery_at: delivery,
    order_status: orderStatus,
    order_note: emptyToNull(String(formData.get("order_note") ?? "")),
    note:
      emptyToNull(String(formData.get("note") ?? "")) ||
      emptyToNull(String(formData.get("site_note") ?? "")) ||
      emptyToNull(String(formData.get("staff_note") ?? "")),
    staff_note: emptyToNull(String(formData.get("staff_note") ?? "")),
    site_note:
      emptyToNull(String(formData.get("site_note") ?? "")) ||
      emptyToNull(String(formData.get("note") ?? "")),
    is_active: ["on", "true", "1"].includes(
      String(formData.get("is_active") ?? "true").toLowerCase(),
    ),
    save_to_catalog: ["on", "true", "1"].includes(
      String(formData.get("save_to_catalog") ?? "").toLowerCase(),
    ),
    force_save_catalog: ["on", "true", "1"].includes(
      String(formData.get("force_save_catalog") ?? "").toLowerCase(),
    ),
  };
}

const SELECT =
  "*, material_categories (*), project_material_images (*)";

function sortImages(item: ProjectMaterial): ProjectMaterial {
  if (item.project_material_images) {
    item.project_material_images = [...item.project_material_images].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }
  return item;
}

export async function listCustomerMaterials(
  customerId: string,
  options?: { includeDeleted?: boolean; projectId?: string | null },
): Promise<ProjectMaterial[]> {
  const supabase = await createClient();
  let query = supabase
    .from("project_materials")
    .select(SELECT)
    .eq("customer_id", customerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.projectId) {
    query = query.eq("project_id", options.projectId);
  }
  if (!options?.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) throw new Error("자재 목록을 불러오지 못했습니다.");
  return ((data ?? []) as ProjectMaterial[]).map(sortImages);
}

export async function listProjectIdMaterials(
  projectId: string,
  options?: { includeDeleted?: boolean },
): Promise<ProjectMaterial[]> {
  const supabase = await createClient();
  let query = supabase
    .from("project_materials")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (!options?.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) throw new Error("자재 목록을 불러오지 못했습니다.");
  return ((data ?? []) as ProjectMaterial[]).map(sortImages);
}

export async function getSiteMaterial(
  id: string,
  options?: { includeDeleted?: boolean },
): Promise<ProjectMaterial | null> {
  const supabase = await createClient();
  let query = supabase.from("project_materials").select(SELECT).eq("id", id);
  if (!options?.includeDeleted) {
    query = query.is("deleted_at", null);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("자재를 불러오지 못했습니다.");
  return data ? sortImages(data as ProjectMaterial) : null;
}

/** 최근 현장에 사용된 카탈로그 자재 ID (최신순) */
export async function listRecentCatalogMaterialIds(
  limit = 12,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_materials")
    .select("catalog_material_id, created_at")
    .not("catalog_material_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return [];
  const ids: string[] = [];
  for (const row of data ?? []) {
    const id = row.catalog_material_id as string | null;
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function nextSortOrder(customerId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_materials")
    .select("sort_order")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? -1) + 1;
}

/** 카탈로그 중복(제품명·모델번호) 조회 */
export async function findCatalogDuplicates(input: {
  productName: string;
  modelNumber?: string | null;
}): Promise<MaterialCatalogItem[]> {
  const supabase = await createClient();
  const name = input.productName.trim();
  if (!name) return [];

  const query = supabase
    .from("material_catalog")
    .select("*, material_categories (*)")
    .is("deleted_at", null)
    .ilike("product_name", name)
    .limit(10);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const model = (input.modelNumber ?? "").trim();
  const rows = (data ?? []) as MaterialCatalogItem[];
  if (!model) return rows;
  return rows.filter(
    (r) =>
      (r.model_number ?? "").trim().toLowerCase() === model.toLowerCase() ||
      (r.product_name ?? "").trim().toLowerCase() === name.toLowerCase(),
  );
}

async function uploadSiteImages(input: {
  customerId: string;
  materialId: string;
  files: File[];
  userId: string;
}) {
  if (!input.files.length) return;
  const supabase = await createClient();
  const { count } = await supabase
    .from("project_material_images")
    .select("id", { count: "exact", head: true })
    .eq("material_id", input.materialId);
  const current = count ?? 0;
  if (current + input.files.length > MATERIAL_MAX_IMAGES) {
    throw new Error(`사진은 자재당 최대 ${MATERIAL_MAX_IMAGES}장까지입니다.`);
  }

  const { data: existing } = await supabase
    .from("project_material_images")
    .select("sort_order, is_cover")
    .eq("material_id", input.materialId)
    .order("sort_order", { ascending: false });

  let order = (existing?.[0]?.sort_order ?? -1) + 1;
  let hasCover = Boolean(existing?.some((r) => r.is_cover));
  let coverPath: string | null = null;

  for (const file of input.files) {
    assertImageFile(file);
    const ext = extFromFile(file);
    const path = `${input.customerId}/${input.materialId}/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upError } = await supabase.storage
      .from(PROJECT_MATERIALS_BUCKET)
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upError) throw new Error(upError.message);

    const isCover = !hasCover;
    hasCover = true;
    if (isCover) coverPath = path;

    const { error: imgError } = await supabase
      .from("project_material_images")
      .insert({
        material_id: input.materialId,
        file_path: path,
        file_name: file.name,
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
      .from("project_materials")
      .update({ cover_image_path: coverPath })
      .eq("id", input.materialId);
  }
}

export async function setSiteImageCover(input: {
  materialId: string;
  imageId: string;
}) {
  await requireAuthenticatedAccess();
  const before = await getSiteMaterial(input.materialId);
  const supabase = await createClient();
  const { data: image, error } = await supabase
    .from("project_material_images")
    .select("*")
    .eq("id", input.imageId)
    .eq("material_id", input.materialId)
    .maybeSingle();
  if (error || !image) throw new Error("이미지를 찾을 수 없습니다.");

  await supabase
    .from("project_material_images")
    .update({ is_cover: false })
    .eq("material_id", input.materialId);
  await supabase
    .from("project_material_images")
    .update({ is_cover: true })
    .eq("id", input.imageId);
  await supabase
    .from("project_materials")
    .update({ cover_image_path: image.file_path })
    .eq("id", input.materialId);

  const after = await getSiteMaterial(input.materialId);
  if (before && after) {
    await writeMaterialHistory({
      projectMaterialId: input.materialId,
      customerId: after.customer_id,
      projectId: after.project_id,
      action: "대표사진 변경",
      before,
      after,
    });
  }
}

export class CatalogDuplicateError extends Error {
  duplicates: MaterialCatalogItem[];
  constructor(duplicates: MaterialCatalogItem[]) {
    super("CATALOG_DUPLICATE");
    this.duplicates = duplicates;
  }
}

export async function createSiteMaterial(input: {
  form: SiteMaterialFormInput;
  files?: File[];
}): Promise<ProjectMaterial> {
  const access = await requireAuthenticatedAccess();
  let catalogId = input.form.catalog_material_id;

  if (input.form.save_to_catalog && !catalogId) {
    const duplicates = await findCatalogDuplicates({
      productName: input.form.product_name,
      modelNumber: input.form.model_number,
    });
    if (duplicates.length > 0 && !input.form.force_save_catalog) {
      throw new CatalogDuplicateError(duplicates);
    }

    const catalog = await createCatalogItem({
      form: {
        category_id: input.form.category_id,
        brand: input.form.brand,
        product_name: input.form.product_name,
        model_number: input.form.model_number,
        color: input.form.color,
        specification: input.form.specification,
        unit: input.form.unit,
        base_price: input.form.unit_price,
        supplier: input.form.supplier,
        description: input.form.staff_note,
        internal_memo: null,
        is_favorite: false,
        is_active: true,
      },
      coverFiles: input.files?.slice(0, 1),
      galleryFiles: input.files?.slice(1),
    });
    catalogId = catalog.id;
  }

  const delivery =
    input.form.expected_delivery_at || input.form.delivery_expected_at;
  const supabase = await createClient();
  const sortOrder = await nextSortOrder(input.form.customer_id);
  const { data, error } = await supabase
    .from("project_materials")
    .insert({
      customer_id: input.form.customer_id,
      project_id: input.form.project_id,
      catalog_material_id: catalogId,
      category_id: input.form.category_id,
      space_name: input.form.space_name,
      brand: input.form.brand,
      product_name: input.form.product_name,
      model_number: input.form.model_number,
      color: input.form.color,
      specification: input.form.specification,
      application_location: input.form.application_location,
      quantity: input.form.quantity,
      unit: input.form.unit,
      unit_price: input.form.unit_price,
      additional_price: input.form.additional_price,
      supplier: input.form.supplier,
      delivery_expected_at: delivery,
      expected_delivery_at: delivery,
      order_status: input.form.order_status || "미발주",
      order_note: input.form.order_note,
      note: input.form.note,
      staff_note: input.form.staff_note || input.form.note,
      site_note: input.form.site_note || input.form.note,
      sort_order: sortOrder,
      is_active: input.form.is_active,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("현장 자재 등록에 실패했습니다.");

  await uploadSiteImages({
    customerId: input.form.customer_id,
    materialId: data.id,
    files: input.files ?? [],
    userId: access.userId!,
  });

  if (!(input.files?.length) && catalogId) {
    const catalog = await getCatalogItem(catalogId);
    if (catalog?.cover_image_path) {
      await supabase
        .from("project_materials")
        .update({ cover_image_path: catalog.cover_image_path })
        .eq("id", data.id);
    }
  }

  const created = (await getSiteMaterial(data.id))!;
  await writeMaterialHistory({
    projectMaterialId: created.id,
    customerId: created.customer_id,
    projectId: created.project_id,
    action: "등록",
    before: null,
    after: created,
  });
  await writeAuditLog({
    entity_type: "project_material",
    entity_id: data.id,
    action: "create",
    payload: {
      customer_id: data.customer_id,
      product_name: data.product_name,
    },
  });

  return created;
}

export async function addFromCatalog(input: {
  customerId: string;
  projectId?: string | null;
  catalogId: string;
  spaceName?: string | null;
  color?: string | null;
  quantity?: number | null;
  applicationLocation?: string | null;
  additionalPrice?: number;
  unitPrice?: number;
}): Promise<ProjectMaterial> {
  const catalog = await getCatalogItem(input.catalogId);
  if (!catalog) throw new Error("카탈로그 자재를 찾을 수 없습니다.");

  return createSiteMaterial({
    form: {
      customer_id: input.customerId,
      project_id: input.projectId ?? null,
      catalog_material_id: catalog.id,
      category_id: catalog.category_id,
      space_name: emptyToNull(input.spaceName) || "공통",
      brand: catalog.brand,
      product_name: catalog.product_name,
      model_number: catalog.model_number,
      color: input.color !== undefined ? emptyToNull(input.color) : catalog.color,
      specification: catalog.specification,
      application_location: emptyToNull(input.applicationLocation),
      quantity: input.quantity ?? 1,
      unit: catalog.unit,
      unit_price: input.unitPrice ?? catalog.base_price ?? 0,
      additional_price: input.additionalPrice ?? 0,
      supplier: catalog.supplier,
      delivery_expected_at: null,
      expected_delivery_at: null,
      order_status: "미발주",
      order_note: null,
      note: catalog.description,
      staff_note: catalog.description,
      site_note: null,
      is_active: true,
      save_to_catalog: false,
      force_save_catalog: false,
    },
  });
}

export async function updateSiteMaterial(input: {
  id: string;
  form: SiteMaterialFormInput;
  files?: File[];
}): Promise<ProjectMaterial> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();
  const before = await getSiteMaterial(input.id);
  if (!before) throw new Error("자재를 찾을 수 없습니다.");

  const delivery =
    input.form.expected_delivery_at || input.form.delivery_expected_at;

  const { error } = await supabase
    .from("project_materials")
    .update({
      project_id: input.form.project_id,
      catalog_material_id: input.form.catalog_material_id,
      category_id: input.form.category_id,
      space_name: input.form.space_name,
      brand: input.form.brand,
      product_name: input.form.product_name,
      model_number: input.form.model_number,
      color: input.form.color,
      specification: input.form.specification,
      application_location: input.form.application_location,
      quantity: input.form.quantity,
      unit: input.form.unit,
      unit_price: input.form.unit_price,
      additional_price: input.form.additional_price,
      supplier: input.form.supplier,
      delivery_expected_at: delivery,
      expected_delivery_at: delivery,
      order_status: input.form.order_status || before.order_status || "미발주",
      order_note: input.form.order_note,
      note: input.form.note,
      staff_note: input.form.staff_note || input.form.note,
      site_note: input.form.site_note || input.form.note,
      is_active: input.form.is_active,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) throw new Error("자재 수정에 실패했습니다.");

  await uploadSiteImages({
    customerId: before.customer_id,
    materialId: input.id,
    files: input.files ?? [],
    userId: access.userId!,
  });

  const after = (await getSiteMaterial(input.id))!;
  await writeMaterialHistory({
    projectMaterialId: input.id,
    customerId: after.customer_id,
    projectId: after.project_id,
    action: "수정",
    before,
    after,
  });
  await writeAuditLog({
    entity_type: "project_material",
    entity_id: input.id,
    action: "update",
    payload: { product_name: input.form.product_name },
  });

  return after;
}

export async function duplicateSiteMaterial(id: string): Promise<ProjectMaterial> {
  const src = await getSiteMaterial(id);
  if (!src) throw new Error("원본 자재를 찾을 수 없습니다.");

  const created = await createSiteMaterial({
    form: {
      customer_id: src.customer_id,
      project_id: src.project_id,
      catalog_material_id: src.catalog_material_id,
      category_id: src.category_id,
      space_name: src.space_name,
      brand: src.brand,
      product_name: `${src.product_name} (복제)`,
      model_number: src.model_number,
      color: src.color,
      specification: src.specification,
      application_location: src.application_location,
      quantity: src.quantity,
      unit: src.unit,
      unit_price: src.unit_price ?? 0,
      additional_price: src.additional_price ?? 0,
      supplier: src.supplier,
      delivery_expected_at: getDeliveryFallback(src),
      expected_delivery_at: getDeliveryFallback(src),
      order_status: "미발주",
      order_note: null,
      note: src.note || src.site_note || src.staff_note,
      staff_note: src.staff_note,
      site_note: src.site_note,
      is_active: true,
      save_to_catalog: false,
      force_save_catalog: false,
    },
  });

  await writeMaterialHistory({
    projectMaterialId: created.id,
    customerId: created.customer_id,
    projectId: created.project_id,
    action: "복제",
    before: src,
    after: created,
    reason: `원본: ${src.product_name}`,
  });

  return created;
}

function getDeliveryFallback(m: ProjectMaterial): string | null {
  return m.expected_delivery_at || m.delivery_expected_at || null;
}

export async function softDeleteSiteMaterial(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");

  const before = await getSiteMaterial(input.id);
  if (!before) throw new Error("자재를 찾을 수 없습니다.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_materials")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
      is_active: false,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) throw new Error("삭제에 실패했습니다.");

  await writeMaterialHistory({
    projectMaterialId: input.id,
    customerId: data.customer_id,
    projectId: data.project_id,
    action: "삭제",
    before,
    after: data as ProjectMaterial,
    reason,
  });
  await writeAuditLog({
    entity_type: "project_material",
    entity_id: input.id,
    action: "soft_delete",
    payload: {
      product_name: data.product_name,
      customer_id: data.customer_id,
      delete_reason: reason,
    },
  });
}

export async function reorderSiteMaterial(input: {
  id: string;
  direction: "up" | "down";
}) {
  const access = await requireAuthenticatedAccess();
  const current = await getSiteMaterial(input.id);
  if (!current) throw new Error("자재를 찾을 수 없습니다.");

  const list = current.project_id
    ? await listProjectIdMaterials(current.project_id)
    : await listCustomerMaterials(current.customer_id);
  const index = list.findIndex((m) => m.id === input.id);
  if (index < 0) return;
  const swap = input.direction === "up" ? index - 1 : index + 1;
  if (swap < 0 || swap >= list.length) return;

  const a = list[index]!;
  const b = list[swap]!;
  const supabase = await createClient();
  await supabase
    .from("project_materials")
    .update({ sort_order: b.sort_order, updated_by: access.userId })
    .eq("id", a.id);
  await supabase
    .from("project_materials")
    .update({ sort_order: a.sort_order, updated_by: access.userId })
    .eq("id", b.id);
}

/** 드래그 정렬: 전체 id 순서대로 sort_order 재부여 */
export async function reorderSiteMaterialsByIds(input: {
  customerId: string;
  projectId?: string | null;
  orderedIds: string[];
}) {
  const access = await requireAuthenticatedAccess();
  if (!input.orderedIds.length) return;
  const supabase = await createClient();

  for (let i = 0; i < input.orderedIds.length; i += 1) {
    const id = input.orderedIds[i]!;
    const { error } = await supabase
      .from("project_materials")
      .update({ sort_order: i, updated_by: access.userId })
      .eq("id", id)
      .eq("customer_id", input.customerId)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
  }
}

export async function listRecentSpaceNames(
  customerId: string,
): Promise<string[]> {
  const materials = await listCustomerMaterials(customerId);
  const names = materials
    .map((m) => m.space_name)
    .filter((n): n is string => Boolean(n && n.trim()));
  return [...new Set(names)];
}

export function calcTotalAdditionalPrice(materials: ProjectMaterial[]): number {
  return materials.reduce((sum, m) => sum + (m.additional_price ?? 0), 0);
}

export function calcLineAmount(m: ProjectMaterial): number {
  const qty = Number(m.quantity ?? 0);
  const price = Number(m.unit_price ?? 0);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return Math.round(qty * price);
}

export function calcTotalLineAmount(materials: ProjectMaterial[]): number {
  return materials.reduce((sum, m) => sum + calcLineAmount(m), 0);
}

export function groupBySpace(
  materials: ProjectMaterial[],
): { space: string; items: ProjectMaterial[] }[] {
  const map = new Map<string, ProjectMaterial[]>();
  for (const m of materials) {
    const key = m.space_name?.trim() || "공통";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()].map(([space, items]) => ({ space, items }));
}

export function groupByCategory(
  materials: ProjectMaterial[],
): { category: string; items: ProjectMaterial[] }[] {
  const map = new Map<string, ProjectMaterial[]>();
  for (const m of materials) {
    const key = m.material_categories?.name || "미분류";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}

export async function createSignedProjectMaterialUrl(
  filePath: string,
  expiresInSeconds = 60 * 30,
): Promise<string> {
  const supabase = await createClient();
  let result = await supabase.storage
    .from(PROJECT_MATERIALS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  if (!result.data?.signedUrl) {
    result = await supabase.storage
      .from("material-catalog")
      .createSignedUrl(filePath, expiresInSeconds);
  }
  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message || "이미지 URL 생성 실패");
  }
  return result.data.signedUrl;
}

export async function createSignedUrlsForPaths(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out: Record<string, string> = {};
  await Promise.all(
    unique.map(async (path) => {
      try {
        out[path] = await createSignedProjectMaterialUrl(path);
      } catch {
        // ignore
      }
    }),
  );
  return out;
}
