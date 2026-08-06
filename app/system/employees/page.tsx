import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import EmployeeContactsWorkspace from "@/components/system/EmployeeContactsWorkspace";
import {
  listCompanyEmployeesForContact,
  listEmployeeMasterEvents,
} from "@/lib/crm/employee-contacts";
import { listPendingSignups } from "@/lib/crm/staff-approvals";

export default async function EmployeeMasterPage() {
  const data = await listCompanyEmployeesForContact();

  if (!data.isAuthenticated) redirect("/login");
  if (!data.canAccessErp) redirect("/pending-approval");

  const pendingAccounts = data.canManageAll
    ? await listPendingSignups().catch(() => [])
    : [];
  const masterEvents = data.canManageAll
    ? await listEmployeeMasterEvents().catch(() => [])
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-slate-600">시스템 관리</p>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            직원 Master
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            직원 연락처를 기준으로 로그인 계정, 가입 승인, 권한과 마지막 로그인을 통합 관리합니다.
            계정 연결을 바꿔도 기존 고객·견적·일정·정산 데이터는 직원에게 그대로 유지됩니다.
          </p>
        </div>

        {data.loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {data.loadError}
          </div>
        ) : null}
        <EmployeeContactsWorkspace
          employees={data.employees}
          teams={data.teams}
          currentEmployeeId={data.currentEmployeeId}
          canManageAll={data.canManageAll}
          canMergeEmployees={data.canMergeEmployees}
          pendingAccounts={pendingAccounts}
          events={masterEvents}
        />
      </div>
    </DashboardLayout>
  );
}
