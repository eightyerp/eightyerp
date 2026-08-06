import type { Employee, Profile, Team } from "@/types/database";

type SignupIdentity = Pick<
  Profile,
  "email" | "phone" | "full_name" | "requested_team"
>;

export function findSuggestedEmployee(
  profile: SignupIdentity,
  employees: Array<Employee & { login_linked?: boolean }>,
  teams: Team[],
): { employee: Employee; matchedBy: "email" | "phone" | "name_team" } | null {
  const email = (profile.email ?? "").trim().toLowerCase();
  if (email) {
    const employee = employees.find(
      (row) =>
        !row.login_linked &&
        (row.email ?? "").trim().toLowerCase() === email,
    );
    if (employee) return { employee, matchedBy: "email" };
  }

  const phone = (profile.phone ?? "").replace(/\D/g, "");
  if (phone) {
    const employee = employees.find(
      (row) =>
        !row.login_linked &&
        (row.phone ?? "").replace(/\D/g, "") === phone,
    );
    if (employee) return { employee, matchedBy: "phone" };
  }

  const name = (profile.full_name ?? "").trim().toLowerCase();
  const requestedTeam = (profile.requested_team ?? "").trim().toLowerCase();
  if (name && requestedTeam) {
    const employee = employees.find((row) => {
      if (row.login_linked) return false;
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
