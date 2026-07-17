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
import type { ProjectMaterial } from "@/types/database";

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
  base_price: number;
  additional_price: number;
  supplier: string | null;
  delivery_expected_at: string | null;
  staff_note: string | null;
  site_note: string | null;
  is_active: boolean;
  save_to_catalog: boolean;
};

export function parseSiteMaterialForm(formData: FormData): SiteMaterialFormInput {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const productName = String(formData.get("product_name") ?? "").trim();
  if (!customerId) throw new Error("고객 정보가 없습니다.");
  if (!categoryId) throw new Error("자재분류를 선택해 주세요.");
  if (!productName) throw new Error("제품명을 입력해 주세요.");

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
    base_price: parsePrice(formData.get("base_price"), "기본단가"),
    additional_price: parsePrice(formData.get("additional_price"), "추가금액"),
    supplier: emptyToNull(String(formData.get("supplier") ?? "")),
    delivery_expected_at: emptyToNull(
      String(formData.get("delivery_expected_at") ?? ""),
    ),
    staff_note: emptyToNull(String(formData.get("staff_note") ?? "")),
    site_note: emptyToNull(String(formData.get("site_note") ?? "")),
    is_active: ["on", "true", "1"].includes(
      String(formData.get("is_active") ?? "true").toLowerCase(),
    ),
    save_to_catalog: ["on", "true", "1"].includes(
      String(formData.get("save_to_catalog") ?? "").toLowerCase(),
    ),
  };
}

const SELECT =
  "*, material_categories (*), project_material_images (*)";

export async function listCustomerMaterials(
  customerId: string,
): Promise<ProjectMaterial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_materials")
    .select(SELECT)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProjectMaterial[]).map(sortImages);
}

export async function listProjectIdMaterials(
  projectId: string,
): Promise<ProjectMaterial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_materials")
    .select(SELECT)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProjectMaterial[]).map(sortImages);
}

export async function getSiteMaterial(
  id: string,
): Promise<ProjectMaterial | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_materials")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? sortImages(data as ProjectMaterial) : null;
}

function sortImages(item: ProjectMaterial): ProjectMaterial {
  if (item.project_material_images) {
    item.project_material_images = [...item.project_material_images].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }
  return item;
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

export async function createSiteMaterial(input: {
  form: SiteMaterialFormInput;
  files?: File[];
}): Promise<ProjectMaterial> {
  const access = await requireAuthenticatedAccess();
  let catalogId = input.form.catalog_material_id;

  if (input.form.save_to_catalog && !catalogId) {
    const catalog = await createCatalogItem({
      form: {
        category_id: input.form.category_id,
        brand: input.form.brand,
        product_name: input.form.product_name,
        model_number: input.form.model_number,
        color: input.form.color,
        specification: input.form.specification,
        unit: input.form.unit,
        base_price: input.form.base_price,
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
      base_price: input.form.base_price,
      additional_price: input.form.additional_price,
      supplier: input.form.supplier,
      delivery_expected_at: input.form.delivery_expected_at,
      staff_note: input.form.staff_note,
      site_note: input.form.site_note,
      sort_order: sortOrder,
      is_active: input.form.is_active,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "현장 자재 등록 실패");

  await uploadSiteImages({
    customerId: input.form.customer_id,
    materialId: data.id,
    files: input.files ?? [],
    userId: access.userId!,
  });

  // 사진 없이 카탈로그만 동시저장한 경우 커버 경로 공유
  if (!(input.files?.length) && catalogId) {
    const catalog = await getCatalogItem(catalogId);
    if (catalog?.cover_image_path) {
      await supabase
        .from("project_materials")
        .update({ cover_image_path: catalog.cover_image_path })
        .eq("id", data.id);
    }
  }

  await writeAuditLog({
    entity_type: "project_material",
    entity_id: data.id,
    action: "create",
    payload: {
      customer_id: data.customer_id,
      product_name: data.product_name,
    },
  });

  return (await getSiteMaterial(data.id))!;
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
      base_price: catalog.base_price ?? 0,
      additional_price: input.additionalPrice ?? 0,
      supplier: catalog.supplier,
      delivery_expected_at: null,
      staff_note: catalog.description,
      site_note: null,
      is_active: true,
      save_to_catalog: false,
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
      base_price: input.form.base_price,
      additional_price: input.form.additional_price,
      supplier: input.form.supplier,
      delivery_expected_at: input.form.delivery_expected_at,
      staff_note: input.form.staff_note,
      site_note: input.form.site_note,
      is_active: input.form.is_active,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const existing = await getSiteMaterial(input.id);
  if (!existing) throw new Error("자재를 찾을 수 없습니다.");

  await uploadSiteImages({
    customerId: existing.customer_id,
    materialId: input.id,
    files: input.files ?? [],
    userId: access.userId!,
  });

  await writeAuditLog({
    entity_type: "project_material",
    entity_id: input.id,
    action: "update",
    payload: { product_name: input.form.product_name },
  });

  return (await getSiteMaterial(input.id))!;
}

export async function duplicateSiteMaterial(id: string): Promise<ProjectMaterial> {
  const src = await getSiteMaterial(id);
  if (!src) throw new Error("원본 자재를 찾을 수 없습니다.");

  return createSiteMaterial({
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
      base_price: src.base_price ?? 0,
      additional_price: src.additional_price ?? 0,
      supplier: src.supplier,
      delivery_expected_at: src.delivery_expected_at,
      staff_note: src.staff_note,
      site_note: src.site_note,
      is_active: true,
      save_to_catalog: false,
    },
  });
}

export async function softDeleteSiteMaterial(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");

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
    .select("id, product_name, customer_id")
    .single();

  if (error || !data) throw new Error(error?.message || "삭제 실패");

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

  const list = await listCustomerMaterials(current.customer_id);
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
  // 카탈로그 경로를 cover로 쓰는 경우 fallback
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
