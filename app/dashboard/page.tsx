import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KpiCards from "@/components/dashboard/KpiCards";
import CrmStatusPanels from "@/components/dashboard/CrmStatusPanels";
import ContactScheduleCards from "@/components/dashboard/ContactScheduleCards";
import TodayContactCustomers from "@/components/dashboard/TodayContactCustomers";
import MonthlyRevenue from "@/components/dashboard/MonthlyRevenue";
import SiteProgress from "@/components/dashboard/SiteProgress";
import TradeRevenue from "@/components/dashboard/TradeRevenue";
import StaffPerformanceTable from "@/components/dashboard/StaffPerformanceTable";
import CustomerAlerts from "@/components/dashboard/CustomerAlerts";
import TodaySchedule from "@/components/dashboard/TodaySchedule";
import QuickRegister from "@/components/dashboard/QuickRegister";
import Notifications from "@/components/dashboard/Notifications";
import QuickMemo from "@/components/dashboard/QuickMemo";
import {
  getContactSchedule,
  getDashboardCrmStats,
  getEmployees,
} from "@/lib/crm/customers";
import type {
  ContactScheduleItem,
  DashboardCrmStats,
  Employee,
} from "@/types/database";

export default async function DashboardPage() {
  let stats: DashboardCrmStats | null = null;
  let todayContacts: ContactScheduleItem[] = [];
  let employees: Employee[] = [];
  let statsError: string | null = null;

  try {
    const [crmStats, todayList, empList] = await Promise.all([
      getDashboardCrmStats(),
      getContactSchedule("today"),
      getEmployees(),
    ]);
    stats = crmStats;
    todayContacts = todayList;
    employees = empList;
  } catch (error) {
    statsError =
      error instanceof Error
        ? error.message
        : "CRM 통계를 불러오지 못했습니다.";
  }

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
            대시보드
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {today} · 에잇티 ERP 경영 현황
          </p>
        </div>

        {statsError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            CRM 실데이터 KPI를 불러오지 못했습니다. migration 적용 후 다시
            확인해 주세요. ({statsError})
          </div>
        ) : (
          <>
            <KpiCards stats={stats} />
            {stats && <ContactScheduleCards stats={stats} />}
            <TodayContactCustomers
              items={todayContacts}
              employees={employees}
            />
            {stats && <CrmStatusPanels stats={stats} />}
          </>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <MonthlyRevenue />
          </div>
          <TradeRevenue />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SiteProgress />
          <CustomerAlerts />
        </div>

        <StaffPerformanceTable />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <TodaySchedule />
          <QuickRegister />
          <Notifications />
          <QuickMemo />
        </div>
      </div>
    </DashboardLayout>
  );
}
