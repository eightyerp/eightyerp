import Link from "next/link";
import { redirect } from "next/navigation";
import AdminDashboardNav from "@/components/dashboard/AdminDashboardNav";
import CommonCostReclassPreview from "@/components/dashboard/CommonCostReclassPreview";
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
        <div className="flex flex-wrap gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <Link href="/finance/work-preview" className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">
            재무 통합 업무함 Preview
          </Link>
          <Link href="/finance/payments-preview" className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-900 hover:bg-indigo-100">
            지출 v2 Preview
          </Link>
          <Link href="/finance/collections-preview" className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-900 hover:bg-indigo-100">
            수금 v2 Preview
          </Link>
        </div>
        {pnl ? (
          <>
            <FinanceV2Preview summary={summary} pnl={pnl} />
            <CommonCostReclassPreview pnl={pnl} />
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-10 text-center text-sm font-bold text-amber-900">
            내부 손익자료가 없어 Finance V2 Preview를 계산할 수 없습니다.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
