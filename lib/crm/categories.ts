import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import { writeAuditLog } from "@/lib/crm/customers";
import type { MaterialCategory } from "@/types/database";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export type CategoryFormInput = {
  name: string;
  code: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export function parseCategoryForm(formData: FormData): CategoryFormInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("분류 이름을 입력해 주세요.");

  const sortRaw = String(formData.get("sort_order") ?? "0").trim();
  const sortOrder = Number(sortRaw || 0);
  if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder)) {
    throw new Error("순서는 정수여야 합니다.");
  }

  return {
    name,
    code: emptyToNull(String(formData.get("code") ?? "")),
    description: emptyToNull(String(formData.get("description") ?? "")),
    sort_order: sortOrder,
    is_active: ["on", "true", "1"].includes(
      String(formData.get("is_active") ?? "").toLowerCase(),
    ),
  };
}

export async function listMaterialCategories(options?: {
  includeInactive?: boolean;
}): Promise<MaterialCategory[]> {
  const supabase = await createClient();
  let query = supabase
    .from("material_categories")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialCategory[];
}

export async function createMaterialCategory(
  form: CategoryFormInput,
): Promise<MaterialCategory> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();

  const { data: dup } = await supabase
    .from("material_categories")
    .select("id")
    .eq("name", form.name)
    .is("deleted_at", null)
    .maybeSingle();
  if (dup) throw new Error("이미 같은 이름의 분류가 있습니다.");

  const { data, error } = await supabase
    .from("material_categories")
    .insert({
      name: form.name,
      code: form.code,
      description: form.description,
      sort_order: form.sort_order,
      is_active: form.is_active,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "분류 등록 실패");

  await writeAuditLog({
    entity_type: "material_category",
    entity_id: data.id,
    action: "create",
    payload: { name: data.name },
  });

  return data as MaterialCategory;
}

export async function updateMaterialCategory(input: {
  id: string;
  form: CategoryFormInput;
}): Promise<MaterialCategory> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();

  const { data: dup } = await supabase
    .from("material_categories")
    .select("id")
    .eq("name", input.form.name)
    .neq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (dup) throw new Error("이미 같은 이름의 분류가 있습니다.");

  const { data, error } = await supabase
    .from("material_categories")
    .update({
      name: input.form.name,
      code: input.form.code,
      description: input.form.description,
      sort_order: input.form.sort_order,
      is_active: input.form.is_active,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "분류 수정 실패");

  await writeAuditLog({
    entity_type: "material_category",
    entity_id: input.id,
    action: "update",
    payload: { name: data.name },
  });

  return data as MaterialCategory;
}

export async function reorderMaterialCategory(input: {
  id: string;
  direction: "up" | "down";
}) {
  const access = await requireAuthenticatedAccess();
  const categories = await listMaterialCategories({ includeInactive: true });
  const index = categories.findIndex((c) => c.id === input.id);
  if (index < 0) throw new Error("분류를 찾을 수 없습니다.");

  const swapWith =
    input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= categories.length) return;

  const a = categories[index]!;
  const b = categories[swapWith]!;
  const supabase = await createClient();

  const { error: e1 } = await supabase
    .from("material_categories")
    .update({ sort_order: b.sort_order, updated_by: access.userId })
    .eq("id", a.id);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from("material_categories")
    .update({ sort_order: a.sort_order, updated_by: access.userId })
    .eq("id", b.id);
  if (e2) throw new Error(e2.message);
}

export async function countCatalogByCategory(categoryId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("material_catalog")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function softDeleteMaterialCategory(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");

  const linked = await countCatalogByCategory(input.id);
  if (linked > 0) {
    throw new Error(
      `이 분류에 연결된 자재가 ${linked}건 있어 삭제할 수 없습니다. 비활성화를 사용해 주세요.`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_categories")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      is_active: false,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id, name")
    .single();

  if (error || !data) throw new Error(error?.message || "삭제 실패");

  await writeAuditLog({
    entity_type: "material_category",
    entity_id: input.id,
    action: "soft_delete",
    payload: { name: data.name, delete_reason: reason },
  });
}
