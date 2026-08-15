import { redirect } from "next/navigation";
import AdminDashboardNav from "@/components/dashboard/AdminDashboardNav";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ManagementAiPanel from "@/components/dashboard/ManagementAiPanel";
import MonthlyPnlOverviewV2 from "@/components/dashboard/MonthlyPnlOverviewV2";
import { getCompanyMonthlyPnl } from "@/lib/crm/company-pnl";
import { getCompanySalesTarget } from "@/lib/crm/company-sales-target";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import { buildRuleBasedManagementAnalysis } from "@/lib/crm/management-analysis";
import { DEFAULT_COMPANY_ANNUAL_SALES_TARGET } from "@/lib/crm/sales-goals";

export default async function AdminFinanceDashboardPage() {
  const summary = await getDashboardSettlementSummary();
  if (!summary.isFinanceAdmin) redirect("/dashboard");

  const [pnl, target] = await Promise.all([
    getCompanyMonthlyPnl(2026),
    getCompanySalesTarget(2026),
  ]);
  const annualTarget =
    target?.targetAmount ?? DEFAULT_COMPANY_ANNUAL_SALES_TARGET;
  const analysis = buildRuleBasedManagementAnalysis({
    summary,
    pnl,
    annualTarget,
  });

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AdminDashboardNav active="finance" />
        <ManagementAiPanel initial={analysis} compact />
        {pnl ? (
          <MonthlyPnlOverviewV2
            pnl={pnl}
            annualTarget={annualTarget}
            officialSalesRevenue={summary.revenueAmount}
            mode="detail"
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-10 text-center text-sm font-bold text-amber-900">
            월별 손익자료가 아직 입력되지 않았습니다.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
