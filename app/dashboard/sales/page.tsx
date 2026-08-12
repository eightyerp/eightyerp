import { redirect } from "next/navigation";
import AdminDashboardNav from "@/components/dashboard/AdminDashboardNav";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SalesAnalyticsPanel from "@/components/dashboard/SalesAnalyticsPanel";
import SettlementDashboardSummary from "@/components/dashboard/SettlementDashboardSummary";
import WindowYoYCard from "@/components/dashboard/WindowYoYCard";
import { getDashboardMonthlySalesAnalytics } from "@/lib/crm/dashboard-monthly-sales";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import { getWindowYoYSummary } from "@/lib/crm/window-yoy";

export default async function AdminSalesDashboardPage() {
  const summary = await getDashboardSettlementSummary();
  if (!summary.isFinanceAdmin) redirect("/dashboard");

  let analytics = null;
  let windowYoY = null;

  try {
    analytics = await getDashboardMonthlySalesAnalytics();
  } catch {
    analytics = null;
  }

  try {
    windowYoY = await getWindowYoYSummary();
  } catch {
    windowYoY = null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AdminDashboardNav active="sales" />
        <SettlementDashboardSummary summary={summary} />
        {analytics ? (
          <SalesAnalyticsPanel analytics={analytics} employeeSales={summary.employeeSales} />
        ) : null}
        {windowYoY ? <WindowYoYCard summary={windowYoY} /> : null}
      </div>
    </DashboardLayout>
  );
}
