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

  // 마이그레이션 전: is_approved 컬럼 없음 → 기존처럼 is_active만 사용
  const hasApprovalColumn = typeof profile.is_approved === "boolean";
  const isApproved = hasApprovalColumn ? profile.is_approved === true : true;
  const status: ApprovalStatus =
    profile.approval_status ??
    (isApproved ? "approved" : profile.is_active ? "approved" : "pending");

  const canAccessErp =
    profile.is_active === true &&
    (profile.employee_id === null || profile.employees?.is_active === true) &&
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, employee_id, role, permissions, is_active, email, full_name, phone, requested_team, requested_title, is_approved, approval_status, approved_at, approved_by, rejected_at, rejection_reason, created_at, updated_at, employees ( id, name, title, team_id, is_active, teams ( name ) )")
    .eq("id", user.id)
    .maybeSingle();

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

  return {
    userId: user.id,
    profile: typed,
    role: resolved.role,
    isAdmin: isAdminRole(resolved.role),
    isAuthenticated: true,
    canAccessErp: resolved.canAccessErp,
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

/** 세션만 필요 (승인 대기 화면 등) */
export async function requireSessionAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }
  return access;
}
