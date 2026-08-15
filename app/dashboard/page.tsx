import AdminDashboardHomeV2 from "@/components/dashboard/AdminDashboardHomeV2";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import EmployeeGoalDashboard from "@/components/dashboard/EmployeeGoalDashboard";
import TodayWorkDashboard from "@/components/dashboard/TodayWorkDashboard";
import { getCompanyMonthlyPnl } from "@/lib/crm/company-pnl";
import { getCompanySalesTarget } from "@/lib/crm/company-sales-target";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import {
  listSettlementEmployees,
  type SettlementEmployeeOption,
} from "@/lib/crm/settlements";
import { getTodayWorkBundle } from "@/lib/crm/today-work";
import type { CustomerSchedule } from "@/types/database";

type Props = {
  searchParams: Promise<{ employeeId?: string; teamId?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;

  let loadError: string | null = null;
  let bundle = null;
  let settlementSummary = null;
  let companyTarget = null;
  let companyPnl = null;
  let salesEmployees: SettlementEmployeeOption[] = [];

  try {
    settlementSummary = await getDashboardSettlementSummary();
  } catch {
    settlementSummary = null;
  }

  const isAdmin = settlementSummary?.isFinanceAdmin === true;

  if (isAdmin) {
    const [targetResult, employeeResult, pnlResult] = await Promise.allSettled([
      getCompanySalesTarget(2026),
      listSettlementEmployees(),
      getCompanyMonthlyPnl(2026),
    ]);
    companyTarget =
      targetResult.status === "fulfilled" ? targetResult.value : null;
    salesEmployees =
      employeeResult.status === "fulfilled" ? employeeResult.value : [];
    companyPnl = pnlResult.status === "fulfilled" ? pnlResult.value : null;
  }

  try {
    bundle = await getTodayWorkBundle({
      employeeId: params.employeeId ?? null,
      teamId: params.teamId ?? null,
    });
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "오늘 할 일을 불러오지 못했습니다.";
  }

  const schedulesById: Record<string, CustomerSchedule> = {};
  if (bundle) {
    for (const s of [...bundle.schedulesToday, ...bundle.overdueSchedules]) {
      schedulesById[s.id] = s;
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {settlementSummary ? (
          isAdmin ? (
            <AdminDashboardHomeV2
              summary={settlementSummary}
              companyTarget={companyTarget}
              companyPnl={companyPnl}
              salesEmployees={salesEmployees}
            />
          ) : (
            <EmployeeGoalDashboard summary={settlementSummary} />
          )
        ) : null}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {bundle ? (
          <TodayWorkDashboard bundle={bundle} schedulesById={schedulesById} />
        ) : null}

        {!bundle && !loadError ? (
          <div className="dashboard-card px-5 py-10 text-center text-sm text-slate-600">
            오늘 할 일 데이터를 준비 중입니다.
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
