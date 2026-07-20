import { redirect } from "next/navigation";
import CompanyEmployeeInvitations from "@/components/system/CompanyEmployeeInvitations";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { loadCompanyEmployeeInvitationsPageData } from "@/lib/crm/company-employee-invitations";

export default async function CompanyEmployeeInvitationsPage() {
  const { access, invitations, teams, loadError } =
    await loadCompanyEmployeeInvitationsPageData();

  if (!access.canAccessErp) {
    redirect("/pending-approval");
  }

  if (!access.isAdmin) {
    redirect("/dashboard");
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-slate-600">
            시스템관리
          </p>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            직원 초대 관리
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            회사별 1회용 가입 링크를 생성하고 취소할 수 있습니다.
            초대로 가입한 직원은 별도 승인 없이 자동 활성화됩니다.
          </p>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
          </div>
        ) : (
          <CompanyEmployeeInvitations
            invitations={invitations}
            teams={teams}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
