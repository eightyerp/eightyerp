import { createClient } from "@/lib/supabase-server";
import { cache } from "react";
import { isAdminRole } from "@/lib/crm/constants";
import type {
  ApprovalStatus,
  ProfileWithEmployee,
  UserRole,
} from "@/types/database";

export type CurrentUserAccess = {
  userId: string | null;
  profile: ProfileWithEmployee | null;
  role: UserRole | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  /** 승인 + 활성 — ERP 업무 접근 가능 */
  canAccessErp: boolean;
  approvalStatus: ApprovalStatus | null;
  permissions: Record<string, boolean>;
};

function resolveApproval(profile: ProfileWithEmployee | null): {
  canAccessErp: boolean;
  approvalStatus: ApprovalStatus | null;
  role: UserRole | null;
} {
  if (!profile) {
    return { canAccessErp: false, approvalStatus: null, role: null };
  }

  const hasApprovalColumn = typeof profile.is_approved === "boolean";
  const isApproved = hasApprovalColumn ? profile.is_approved === true : true;
  const status: ApprovalStatus =
    profile.approval_status ??
    (isApproved ? "approved" : profile.is_active ? "approved" : "pending");

  const canAccessErp =
    profile.is_active === true &&
    (
      profile.employee_id === null ||
      (
        profile.employees?.is_active === true &&
        profile.active_company_id != null &&
        profile.employees.company_id === profile.active_company_id
      )
    ) &&
    isApproved &&
    status === "approved";

  return {
    canAccessErp,
    approvalStatus: status,
    role: canAccessErp ? profile.role : null,
  };
}

export const getCurrentUserAccess = cache(async (): Promise<CurrentUserAccess> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      profile: null,
      role: null,
      isAdmin: false,
      isAuthenticated: false,
      canAccessErp: false,
      approvalStatus: null,
      permissions: {},
    };
  }

  const [profileResult, companyRoleResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, employee_id, active_company_id, role, permissions, is_active, email, full_name, phone, requested_team, requested_title, is_approved, approval_status, approved_at, approved_by, rejected_at, rejection_reason, created_at, updated_at, employees ( id, company_id, name, title, team_id, is_active, teams ( name ) )")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("current_company_role"),
  ]);
  const { data: profile, error } = profileResult;

  if (error) {
    return {
      userId: user.id,
      profile: null,
      role: null,
      isAdmin: false,
      isAuthenticated: true,
      canAccessErp: false,
      approvalStatus: null,
      permissions: {},
    };
  }

  const typed = profile as ProfileWithEmployee | null;
  const resolved = resolveApproval(typed);
  const companyRole =
    typeof companyRoleResult.data === "string"
      ? companyRoleResult.data
      : null;
  const hasScopedEmployee =
    (companyRole !== "employee" && companyRole !== "manager") ||
    (
      typed?.employee_id != null &&
      typed.employees?.company_id === typed.active_company_id
    );
  const canAccessErp =
    resolved.canAccessErp &&
    !companyRoleResult.error &&
    companyRole !== null &&
    hasScopedEmployee;
  const effectiveRole: UserRole | null = !canAccessErp
    ? null
    : companyRole === "owner" ||
        companyRole === "director" ||
        companyRole === "admin"
      ? "admin"
      : companyRole === "manager"
        ? "manager"
        : "staff";

  return {
    userId: user.id,
    profile: typed,
    role: effectiveRole,
    isAdmin: isAdminRole(effectiveRole),
    isAuthenticated: true,
    canAccessErp,
    approvalStatus: resolved.approvalStatus,
    permissions: typed?.permissions ?? {},
  };
});

export async function requireAdminAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAdmin || !access.canAccessErp) {
    throw new Error("관리자만 수행할 수 있는 작업입니다.");
  }
  return access;
}

export async function requireAuthenticatedAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }
  if (!access.canAccessErp) {
    throw new Error("관리자 승인 후 이용할 수 있습니다.");
  }
  return access;
}

/**
 * 승인된 세션의 현재 회사 역할과 동일한 Supabase 클라이언트를 반환한다.
 * 한 Server Render/Action 안에서 반복 호출돼도 회사 역할 RPC는 1회만 실행한다.
 */
export const getCurrentCompanyAccess = cache(async () => {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_company_role");
  if (error) {
    throw new Error("현재 회사 역할을 확인할 수 없습니다.");
  }

  return {
    access,
    supabase,
    companyRole: typeof data === "string" ? data : null,
  };
});

export async function requireCurrentCompanyRoleAccess(
  allowedRoles: readonly string[],
  errorMessage = "현재 회사에서 이 작업을 수행할 권한이 없습니다.",
) {
  const context = await getCurrentCompanyAccess();
  if (
    !context.companyRole ||
    !allowedRoles.includes(context.companyRole)
  ) {
    throw new Error(errorMessage);
  }
  return context;
}

export async function requireSessionAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }
  return access;
}
