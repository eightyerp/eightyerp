import { redirect } from "next/navigation";
import AdminDashboardNav from "@/components/dashboard/AdminDashboardNav";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";

const METRICS = [
  "유입경로별 문의수",
  "문의→견적 전환율",
  "견적→계약 전환율",
  "유입경로별 매출·마진",
  "광고비 대비 매출·마진",
  "아파트·지역·키워드별 성과",
] as const;

export default async function AdminMarketingDashboardPage() {
  const summary = await getDashboardSettlementSummary();
  if (!summary.isFinanceAdmin) redirect("/dashboard");

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AdminDashboardNav active="marketing" />

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fuchsia-700">MARKETING</p>
          <h1 className="mt-1 text-xl font-black text-slate-950">마케팅 분석 대시보드</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            고객 유입경로를 실제 견적·계약·매출·마진까지 연결하는 관리자 전용 분석 화면입니다.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {METRICS.map((metric) => (
            <div key={metric} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black text-slate-950">{metric}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                ERP 고객·견적·계약 데이터와 광고비 데이터 연결 후 자동 집계됩니다.
              </p>
            </div>
          ))}
        </section>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
          현재는 분석 화면을 매출/고객 화면과 분리해 두었습니다. 다음 단계에서 유입경로와 광고비 원장을 연결하면 이 화면에 실데이터가 자동 표시됩니다.
        </div>
      </div>
    </DashboardLayout>
  );
}
