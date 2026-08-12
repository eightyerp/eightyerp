import { redirect } from "next/navigation";
import AdminDashboardNav from "@/components/dashboard/AdminDashboardNav";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import TodayWorkDashboard from "@/components/dashboard/TodayWorkDashboard";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import { getTodayWorkBundle } from "@/lib/crm/today-work";
import type { CustomerSchedule } from "@/types/database";

type Props = {
  searchParams: Promise<{ employeeId?: string; teamId?: string }>;
};

export default async function AdminCustomerDashboardPage({ searchParams }: Props) {
  const summary = await getDashboardSettlementSummary();
  if (!summary.isFinanceAdmin) redirect("/dashboard");

  const params = await searchParams;
  let bundle = null;
  let loadError: string | null = null;

  try {
    bundle = await getTodayWorkBundle({
      employeeId: params.employeeId ?? null,
      teamId: params.teamId ?? null,
    });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "고객·영업 데이터를 불러오지 못했습니다.";
  }

  const schedulesById: Record<string, CustomerSchedule> = {};
  if (bundle) {
    for (const s of [...bundle.schedulesToday, ...bundle.overdueSchedules]) {
      schedulesById[s.id] = s;
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AdminDashboardNav active="customers" />
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">CUSTOMER & SALES</p>
          <h1 className="mt-1 text-xl font-black text-slate-950">고객·영업 대시보드</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            상담·실측·견적·계약과 미처리 고객을 영업 흐름 중심으로 확인합니다.
          </p>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
        ) : null}

        {bundle ? <TodayWorkDashboard bundle={bundle} schedulesById={schedulesById} /> : null}
      </div>
    </DashboardLayout>
  );
}
