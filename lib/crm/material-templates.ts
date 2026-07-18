import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import { createSiteMaterial } from "@/lib/crm/site-materials";
import type {
  MaterialTemplate,
  MaterialTemplateItem,
  ProjectMaterial,
} from "@/types/database";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export type TemplateItemData = {
  category_id: string;
  catalog_material_id?: string | null;
  space_name?: string | null;
  brand?: string | null;
  product_name: string;
  model_number?: string | null;
  color?: string | null;
  specification?: string | null;
  application_location?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number;
  additional_price?: number;
  supplier?: string | null;
  staff_note?: string | null;
  site_note?: string | null;
};

export function materialToTemplateItem(m: ProjectMaterial): TemplateItemData {
  return {
    category_id: m.category_id,
    catalog_material_id: m.catalog_material_id,
    space_name: m.space_name,
    brand: m.brand,
    product_name: m.product_name,
    model_number: m.model_number,
    color: m.color,
    specification: m.specification,
    application_location: m.application_location,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: m.unit_price ?? 0,
    additional_price: m.additional_price ?? 0,
    supplier: m.supplier,
    staff_note: m.staff_note,
    site_note: m.site_note,
  };
}

export async function listMaterialTemplates(): Promise<MaterialTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_templates")
    .select("*, material_template_items (*)")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error("자재 묶음 목록을 불러오지 못했습니다.");
  return ((data ?? []) as MaterialTemplate[]).map((t) => ({
    ...t,
    material_template_items: [...(t.material_template_items ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));
}

export async function getMaterialTemplate(
  id: string,
): Promise<MaterialTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_templates")
    .select("*, material_template_items (*)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("자재 묶음을 불러오지 못했습니다.");
  if (!data) return null;
  const t = data as MaterialTemplate;
  t.material_template_items = [...(t.material_template_items ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  return t;
}

export async function saveMaterialsAsTemplate(input: {
  name: string;
  description?: string | null;
  materials: ProjectMaterial[];
}): Promise<MaterialTemplate> {
  const access = await requireAuthenticatedAccess();
  const name = input.name.trim();
  if (!name) throw new Error("묶음 이름을 입력해 주세요.");
  if (!input.materials.length) {
    throw new Error("저장할 자재가 없습니다.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_templates")
    .insert({
      name,
      description: emptyToNull(input.description),
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("자재 묶음 저장에 실패했습니다.");

  const rows = input.materials.map((m, index) => ({
    template_id: data.id,
    sort_order: index,
    item_data: materialToTemplateItem(m),
  }));

  const { error: itemsError } = await supabase
    .from("material_template_items")
    .insert(rows);
  if (itemsError) throw new Error("자재 묶음 항목 저장에 실패했습니다.");

  return (await getMaterialTemplate(data.id))!;
}

export async function softDeleteMaterialTemplate(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("material_templates")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) throw new Error("자재 묶음 삭제에 실패했습니다.");
}

export async function applyMaterialTemplate(input: {
  templateId: string;
  customerId: string;
  projectId?: string | null;
}): Promise<number> {
  const template = await getMaterialTemplate(input.templateId);
  if (!template) throw new Error("자재 묶음을 찾을 수 없습니다.");

  const items = (template.material_template_items ??
    []) as MaterialTemplateItem[];
  let created = 0;

  for (const item of items) {
    const d = item.item_data as TemplateItemData;
    if (!d?.category_id || !d?.product_name) continue;
    await createSiteMaterial({
      form: {
        customer_id: input.customerId,
        project_id: input.projectId ?? null,
        catalog_material_id: d.catalog_material_id ?? null,
        category_id: d.category_id,
        space_name: d.space_name ?? "공통",
        brand: d.brand ?? null,
        product_name: d.product_name,
        model_number: d.model_number ?? null,
        color: d.color ?? null,
        specification: d.specification ?? null,
        application_location: d.application_location ?? null,
        quantity: d.quantity ?? 1,
        unit: d.unit ?? "개",
        unit_price: Number(d.unit_price ?? 0),
        additional_price: Number(d.additional_price ?? 0),
        supplier: d.supplier ?? null,
        delivery_expected_at: null,
        expected_delivery_at: null,
        order_status: "미발주",
        order_note: null,
        note: d.site_note ?? d.staff_note ?? null,
        staff_note: d.staff_note ?? null,
        site_note: d.site_note ?? null,
        is_active: true,
        save_to_catalog: false,
        force_save_catalog: false,
      },
    });
    created += 1;
  }

  return created;
}
