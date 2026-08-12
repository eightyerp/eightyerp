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
              2026 매출·정산 실적
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
            매출 실적과 직원 정산을 분리해서 집계합니다.
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            매출·원가·마진은 실적원장, 정산지급·인센·차감은 정산원장을 기준으로 합니다.
            {summary.latestPayoutDate
              ? ` · 최근 정산지급 ${summary.latestPayoutDate}`
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
        <Metric label="매출실적" value={money(summary.revenueAmount)} />
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

      {summary.isFinanceAdmin && summary.employeeSales.length > 0 ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-950">직원별 2026 매출 실적</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                공동매출은 회사 전체에는 포함되지만 특정 직원 실적에는 배분하지 않습니다.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">담당</th>
                  <th className="px-4 py-2.5 text-right">매출</th>
                  <th className="px-4 py-2.5 text-right">원가</th>
                  <th className="px-4 py-2.5 text-right">마진</th>
                  <th className="px-4 py-2.5 text-right">마진율</th>
                </tr>
              </thead>
              <tbody>
                {summary.employeeSales.map((row) => (
                  <tr key={`${row.employeeId ?? "shared"}:${row.label}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-black text-slate-950">
                      {row.label}
                      {!row.employeeId ? (
                        <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                          공동
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{money(row.revenueAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{money(row.costAmount)}</td>
                    <td className="px-4 py-3 text-right font-black text-slate-950">{money(row.marginAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">{marginRate(row.revenueAmount, row.marginAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {summary.isFinanceAdmin ? (
        <div className="border-t border-slate-100 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-900">
          창호팀 매출 데이터는 현재 {summary.windowSalesCutoffLabel} 입력된 기준입니다. 이후 월 자료가 입력되기 전에는 그 이후 월 실적으로 해석하지 않습니다.
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
