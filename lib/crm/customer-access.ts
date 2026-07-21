import { isAdminRole } from "@/lib/crm/constants";
import {
  getCurrentUserAccess,
  requireAuthenticatedAccess,
  type CurrentUserAccess,
} from "@/lib/crm/access";
import type { Customer, UserRole } from "@/types/database";

/**
 * Bundle E — 고객 조회 범위
 * - admin / super_admin: 같은 회사 전체 (RLS company_id + is_admin)
 * - manager / staff: assigned_employee_id = 본인만
 * - 미배정 고객: 관리자만
 *
 * profiles.role 값만 사용 (company_memberships.role 과 별개)
 */
export type CustomerAccess = CurrentUserAccess & {
  employeeId: string | null;
  /** admin / super_admin */
  canViewAllCompanyCustomers: boolean;
  /** 담당자 지정·변경 가능 */
  canChangeAssignee: boolean;
  role: UserRole | null;
  scopeLabel: string;
};

export const CUSTOMER_FORBIDDEN_MESSAGE =
  "접근 권한이 없는 고객입니다.";

export const CUSTOMER_DUPLICATE_BLOCKED_MESSAGE =
  "이미 등록된 고객입니다. 관리자 또는 담당자에게 확인해주세요.";

export async function getCustomerAccess(): Promise<CustomerAccess> {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }

  const role = access.role;
  const canViewAllCompanyCustomers = isAdminRole(role);
  const employeeId = access.profile?.employee_id ?? null;

  return {
    ...access,
    employeeId,
    canViewAllCompanyCustomers,
    canChangeAssignee: canViewAllCompanyCustomers,
    role,
    scopeLabel: canViewAllCompanyCustomers
      ? "회사 전체 고객"
      : "내 담당 고객",
  };
}

export async function requireCustomerAccess(): Promise<CustomerAccess> {
  const access = await getCustomerAccess();
  if (!access.canAccessErp) {
    throw new Error("관리자 승인 후 이용할 수 있습니다.");
  }
  return access;
}

export function canAccessCustomerRecord(
  access: CustomerAccess,
  customer: Pick<Customer, "assigned_employee_id" | "deleted_at"> | null,
): boolean {
  if (!customer) return false;
  if (customer.deleted_at && !access.isAdmin) return false;
  if (access.canViewAllCompanyCustomers) return true;
  if (!access.employeeId) return false;
  return customer.assigned_employee_id === access.employeeId;
}

export function assertCanAccessCustomerRecord(
  access: CustomerAccess,
  customer: Pick<Customer, "assigned_employee_id" | "deleted_at"> | null,
) {
  if (!canAccessCustomerRecord(access, customer)) {
    throw new Error(CUSTOMER_FORBIDDEN_MESSAGE);
  }
}

/** 직원은 본인만 담당자로 지정 가능. 미배정/타인 지정 불가. */
export function assertCanSetAssignee(
  access: CustomerAccess,
  assignedEmployeeId: string | null | undefined,
) {
  if (access.canChangeAssignee) {
    if (!assignedEmployeeId) {
      throw new Error("담당자를 선택해 주세요.");
    }
    return;
  }
  if (!access.employeeId) {
    throw new Error("직원 정보가 없어 고객을 등록할 수 없습니다.");
  }
  if (!assignedEmployeeId || assignedEmployeeId !== access.employeeId) {
    throw new Error("본인을 담당자로 지정해 주세요.");
  }
}

/** 수정 시 담당자 변경 — 관리자만 허용 */
export function assertCanChangeAssignee(
  access: CustomerAccess,
  previousAssigneeId: string | null | undefined,
  nextAssigneeId: string | null | undefined,
) {
  if (previousAssigneeId === nextAssigneeId) return;
  if (!access.canChangeAssignee) {
    throw new Error("담당자 변경은 관리자만 할 수 있습니다.");
  }
  if (!nextAssigneeId) {
    throw new Error("담당자를 선택해 주세요.");
  }
}

export async function requireAuthenticatedCustomerAccess() {
  await requireAuthenticatedAccess();
  return requireCustomerAccess();
}
