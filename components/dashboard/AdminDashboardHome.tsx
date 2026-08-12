import Link from "next/link";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100_000_000) {
    const text = (amount / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
    return `${text}억`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  }
  return amount.toLocaleString("ko-KR");
}

function marginRate(revenue: number, margin: number) {
  if (revenue <= 0) return "-";
  return `${((margin / revenue) * 100).toFixed(1)}%`;
}

const SECTIONS = [
  {
    href: "/dashboard/sales",
    label: "매출·경영 분석",
    description: "창호·인테리어 매출, 월별 추이, 전년비, 직원 점유율, 마진을 봅니다.",
  },
  {
    href: "/dashboard/customers",
    label: "고객·영업 분석",
    description: "오늘 할 일, 상담·실측·견적·계약, 미처리 고객 흐름을 봅니다.",
  },
  {
    href: "/dashboard/marketing",
    label: "마케팅 분석",
    description: "유입경로, 문의→견적→계약 전환과 광고효율을 연결할 전용 화면입니다.",
  },
] as const;

export default function AdminDashboardHome({
  summary,
}: {
  summary: DashboardSettlementSummary;
}) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">
            ADMIN BUSINESS HOME
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            2026 경영 요약
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            상세 분석은 목적별 대시보드로 분리했습니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 lg:grid-cols-4">
          <DarkMetric label="누적 매출" value={compactMoney(summary.revenueAmount)} />
          <DarkMetric label="매출원가" value={compactMoney(summary.costAmount)} />
          <DarkMetric label="마진" value={compactMoney(summary.marginAmount)} />
          <DarkMetric label="마진율" value={marginRate(summary.revenueAmount, summary.marginAmount)} />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-950">{section.label}</h2>
              <span className="text-lg font-black text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-900">→</span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              {section.description}
            </p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">직원 정산</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              실제 지급 {compactMoney(summary.paidAmount)} · 추가인센 {compactMoney(summary.additionalIncentiveAmount)} · 차감 {compactMoney(summary.deductionAmount)}
            </p>
          </div>
          <Link
            href="/finance/settlements"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-800 hover:bg-slate-50"
          >
            직원 정산 관리
          </Link>
        </div>
      </section>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950 px-5 py-4">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}
