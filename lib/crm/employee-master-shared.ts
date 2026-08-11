import type { Employee, Profile, Team } from "@/types/database";

type SignupIdentity = Pick<
  Profile,
  "email" | "phone" | "full_name" | "requested_team"
>;

function canLinkSignupToEmployee(
  employee: Employee & { login_linked?: boolean },
): boolean {
  return (
    employee.is_active &&
    !employee.merged_into_employee_id &&
    !employee.login_linked
  );
}

export function findSuggestedEmployee(
  profile: SignupIdentity,
  employees: Array<Employee & { login_linked?: boolean }>,
  teams: Team[],
): { employee: Employee; matchedBy: "email" | "phone" | "name_team" } | null {
  const email = (profile.email ?? "").trim().toLowerCase();
  if (email) {
    const employee = employees.find(
      (row) =>
        canLinkSignupToEmployee(row) &&
        (row.email ?? "").trim().toLowerCase() === email,
    );
    if (employee) return { employee, matchedBy: "email" };
  }

  const phone = (profile.phone ?? "").replace(/\D/g, "");
  if (phone) {
    const employee = employees.find(
      (row) =>
        canLinkSignupToEmployee(row) &&
        (row.phone ?? "").replace(/\D/g, "") === phone,
    );
    if (employee) return { employee, matchedBy: "phone" };
  }

  const name = (profile.full_name ?? "").trim().toLowerCase();
  const requestedTeam = (profile.requested_team ?? "").trim().toLowerCase();
  if (name && requestedTeam) {
    const employee = employees.find((row) => {
      if (!canLinkSignupToEmployee(row)) return false;
      const team = teams.find((item) => item.id === row.team_id);
      return (
        row.name.trim().toLowerCase() === name &&
        (row.team_id?.toLowerCase() === requestedTeam ||
          team?.name.trim().toLowerCase() === requestedTeam)
      );
    });
    if (employee) return { employee, matchedBy: "name_team" };
  }

  return null;
}

/** Employee Merge migration 이전 DB에서만 담당자 조회를 한 번 재시도하기 위한 판별 */
export function isMissingEmployeeMergeColumnError(
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
): boolean {
  if (!error) return false;
  const detail = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (!/merged_into_employee_id/i.test(detail)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|could not find|schema cache|unknown column/i.test(detail)
  );
}
