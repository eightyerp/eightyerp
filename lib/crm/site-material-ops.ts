import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/crm/material-constants";
import type {
  ProjectMaterial,
  ProjectMaterialHistory,
} from "@/types/database";

export {
  countDeliveryLate,
  countOrderWaiting,
  getDeliveryDate,
  getDeliveryRisk,
  isDeliveryLate,
  type DeliveryRisk,
  type DeliveryRiskLevel,
} from "@/lib/crm/site-material-risk";

const SNAPSHOT_KEYS = [
  "product_name",
  "brand",
  "model_number",
  "color",
  "specification",
  "space_name",
  "application_location",
  "quantity",
  "unit",
  "unit_price",
  "additional_price",
  "supplier",
  "expected_delivery_at",
  "delivery_expected_at",
  "order_status",
  "order_note",
  "staff_note",
  "site_note",
  "category_id",
  "cover_image_path",
  "is_active",
  "deleted_at",
  "delete_reason",
] as const;

export function snapshotMaterial(
  m: Partial<ProjectMaterial> | null | undefined,
): Record<string, unknown> | null {
  if (!m) return null;
  const out: Record<string, unknown> = {};
  for (const key of SNAPSHOT_KEYS) {
    if (key in m) out[key] = (m as Record<string, unknown>)[key] ?? null;
  }
  return out;
}

export async function writeMaterialHistory(input: {
  projectMaterialId: string;
  customerId: string;
  projectId?: string | null;
  action: string;
  before?: Partial<ProjectMaterial> | null;
  after?: Partial<ProjectMaterial> | null;
  reason?: string | null;
}) {
  try {
    const access = await requireAuthenticatedAccess();
    const supabase = await createClient();
    const { error } = await supabase.from("project_material_history").insert({
      project_material_id: input.projectMaterialId,
      customer_id: input.customerId,
      project_id: input.projectId ?? null,
      action: input.action,
      before_data: snapshotMaterial(input.before),
      after_data: snapshotMaterial(input.after),
      reason: input.reason?.trim() || null,
      changed_by: access.userId,
    });
    if (error) {
      // 이력 테이블 미적용 환경에서도 본 기능은 계속
      console.error("material history write failed:", error.message);
    }
  } catch (error) {
    console.error("material history write failed:", error);
  }
}

export async function listMaterialHistory(
  materialId: string,
): Promise<ProjectMaterialHistory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_material_history")
    .select("*")
    .eq("project_material_id", materialId)
    .order("changed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("변경 이력을 불러오지 못했습니다.");
  return (data ?? []) as ProjectMaterialHistory[];
}

export function parseOrderStatus(value: string): OrderStatus {
  const status = value.trim() as OrderStatus;
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new Error("발주상태가 올바르지 않습니다.");
  }
  return status;
}

export async function updateOrderStatus(input: {
  id: string;
  orderStatus: string;
  orderNote?: string | null;
  expectedDeliveryAt?: string | null;
  reason?: string | null;
}): Promise<ProjectMaterial> {
  const access = await requireAuthenticatedAccess();
  const status = parseOrderStatus(input.orderStatus);
  const supabase = await createClient();

  const { data: before, error: beforeError } = await supabase
    .from("project_materials")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (beforeError || !before) {
    throw new Error("자재를 찾을 수 없습니다.");
  }

  const patch: Record<string, unknown> = {
    order_status: status,
    updated_by: access.userId,
  };

  if (input.orderNote !== undefined) {
    patch.order_note = input.orderNote?.trim() || null;
  }
  if (input.expectedDeliveryAt !== undefined) {
    const d = input.expectedDeliveryAt?.trim() || null;
    patch.expected_delivery_at = d;
    patch.delivery_expected_at = d;
  }

  if (status === "발주대기" || status === "발주완료") {
    if (!before.ordered_at) {
      patch.ordered_at = new Date().toISOString();
      patch.ordered_by = access.userId;
    }
  }
  if (status === "입고완료") {
    patch.delivered_at = new Date().toISOString().slice(0, 10);
  }
  if (status === "미발주" || status === "취소") {
    // keep ordered_at history
  }

  const { data, error } = await supabase
    .from("project_materials")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) throw new Error("발주상태를 변경하지 못했습니다.");

  await writeMaterialHistory({
    projectMaterialId: input.id,
    customerId: data.customer_id,
    projectId: data.project_id,
    action: "발주상태 변경",
    before: before as ProjectMaterial,
    after: data as ProjectMaterial,
    reason: input.reason || `${before.order_status || "미발주"} → ${status}`,
  });

  return data as ProjectMaterial;
}

export async function restoreSiteMaterial(input: {
  id: string;
  restoreReason: string;
}): Promise<ProjectMaterial> {
  const access = await requireAuthenticatedAccess();
  const reason = input.restoreReason.trim();
  if (!reason) throw new Error("복원 사유를 입력해 주세요.");

  const supabase = await createClient();
  const { data: before, error: beforeError } = await supabase
    .from("project_materials")
    .select("*")
    .eq("id", input.id)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (beforeError || !before) {
    throw new Error("삭제된 자재를 찾을 수 없습니다.");
  }

  const { data, error } = await supabase
    .from("project_materials")
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      is_active: true,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error || !data) throw new Error("복원에 실패했습니다.");

  await writeMaterialHistory({
    projectMaterialId: input.id,
    customerId: data.customer_id,
    projectId: data.project_id,
    action: "복원",
    before: before as ProjectMaterial,
    after: data as ProjectMaterial,
    reason,
  });

  return data as ProjectMaterial;
}

export async function reorderSiteMaterialImages(input: {
  materialId: string;
  orderedImageIds: string[];
}) {
  await requireAuthenticatedAccess();
  const supabase = await createClient();
  for (let i = 0; i < input.orderedImageIds.length; i += 1) {
    const id = input.orderedImageIds[i]!;
    const { error } = await supabase
      .from("project_material_images")
      .update({ sort_order: i })
      .eq("id", id)
      .eq("material_id", input.materialId);
    if (error) throw new Error("사진 순서를 저장하지 못했습니다.");
  }
}

export function toStaffSafeError(
  error: unknown,
  fallback = "처리 중 오류가 발생했습니다.",
): string {
  if (error instanceof Error) {
    const msg = error.message || "";
    if (
      /[가-힣]/.test(msg) &&
      msg.length < 180 &&
      !/PGRST|postgres|permission|JWT|schema cache/i.test(msg)
    ) {
      return msg;
    }
  }
  return fallback;
}
