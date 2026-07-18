import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StaffApprovalsWorkspace from "@/components/system/StaffApprovalsWorkspace";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
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
  let schemaMissing = false;
  const migrationDevHint = schemaMissingDevHint(
    "supabase/migrations/20260801000001_employee_signup_approval.sql",
    access.isAdmin,
  );

  try {
    [pending, allProfiles, employees, teams] = await Promise.all([
      listPendingSignups(),
      listManagedProfiles(),
      listEmployeesForApproval(),
      listTeamsForApproval(),
    ]);
  } catch (error) {
    const message = toCrmErrorMessage(error);
    if (
      /is_approved|approval_status|approve_staff_signup|schema cache|Could not find/i.test(
        message,
      )
    ) {
      schemaMissing = true;
      loadError = schemaMissingStaffMessage("가입 승인");
    } else {
      loadError = "가입 승인 목록을 불러오지 못했습니다.";
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

        {schemaMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{loadError}</p>
            {migrationDevHint && (
              <p className="mt-2 text-xs">{migrationDevHint}</p>
            )}
          </div>
        )}

        {loadError && !schemaMissing && (
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
