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
  /** 현재 회사 멤버십 역할. getCurrentUserAccess에서 이미 조회한 값을 재사용한다. */
  companyRole: string | null;
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

  // 마이그레이션 전: is_approved 컬럼 없음 → 기존처럼 is_active만 사용
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
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId =
    typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  if (!userId) {
    return {
      userId: null,
      profile: null,
      role: null,
      companyRole: null,
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
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("current_company_role"),
  ]);
  const { data: profile, error } = profileResult;

  if (error) {
    return {
      userId,
      profile: null,
      role: null,
      companyRole: null,
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
    !companyRoleResult.error && typeof companyRoleResult.data === "string"
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
    userId,
    profile: typed,
    role: effectiveRole,
    companyRole,
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

/** 로그인 + ERP 승인 필요 (고객/현장 등 업무 액션) */
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
 * 전역 profiles.role은 회사별 관리 권한의 근거로 사용하지 않는다.
 * current_company_role은 getCurrentUserAccess에서 이미 검증했으므로 같은 요청에서 재조회하지 않는다.
 */
export async function getCurrentCompanyAccess() {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();

  return {
    access,
    supabase,
    companyRole: access.companyRole,
  };
}

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

/** 세션만 필요 (승인 대기 화면 등) */
export async function requireSessionAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }
  return access;
}
