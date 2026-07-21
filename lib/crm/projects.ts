import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  getCustomerById,
  writeAuditLog,
} from "@/lib/crm/customers";
import {
  isAdminRole,
  isContractCustomerStatus,
} from "@/lib/crm/constants";
import {
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@/lib/crm/project-constants";
import type { Project } from "@/types/database";

export { PROJECT_STATUSES, type ProjectStatus };
export { isContractCustomerStatus };
export {
  canShowCreateSiteButton,
  defaultProjectName,
} from "@/lib/crm/project-constants";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export type ProjectFormInput = {
  customer_id: string;
  name: string;
  address: string | null;
  status: ProjectStatus;
  assigned_employee_id: string | null;
};

export function parseProjectForm(formData: FormData): ProjectFormInput {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "준비").trim() as ProjectStatus;
  if (!customerId) throw new Error("고객 정보가 없습니다.");
  if (!name) throw new Error("현장명을 입력해 주세요.");
  if (!PROJECT_STATUSES.includes(status)) {
    throw new Error("현장상태가 올바르지 않습니다.");
  }
  return {
    customer_id: customerId,
    name,
    address: emptyToNull(String(formData.get("address") ?? "")),
    status,
    assigned_employee_id: emptyToNull(
      String(formData.get("assigned_employee_id") ?? ""),
    ),
  };
}

async function assertCanCreateProjectForCustomer(customerId: string) {
  const access = await requireAuthenticatedAccess();
  const customer = await getCustomerById(customerId);
  if (!customer || customer.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }

  const existing = await listCustomerProjects(customerId);
  if (existing.length > 0) {
    throw new Error(
      "이미 등록된 현장이 있습니다. 현장 보기에서 확인해 주세요.",
    );
  }

  if (isAdminRole(access.role)) {
    return { access, customer };
  }

  const employeeId = access.profile?.employee_id ?? null;
  if (!employeeId || employeeId !== customer.assigned_employee_id) {
    throw new Error("본인 담당 고객만 현장을 생성할 수 있습니다.");
  }
  if (!isContractCustomerStatus(customer.status)) {
    throw new Error("계약 완료된 고객만 현장을 생성할 수 있습니다.");
  }

  return { access, customer };
}

const SELECT =
  "*, customers ( id, name, phone ), employees ( id, name, title )";

export async function listCustomerProjects(
  customerId: string,
): Promise<Project[]> {
  const { getCustomerById } = await import("@/lib/crm/customers");
  const customer = await getCustomerById(customerId);
  if (!customer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

/** 공정 스케줄 페이지용 — 전체 현장 목록 (삭제 제외) */
export async function listAllProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Project | null) ?? null;
}

export async function createProject(
  form: ProjectFormInput,
): Promise<Project> {
  const { access } = await assertCanCreateProjectForCustomer(form.customer_id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      customer_id: form.customer_id,
      name: form.name,
      address: form.address,
      status: form.status,
      assigned_employee_id: form.assigned_employee_id,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(error?.message || "현장 등록 실패");

  await writeAuditLog({
    entity_type: "project",
    entity_id: data.id,
    action: "create",
    payload: { name: data.name, customer_id: data.customer_id },
  });

  return data as Project;
}

export async function updateProject(input: {
  id: string;
  form: ProjectFormInput;
}): Promise<Project> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: input.form.name,
      address: input.form.address,
      status: input.form.status,
      assigned_employee_id: input.form.assigned_employee_id,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(error?.message || "현장 수정 실패");

  await writeAuditLog({
    entity_type: "project",
    entity_id: input.id,
    action: "update",
    payload: { name: data.name },
  });

  return data as Project;
}

export async function softDeleteProject(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id, name, customer_id")
    .single();
  if (error || !data) throw new Error(error?.message || "현장 삭제 실패");

  await writeAuditLog({
    entity_type: "project",
    entity_id: input.id,
    action: "soft_delete",
    payload: {
      name: data.name,
      customer_id: data.customer_id,
      delete_reason: reason,
    },
  });
}

/** 고객에 현장이 없으면 기본 현장 1건 생성 */
export async function ensureDefaultProject(
  customerId: string,
  defaults?: { name?: string; address?: string | null; assignedEmployeeId?: string | null },
): Promise<Project> {
  const existing = await listCustomerProjects(customerId);
  if (existing[0]) return existing[0];

  return createProject({
    customer_id: customerId,
    name: defaults?.name || "기본 현장",
    address: defaults?.address ?? null,
    status: "준비",
    assigned_employee_id: defaults?.assignedEmployeeId ?? null,
  });
}
