import Link from "next/link";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function marginRate(revenue: number, margin: number) {
  if (revenue <= 0) return "-";
  return `${((margin / revenue) * 100).toFixed(1)}%`;
}

export default function SettlementDashboardSummary({
  summary,
}: {
  summary: DashboardSettlementSummary;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-wide text-indigo-700">
              2026 정산·실적
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
              {summary.scopeLabel}
            </span>
            {summary.isFinanceAdmin ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-900">
                창호 매출 {summary.windowSalesCutoffLabel}
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            정산자료가 입력되면 대시보드에 자동 반영됩니다.
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            확정·지급완료 정산만 공식 실적으로 집계합니다.
            {summary.latestPayoutDate
              ? ` · 최근 지급 ${summary.latestPayoutDate}`
              : " · 아직 지급완료 정산 없음"}
          </p>
        </div>
        <Link
          href="/finance/settlements"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50"
        >
          정산내역 보기
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
        <Metric label="매출" value={money(summary.revenueAmount)} />
        <Metric label="매출원가" value={money(summary.costAmount)} />
        <Metric
          label="마진"
          value={money(summary.marginAmount)}
          sub={`마진율 ${marginRate(summary.revenueAmount, summary.marginAmount)}`}
        />
        <Metric label="실제 정산지급" value={money(summary.paidAmount)} />
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        <MiniMetric label="기본 정산" value={money(summary.baseSettlementAmount)} />
        <MiniMetric
          label="추가 인센티브"
          value={`+ ${money(summary.additionalIncentiveAmount)}`}
          tone="positive"
        />
        <MiniMetric
          label="차감"
          value={`- ${money(summary.deductionAmount)}`}
          tone="negative"
        />
      </div>

      {summary.isFinanceAdmin ? (
        <div className="border-t border-slate-100 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-900">
          창호팀 매출 데이터는 현재 2026년 7월까지 입력된 기준입니다. 8월 데이터 입력 전까지는 8월 실적으로 해석하지 않습니다.
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
      {sub ? <p className="mt-1 text-xs font-bold text-slate-500">{sub}</p> : null}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-slate-950";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-black ${valueClass}`}>{value}</p>
    </div>
  );
}
