"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import {
  createProject,
  parseProjectForm,
  softDeleteProject,
  updateProject,
} from "@/lib/crm/projects";

export type ProjectActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  projectId?: string;
};

function revalidate(customerId: string, projectId?: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/schedules/processes");
  if (projectId) {
    revalidatePath(`/customers/${customerId}/projects/${projectId}/materials`);
    revalidatePath(`/projects/${projectId}/materials`);
    revalidatePath(`/projects/${projectId}/schedule`);
  }
}

export async function createProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  try {
    const form = parseProjectForm(formData);
    const goMaterials = String(formData.get("go_materials") ?? "") === "1";
    const project = await createProject(form);
    revalidate(form.customer_id, project.id);
    if (goMaterials) {
      redirect(
        `/customers/${form.customer_id}/projects/${project.id}/materials`,
      );
    }
    redirect(`/projects/${project.id}/schedule`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "현장 등록 실패",
    };
  }
}

export async function updateProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  try {
    const id = String(formData.get("project_id") ?? "").trim();
    if (!id) return { success: false, error: "현장 ID가 없습니다." };
    const form = parseProjectForm(formData);
    await updateProject({ id, form });
    revalidate(form.customer_id, id);
    return { success: true, message: "현장이 수정되었습니다.", projectId: id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "현장 수정 실패",
    };
  }
}

export async function deleteProjectAction(
  formData: FormData,
): Promise<ProjectActionResult> {
  try {
    const id = String(formData.get("project_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    await softDeleteProject({ id, deleteReason });
    revalidate(customerId);
    return { success: true, message: "현장이 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "현장 삭제 실패",
    };
  }
}
