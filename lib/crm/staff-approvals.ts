import { createClient } from "@/lib/supabase-server";
import { requireAdminAccess } from "@/lib/crm/access";
import { isMissingEmployeeMergeColumnError } from "@/lib/crm/employee-master-shared";
import type { Employee, Profile, Team, UserRole } from "@/types/database";

export type PendingSignup = Profile & {
  employees: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
};

export async function getApprovalActorCompanyRole(): Promise<string | null> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_company_role");
  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : null;
}

export async function listPendingSignups(): Promise<PendingSignup[]> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_pending_company_signups",
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as Profile[]).map((profile: Profile) => ({
    ...profile,
    employees: null,
  }));
}

export async function listManagedProfiles(): Promise<PendingSignup[]> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_managed_company_profiles",
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as Profile[]).map((profile: Profile) => ({
    ...profile,
    employees: null,
  }));
}

export type ApproveSignupInput = {
  userId: string;
  role: UserRole;
  mode: "link" | "create";
  employeeId?: string | null;
  employeeName?: string;
  employeeTitle?: string;
  teamId?: string | null;
};

export async function approveSignup(
  input: ApproveSignupInput,
): Promise<Profile> {
  await requireAdminAccess();
  const supabase = await createClient();

  if (input.mode === "link") {
    const employeeId = input.employeeId?.trim();
    if (!employeeId) {
      throw new Error("연결할 직원을 선택해 주세요.");
    }

    const linkableQuery = await supabase
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .eq("is_active", true)
      .is("merged_into_employee_id", null)
      .maybeSingle();

    let isLinkable = linkableQuery.data !== null;
    if (isMissingEmployeeMergeColumnError(linkableQuery.error)) {
      const fallbackQuery = await supabase
        .from("employees")
        .select("id")
        .eq("id", employeeId)
        .eq("is_active", true)
        .maybeSingle();
      if (fallbackQuery.error) throw new Error(fallbackQuery.error.message);
      isLinkable = fallbackQuery.data !== null;
    } else if (linkableQuery.error) {
      throw new Error(linkableQuery.error.message);
    }

    if (!isLinkable) {
      throw new Error(
        "선택한 직원을 연결할 수 없습니다. 활성·병합 상태를 확인하고 새로고침해 주세요.",
      );
    }
  }

  const { data, error } = await supabase.rpc("approve_staff_signup", {
    p_user_id: input.userId,
    p_role: input.role,
    p_employee_id: input.mode === "link" ? input.employeeId ?? null : null,
    p_employee_name:
      input.mode === "create" ? (input.employeeName ?? "").trim() : null,
    p_employee_title: (input.employeeTitle ?? "").trim() || null,
    p_team_id: input.teamId ?? null,
  });

  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function rejectSignup(
  userId: string,
  reason?: string,
): Promise<Profile> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_staff_signup", {
    p_user_id: userId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function deactivateUser(userId: string): Promise<Profile> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deactivate_staff_user", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function listEmployeesForApproval(): Promise<Employee[]> {
  await requireAdminAccess();
  const supabase = await createClient();
  const load = (filterMerged: boolean) => {
    let query = supabase
      .from("employees")
      .select("*, teams ( name )")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (filterMerged) query = query.is("merged_into_employee_id", null);
    return query;
  };

  let { data, error } = await load(true);
  if (isMissingEmployeeMergeColumnError(error)) {
    ({ data, error } = await load(false));
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as Employee[];
}

export async function listTeamsForApproval(): Promise<Team[]> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Team[];
}
