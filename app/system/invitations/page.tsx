import { redirect } from "next/navigation";
import CompanyEmployeeInvitations from "@/components/system/CompanyEmployeeInvitations";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { loadCompanyEmployeeInvitationsPageData } from "@/lib/crm/company-employee-invitations";

export default async function CompanyEmployeeInvitationsPage() {
  const {
    access,
    canManageInvitations,
    invitations,
    teams,
    loadError,
  } =
    await loadCompanyEmployeeInvitationsPageData();

  if (!access.canAccessErp) {
    redirect("/pending-approval");
  }

  if (!canManageInvitations) {
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

        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-950">
          <p className="font-bold">이 초대 기능은 Employee Master가 아직 없는 신규 직원 전용입니다.</p>
          <p className="mt-1">
            이미 직원 Master에 등록된 사람에게 이 링크를 보내면 새 직원 행 생성 과정에서 중복 오류가 발생하거나 잘못된 중복 직원이 생길 수 있습니다. 기존 직원의 로그인 연결은 직원 Master의 기존 계정 연결 절차를 사용해 주세요.
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
