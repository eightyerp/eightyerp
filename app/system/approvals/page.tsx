import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StaffApprovalsWorkspace from "@/components/system/StaffApprovalsWorkspace";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  listEmployeesForApproval,
  listManagedProfiles,
  listPendingSignups,
  listTeamsForApproval,
} from "@/lib/crm/staff-approvals";
import { toCrmErrorMessage } from "@/lib/crm/errors";

export default async function StaffApprovalsPage() {
  const access = await getCurrentUserAccess();
  if (!access.canAccessErp) redirect("/pending-approval");
  if (!access.isAdmin) redirect("/dashboard");

  let pending: Awaited<ReturnType<typeof listPendingSignups>> = [];
  let allProfiles: Awaited<ReturnType<typeof listManagedProfiles>> = [];
  let employees: Awaited<ReturnType<typeof listEmployeesForApproval>> = [];
  let teams: Awaited<ReturnType<typeof listTeamsForApproval>> = [];
  let loadError: string | null = null;
  let migrationHint: string | null = null;

  try {
    [pending, allProfiles, employees, teams] = await Promise.all([
      listPendingSignups(),
      listManagedProfiles(),
      listEmployeesForApproval(),
      listTeamsForApproval(),
    ]);
  } catch (error) {
    const message = toCrmErrorMessage(error);
    loadError = message;
    if (/is_approved|approval_status|approve_staff_signup|schema cache|Could not find/i.test(message)) {
      migrationHint =
        "supabase/migrations/20260801000001_employee_signup_approval.sql 을 Supabase SQL Editor에서 실행해 주세요.";
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-gray-400">시스템관리</p>
          <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
            가입 승인 관리
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            대표이사(super_admin)·이사(admin)만 승인·거절·비활성화할 수 있습니다.
          </p>
        </div>

        {migrationHint && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {migrationHint}
          </div>
        )}

        {loadError && !migrationHint && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && (
          <StaffApprovalsWorkspace
            pending={pending}
            allProfiles={allProfiles}
            employees={employees}
            teams={teams}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
