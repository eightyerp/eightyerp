import { createClient } from "@/lib/supabase-server";
import { requireAdminAccess } from "@/lib/crm/access";
import type { Employee, Profile, Team, UserRole } from "@/types/database";

export type PendingSignup = Profile & {
  employees: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
};

export async function listPendingSignups(): Promise<PendingSignup[]> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*, employees ( id, name, title, team_id )")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingSignup[];
}

export async function listManagedProfiles(): Promise<PendingSignup[]> {
  await requireAdminAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*, employees ( id, name, title, team_id )")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingSignup[];
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
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("sort_order", { ascending: true });
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
