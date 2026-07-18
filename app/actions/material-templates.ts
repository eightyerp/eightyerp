"use server";

import { revalidatePath } from "next/cache";
import {
  applyMaterialTemplate,
  listMaterialTemplates,
  saveMaterialsAsTemplate,
  softDeleteMaterialTemplate,
} from "@/lib/crm/material-templates";
import {
  listCustomerMaterials,
  listProjectIdMaterials,
} from "@/lib/crm/site-materials";
import { toStaffSafeError } from "@/lib/crm/site-material-ops";
import type { MaterialTemplate } from "@/types/database";

export type TemplateActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  templateId?: string;
  templates?: MaterialTemplate[];
  appliedCount?: number;
};

export async function listTemplatesAction(): Promise<TemplateActionResult> {
  try {
    const templates = await listMaterialTemplates();
    return { success: true, templates };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "자재 묶음 목록을 불러오지 못했습니다."),
    };
  }
}

export async function saveCurrentAsTemplateAction(
  _prev: TemplateActionResult,
  formData: FormData,
): Promise<TemplateActionResult> {
  try {
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "").trim();

    const materials = projectId
      ? await listProjectIdMaterials(projectId)
      : await listCustomerMaterials(customerId);

    const template = await saveMaterialsAsTemplate({
      name,
      description: description || null,
      materials,
    });

    revalidatePath(`/customers/${customerId}/materials`);
    if (projectId) {
      revalidatePath(`/projects/${projectId}/materials`);
      revalidatePath(
        `/customers/${customerId}/projects/${projectId}/materials`,
      );
    }

    return {
      success: true,
      message: "자재 묶음으로 저장되었습니다.",
      templateId: template.id,
    };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "자재 묶음 저장에 실패했습니다."),
    };
  }
}

export async function applyTemplateAction(
  formData: FormData,
): Promise<TemplateActionResult> {
  try {
    const templateId = String(formData.get("template_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "").trim() || null;
    const count = await applyMaterialTemplate({
      templateId,
      customerId,
      projectId,
    });
    revalidatePath(`/customers/${customerId}/materials`);
    if (projectId) {
      revalidatePath(`/projects/${projectId}/materials`);
      revalidatePath(
        `/customers/${customerId}/projects/${projectId}/materials`,
      );
    }
    return {
      success: true,
      message: `${count}개 자재를 불러왔습니다.`,
      appliedCount: count,
    };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "자재 묶음 불러오기에 실패했습니다."),
    };
  }
}

export async function deleteTemplateAction(
  formData: FormData,
): Promise<TemplateActionResult> {
  try {
    const id = String(formData.get("template_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteMaterialTemplate({ id, deleteReason });
    return { success: true, message: "자재 묶음이 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toStaffSafeError(error, "자재 묶음 삭제에 실패했습니다."),
    };
  }
}
