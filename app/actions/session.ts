"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { ROLE_LABEL } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase-server";

type CompanyOptionRpcRow = {
  company_id: string;
  company_name: string;
  business_number_display: string;
  membership_role: string;
  is_current: boolean;
};

export type TopBarCompanyOption = {
  companyId: string;
  companyName: string;
  membershipRole: string;
  isCurrent: boolean;
};

export type TopBarUserDisplay = {
  name: string;
  roleLabel: string;
  department: string;
  companies: TopBarCompanyOption[];
  activeCompanyId: string | null;
  activeCompanyName: string;
};

export type CompanySwitchResult = {
  success: boolean;
  error?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** TopBar 표시용 — 사용자와 회사 정보를 한 번의 서버 요청으로 반환 */
export async function getTopBarUserAction(): Promise<TopBarUserDisplay> {
  const access = await getCurrentUserAccess();
  const profile = access.profile;
  const employeeName = profile?.employees?.name?.trim();
  const fullName = profile?.full_name?.trim();
  const email = profile?.email?.trim();
  const name = employeeName || fullName || email || "직원";
  const roleLabel = access.role ? ROLE_LABEL[access.role] : "직원";
  const department =
    profile?.employees?.title?.trim() ||
    profile?.requested_title?.trim() ||
    "";

  let companies: TopBarCompanyOption[] = [];

  if (access.canAccessErp && access.userId) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_my_company_options");

    if (!error && Array.isArray(data)) {
      companies = (data as CompanyOptionRpcRow[])
        .filter(
          (row) =>
            typeof row.company_id === "string" &&
            typeof row.company_name === "string",
        )
        .map((row) => ({
          companyId: row.company_id,
          companyName: row.company_name,
          membershipRole: row.membership_role,
          isCurrent: row.is_current === true,
        }));
    }
  }

  const currentCompany =
    companies.find((company) => company.isCurrent) ?? null;

  return {
    name,
    roleLabel,
    department,
    companies,
    activeCompanyId: currentCompany?.companyId ?? null,
    activeCompanyName: currentCompany?.companyName ?? "",
  };
}

/** 활성 멤버십이 있는 회사로만 전환 */
export async function switchActiveCompanyAction(
  companyId: string,
): Promise<CompanySwitchResult> {
  const normalizedCompanyId = companyId.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalizedCompanyId)) {
    return {
      success: false,
      error: "올바르지 않은 회사 정보입니다.",
    };
  }

  const access = await getCurrentUserAccess();

  if (!access.isAuthenticated || !access.userId) {
    return {
      success: false,
      error: "로그인이 필요합니다.",
    };
  }

  if (!access.canAccessErp) {
    return {
      success: false,
      error: "승인된 활성 계정만 회사를 전환할 수 있습니다.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_active_company", {
    p_company_id: normalizedCompanyId,
  });

  if (error) {
    return {
      success: false,
      error: "회사 전환 중 오류가 발생했습니다.",
    };
  }

  if (data !== true) {
    return {
      success: false,
      error: "접근 가능한 회사가 아닙니다.",
    };
  }

  revalidatePath("/", "layout");

  return { success: true };
}