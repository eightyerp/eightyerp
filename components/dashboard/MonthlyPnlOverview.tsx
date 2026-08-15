import Link from "next/link";
import type { CompanyPnlSummary } from "@/lib/crm/company-pnl";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 100_000_000) {
    const text = (absolute / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
    return `${sign}${text}억`;
  }
  if (absolute >= 10_000) {
    return `${sign}${Math.round(absolute / 10_000).toLocaleString("ko-KR")}만`;
  }
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}`;
}

function money(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function MonthlyPnlOverview({
  pnl,
  annualTarget,
  officialSalesRevenue,
  mode = "home",
}: {
  pnl: CompanyPnlSummary;
  annualTarget: number;
  officialSalesRevenue: number;
  mode?: "home" | "detail";
}) {
  const monthlyTarget = annualTarget > 0 ? annualTarget / 12 : 0;
  const elapsedTarget = monthlyTarget * Number(pnl.latestMonth ?? 0);
  const annualAchievement = annualTarget > 0
    ? (pnl.totalRevenue / annualTarget) * 100
    : 0;
  const paceAchievement = elapsedTarget > 0
    ? (pnl.totalRevenue / elapsedTarget) * 100
    : 0;
  const reconciliationGap = pnl.totalRevenue - officialSalesRevenue;
  const isDetail = mode === "detail";

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">
              MONTHLY P&L
            </p>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-amber-900 shadow-sm">
              {pnl.year}년 1~{pnl.latestMonth ?? "-"}월
            </span>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white">
              내부 손익자료
            </span>
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
            월별 손익·판매관리비
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            창호와 인테리어 매출을 분리하고, 매출총이익·판매관리비·장려금·최종순이익을 함께 봅니다.
          </p>
        </div>
        {!isDetail ? (
          <Link
            href="/dashboard/finance"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-black text-amber-900 hover:bg-amber-50"
          >
            손익 상세보기
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryMetric label="손익 기준 매출" value={compactMoney(pnl.totalRevenue)} />
        <SummaryMetric label="창호 매출" value={compactMoney(pnl.windowRevenue)} tone="window" />
        <SummaryMetric label="인테리어 매출" value={compactMoney(pnl.interiorRevenue)} tone="interior" />
        <SummaryMetric label="매출총이익" value={compactMoney(pnl.grossProfit)} />
        <SummaryMetric label="판매관리비" value={compactMoney(pnl.sgaExpense)} tone="expense" />
        <SummaryMetric label="최종 순이익" value={compactMoney(pnl.netProfit)} tone={pnl.netProfit < 0 ? "negative" : "positive"} />
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
        <PaceMetric label="연간 100억 목표 대비" value={`${annualAchievement.toFixed(1)}%`} sub={`손익 매출 ${compactMoney(pnl.totalRevenue)}`} />
        <PaceMetric label={`${pnl.latestMonth ?? 0}월 누적 목표 진도`} value={`${paceAchievement.toFixed(1)}%`} sub={`누적 기준목표 ${compactMoney(elapsedTarget)}`} />
        <PaceMetric label="월평균 손익 매출" value={compactMoney(pnl.totalRevenue / Math.max(1, pnl.rows.length))} sub={`월 목표 ${compactMoney(monthlyTarget)}`} />
        <PaceMetric label="판매관리비율" value={rate(pnl.sgaExpense, pnl.totalRevenue)} sub={`누계 ${money(pnl.sgaExpense)}`} />
      </div>

      <div className="overflow-x-auto border-t border-slate-100">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-600">
            <tr>
              <th className="px-4 py-3">월</th>
              <th className="px-4 py-3 text-right">창호 매출</th>
              <th className="px-4 py-3 text-right">인테리어 매출</th>
              <th className="px-4 py-3 text-right">총매출</th>
              {isDetail ? <th className="px-4 py-3 text-right">매출원가</th> : null}
              <th className="px-4 py-3 text-right">매출총이익</th>
              <th className="px-4 py-3 text-right">판매관리비</th>
              {isDetail ? <th className="px-4 py-3 text-right">영업손익</th> : null}
              <th className="px-4 py-3 text-right">장려금</th>
              <th className="px-4 py-3 text-right">최종순이익</th>
              <th className="px-4 py-3 text-right">월 목표</th>
            </tr>
          </thead>
          <tbody>
            {pnl.rows.map((row) => {
              const monthAchievement = monthlyTarget > 0
                ? (row.totalRevenue / monthlyTarget) * 100
                : 0;
              return (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-black text-slate-950">{row.month}월</td>
                  <MoneyCell value={row.windowRevenue} tone="window" />
                  <MoneyCell value={row.interiorRevenue} tone="interior" />
                  <MoneyCell value={row.totalRevenue} strong />
                  {isDetail ? <MoneyCell value={row.totalCogs} /> : null}
                  <MoneyCell value={row.grossProfit} strong />
                  <MoneyCell value={row.sgaExpense} tone="expense" />
                  {isDetail ? <MoneyCell value={row.operatingProfit} negative={row.operatingProfit < 0} /> : null}
                  <MoneyCell value={row.otherIncome} />
                  <MoneyCell value={row.netProfit} strong negative={row.netProfit < 0} positive={row.netProfit > 0} />
                  <td className="px-4 py-3 text-right">
                    <span className={`font-black ${monthAchievement >= 100 ? "text-emerald-700" : "text-slate-700"}`}>
                      {monthAchievement.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-950">
            <tr>
              <td className="px-4 py-3">누계</td>
              <td className="px-4 py-3 text-right text-sky-800">{compactMoney(pnl.windowRevenue)}</td>
              <td className="px-4 py-3 text-right text-violet-800">{compactMoney(pnl.interiorRevenue)}</td>
              <td className="px-4 py-3 text-right">{compactMoney(pnl.totalRevenue)}</td>
              {isDetail ? <td className="px-4 py-3 text-right">{compactMoney(pnl.totalCogs)}</td> : null}
              <td className="px-4 py-3 text-right">{compactMoney(pnl.grossProfit)}</td>
              <td className="px-4 py-3 text-right text-orange-800">{compactMoney(pnl.sgaExpense)}</td>
              {isDetail ? <td className={`px-4 py-3 text-right ${pnl.operatingProfit < 0 ? "text-red-700" : ""}`}>{compactMoney(pnl.operatingProfit)}</td> : null}
              <td className="px-4 py-3 text-right">{compactMoney(pnl.otherIncome)}</td>
              <td className={`px-4 py-3 text-right ${pnl.netProfit < 0 ? "text-red-700" : "text-emerald-700"}`}>{compactMoney(pnl.netProfit)}</td>
              <td className="px-4 py-3 text-right">{annualAchievement.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600 sm:px-6">
        <p>
          손익 기준 매출은 내부 손익계산서의 매출 인식월 기준이며, 직원 실적은 현장·시공자료 기준이라 시점과 내부 조정에 따라 차이가 날 수 있습니다.
        </p>
        {Math.abs(reconciliationGap) >= 1 ? (
          <p className="font-bold text-slate-800">
            현재 내부 손익매출과 영업 실적원장 차이: {reconciliationGap >= 0 ? "+" : ""}{compactMoney(reconciliationGap)}
            {pnl.sourceCutoffDate ? ` · 자료 기준일 ${pnl.sourceCutoffDate}` : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "window" | "interior" | "expense" | "positive" | "negative";
}) {
  const valueClass =
    tone === "window"
      ? "text-sky-800"
      : tone === "interior"
        ? "text-violet-800"
        : tone === "expense"
          ? "text-orange-800"
          : tone === "positive"
            ? "text-emerald-700"
            : tone === "negative"
              ? "text-red-700"
              : "text-slate-950";
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function PaceMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-500">{sub}</p>
    </div>
  );
}

function MoneyCell({
  value,
  tone,
  strong,
  negative,
  positive,
}: {
  value: number;
  tone?: "window" | "interior" | "expense";
  strong?: boolean;
  negative?: boolean;
  positive?: boolean;
}) {
  const color = negative
    ? "text-red-700"
    : positive
      ? "text-emerald-700"
      : tone === "window"
        ? "text-sky-800"
        : tone === "interior"
          ? "text-violet-800"
          : tone === "expense"
            ? "text-orange-800"
            : "text-slate-700";
  return (
    <td className={`px-4 py-3 text-right ${strong ? "font-black" : "font-semibold"} ${color}`} title={money(value)}>
      {compactMoney(value)}
    </td>
  );
}
