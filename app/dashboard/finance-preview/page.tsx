import { redirect } from "next/navigation";
import AdminDashboardNav from "@/components/dashboard/AdminDashboardNav";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FinanceV2Preview from "@/components/dashboard/FinanceV2Preview";
import { getCompanyMonthlyPnl } from "@/lib/crm/company-pnl";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";

export default async function FinanceV2PreviewPage() {
  const [summary, pnl] = await Promise.all([
    getDashboardSettlementSummary(),
    getCompanyMonthlyPnl(2026),
  ]);

  if (!summary.isFinanceAdmin) redirect("/dashboard");

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AdminDashboardNav active="finance" />
        {pnl ? (
          <FinanceV2Preview summary={summary} pnl={pnl} />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-10 text-center text-sm font-bold text-amber-900">
            내부 손익자료가 없어 Finance V2 Preview를 계산할 수 없습니다.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
