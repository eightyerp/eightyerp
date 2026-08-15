import AdminDashboardHome from "@/components/dashboard/AdminDashboardHome";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import EmployeeGoalDashboard from "@/components/dashboard/EmployeeGoalDashboard";
import TodayWorkDashboard from "@/components/dashboard/TodayWorkDashboard";
import { getCompanySalesTarget } from "@/lib/crm/company-sales-target";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
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

  try {
    settlementSummary = await getDashboardSettlementSummary();
  } catch {
    settlementSummary = null;
  }

  const isAdmin = settlementSummary?.isFinanceAdmin === true;

  if (isAdmin) {
    try {
      companyTarget = await getCompanySalesTarget(2026);
    } catch {
      companyTarget = null;
    }
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
            <AdminDashboardHome
              summary={settlementSummary}
              companyTarget={companyTarget}
            />
          ) : (
            <EmployeeGoalDashboard summary={settlementSummary} />
          )
        ) : null}

        {!isAdmin && loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!isAdmin && bundle ? (
          <TodayWorkDashboard bundle={bundle} schedulesById={schedulesById} />
        ) : null}

        {!isAdmin && !bundle && !loadError ? (
          <div className="dashboard-card px-5 py-10 text-center text-sm text-slate-600">
            오늘 할 일 데이터를 준비 중입니다.
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
