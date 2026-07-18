import DashboardLayout from "@/components/dashboard/DashboardLayout";
import TodayWorkDashboard from "@/components/dashboard/TodayWorkDashboard";
import { getTodayWorkBundle } from "@/lib/crm/today-work";
import type { CustomerSchedule } from "@/types/database";

type Props = {
  searchParams: Promise<{ employeeId?: string; teamId?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;

  let loadError: string | null = null;
  let bundle = null;

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
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {bundle && (
          <TodayWorkDashboard bundle={bundle} schedulesById={schedulesById} />
        )}

        {!bundle && !loadError && (
          <div className="dashboard-card px-5 py-10 text-center text-sm text-gray-400">
            오늘 할 일 데이터를 준비 중입니다.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
