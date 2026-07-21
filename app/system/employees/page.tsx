import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import EmployeeContactsWorkspace from "@/components/system/EmployeeContactsWorkspace";
import {
  createSignedEmployeeCardUrl,
  listCompanyEmployeesForContact,
} from "@/lib/crm/employee-contacts";

export default async function EmployeeContactsPage() {
  const data = await listCompanyEmployeesForContact();

  if (!data.isAuthenticated) {
    redirect("/login");
  }
  if (!data.canAccessErp) {
    redirect("/pending-approval");
  }

  // 관리 화면 미리보기용 — path 있는 명함만 1회 signed URL 생성
  const cardUrls: Record<string, string> = {};
  const paths = Array.from(
    new Set(
      data.employees
        .map((e) => e.business_card_path?.trim())
        .filter((p): p is string => Boolean(p)),
    ),
  );
  await Promise.all(
    paths.map(async (path) => {
      try {
        cardUrls[path] = await createSignedEmployeeCardUrl(path, 60 * 30);
      } catch {
        // ignore
      }
    }),
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-slate-600">시스템관리</p>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            직원 연락처·명함
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            직책·휴대전화·이메일·명함을 관리합니다. 견적 저장 시점에 스냅샷으로
            보존되며, 이후 변경해도 기존 견적서는 바뀌지 않습니다.
          </p>
        </div>

        {data.loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {data.loadError}
          </div>
        ) : (
          <EmployeeContactsWorkspace
            employees={data.employees}
            teams={data.teams}
            currentEmployeeId={data.currentEmployeeId}
            canManageAll={data.canManageAll}
            initialCardUrls={cardUrls}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
