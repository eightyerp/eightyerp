import { getCurrentUserAccess, requireAdminAccess } from "@/lib/crm/access";
import { createClient } from "@/lib/supabase-server";
import type { Team } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyEmployeeInvitation = {
  invitation_id: string;
  company_id: string;
  default_title: string;
  team_id: string | null;
  team_name: string | null;
  expires_at: string;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  is_available: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type CreatedCompanyEmployeeInvitation = {
  invitation_id: string;
  invite_token: string;
  expires_at: string;
};

export type PublicCompanyEmployeeInvitation = {
  company_name: string;
  default_title: string;
  team_name: string | null;
  expires_at: string;
};

export type CreateCompanyEmployeeInvitationInput = {
  defaultTitle?: string;
  teamId?: string | null;
  expiresInDays?: number;
};

export type CompanyEmployeeInvitationsPageData = {
  access: Awaited<ReturnType<typeof getCurrentUserAccess>>;
  invitations: CompanyEmployeeInvitation[];
  teams: Team[];
  loadError: string | null;
};

async function fetchCompanyEmployeeInvitationsList(
  supabase: SupabaseClient,
): Promise<CompanyEmployeeInvitation[]> {
  const { data, error } = await supabase.rpc(
    "list_company_employee_invitations",
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as CompanyEmployeeInvitation[];
}

async function fetchTeamsForInvitationForm(
  supabase: SupabaseClient,
): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Team[];
}

/**
 * 직원 초대 관리 페이지 전용 로더.
 * 인증·관리자 권한 검사를 1회만 수행한 뒤 초대/팀 목록을 병렬 조회한다.
 */
export async function loadCompanyEmployeeInvitationsPageData(): Promise<CompanyEmployeeInvitationsPageData> {
  const access = await getCurrentUserAccess();

  if (!access.canAccessErp || !access.isAdmin) {
    return {
      access,
      invitations: [],
      teams: [],
      loadError: null,
    };
  }

  const supabase = await createClient();

  try {
    const [invitations, teams] = await Promise.all([
      fetchCompanyEmployeeInvitationsList(supabase),
      fetchTeamsForInvitationForm(supabase),
    ]);

    return {
      access,
      invitations,
      teams,
      loadError: null,
    };
  } catch {
    return {
      access,
      invitations: [],
      teams: [],
      loadError: "직원 초대 정보를 불러오지 못했습니다.",
    };
  }
}

export async function createCompanyEmployeeInvitation(
  input: CreateCompanyEmployeeInvitationInput,
): Promise<CreatedCompanyEmployeeInvitation> {
  await requireAdminAccess();

  const supabase = await createClient();
  const expiresInDays =
    typeof input.expiresInDays === "number" &&
    Number.isInteger(input.expiresInDays)
      ? input.expiresInDays
      : 7;

  const { data, error } = await supabase.rpc(
    "create_company_employee_invitation",
    {
      p_default_title: input.defaultTitle?.trim() || "직원",
      p_team_id: input.teamId || null,
      p_expires_in_days: expiresInDays,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as CreatedCompanyEmployeeInvitation[];
  const invitation = rows[0];

  if (!invitation) {
    throw new Error("직원 초대 링크를 생성하지 못했습니다.");
  }

  return invitation;
}

export async function listCompanyEmployeeInvitations(): Promise<
  CompanyEmployeeInvitation[]
> {
  await requireAdminAccess();
  const supabase = await createClient();
  return fetchCompanyEmployeeInvitationsList(supabase);
}

export async function revokeCompanyEmployeeInvitation(
  invitationId: string,
): Promise<boolean> {
  await requireAdminAccess();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "revoke_company_employee_invitation",
    {
      p_invitation_id: invitationId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}

export async function getCompanyEmployeeInvitation(
  inviteToken: string,
): Promise<PublicCompanyEmployeeInvitation | null> {
  const token = inviteToken.trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_company_employee_invitation",
    {
      p_invite_token: token,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as PublicCompanyEmployeeInvitation[];
  return rows[0] ?? null;
}
