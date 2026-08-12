import Link from "next/link";
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

  const pendingAccounts = data.canManageLoginAccounts
    ? await listPendingSignups().catch(() => [])
    : [];
  const masterEvents = data.canManageAll
    ? await listEmployeeMasterEvents().catch(() => [])
    : [];
  const activeEmployees = data.employees.filter(
    (employee) => employee.is_active && !employee.merged_into_employee_id,
  );
  const loginReadyCount = activeEmployees.filter(
    (employee) => employee.login_linked && employee.login_active,
  ).length;
  const inactiveLoginCount = activeEmployees.filter(
    (employee) => employee.login_linked && !employee.login_active,
  ).length;
  const unlinkedLoginCount = activeEmployees.filter(
    (employee) => !employee.login_linked,
  ).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">시스템 관리</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">
            직원 Master
          </h1>
          <p className="mt-2 max-w-5xl text-[15px] leading-relaxed text-slate-700">
            직원 연락처를 기준으로 로그인 계정 연결·재연결, 권한과 마지막 로그인을 통합 관리합니다.
            계정 연결을 바꿔도 기존 고객·견적·일정·정산 데이터는 직원에게 그대로 유지됩니다.
          </p>
        </div>

        {data.canManageLoginAccounts ? (
          <section className="dashboard-card p-5" aria-labelledby="employee-test-readiness-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">직원 테스트 준비도</p>
                <h2 id="employee-test-readiness-title" className="mt-0.5 text-lg font-bold text-slate-950">
                  로그인 가능 {loginReadyCount}/{activeEmployees.length}명
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  미연결 {unlinkedLoginCount}명 · 비활성 계정 {inactiveLoginCount}명
                  {pendingAccounts.length > 0 ? ` · 승인 대기 ${pendingAccounts.length}명` : ""}
                </p>
              </div>
              <Link
                href="/system/invitations"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2"
              >
                직원 초대 관리
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-medium text-slate-600">활성 직원</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeEmployees.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="text-xs font-medium text-emerald-800">로그인 가능</p>
                <p className="mt-1 text-xl font-bold text-emerald-950">{loginReadyCount}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-xs font-medium text-amber-800">계정 미연결</p>
                <p className="mt-1 text-xl font-bold text-amber-950">{unlinkedLoginCount}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                <p className="text-xs font-medium text-red-800">비활성 계정</p>
                <p className="mt-1 text-xl font-bold text-red-950">{inactiveLoginCount}</p>
              </div>
            </div>

            {loginReadyCount < activeEmployees.length ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
                직원 테스트 전에 미연결 직원은 초대 링크로 가입하고, 비활성 계정은 관리자 복구 절차를 확인해 주세요.
              </p>
            ) : null}
          </section>
        ) : null}

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
          canManageLoginAccounts={data.canManageLoginAccounts}
          canAssignAdminRole={data.canAssignAdminRole}
          pendingAccounts={pendingAccounts}
          events={masterEvents}
        />
      </div>
    </DashboardLayout>
  );
}
