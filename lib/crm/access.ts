import { createClient } from "@/lib/supabase-server";
import { isAdminRole } from "@/lib/crm/constants";
import type { ProfileWithEmployee, UserRole } from "@/types/database";

export type CurrentUserAccess = {
  userId: string | null;
  profile: ProfileWithEmployee | null;
  role: UserRole | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  permissions: Record<string, boolean>;
};

export async function getCurrentUserAccess(): Promise<CurrentUserAccess> {
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
      permissions: {},
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*, employees ( id, name, title )")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // profiles table may not exist yet before migration
    return {
      userId: user.id,
      profile: null,
      role: null,
      isAdmin: false,
      isAuthenticated: true,
      permissions: {},
    };
  }

  const typed = profile as ProfileWithEmployee | null;
  const role = typed?.is_active ? typed.role : null;

  return {
    userId: user.id,
    profile: typed,
    role,
    isAdmin: isAdminRole(role),
    isAuthenticated: true,
    permissions: typed?.permissions ?? {},
  };
}

export async function requireAdminAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAdmin) {
    throw new Error("관리자만 수행할 수 있는 작업입니다.");
  }
  return access;
}

/** 로그인 직원 공통 (견적서 삭제 등). 고객/자재 삭제와 분리. */
export async function requireAuthenticatedAccess() {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }
  return access;
}
