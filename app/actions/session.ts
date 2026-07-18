"use server";

import { getCurrentUserAccess } from "@/lib/crm/access";
import { ROLE_LABEL } from "@/lib/crm/constants";

export type TopBarUserDisplay = {
  name: string;
  roleLabel: string;
  department: string;
};

/** TopBar 표시용 — 샘플 데이터 대신 실제 세션 프로필 */
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

  return { name, roleLabel, department };
}
