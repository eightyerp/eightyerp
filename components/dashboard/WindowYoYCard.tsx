import type { WindowYoYSummary } from "@/lib/crm/window-yoy";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100_000_000) {
    const text = (amount / 100_000_000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
    return `${text}억`;
  }
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  return amount.toLocaleString("ko-KR");
}

function marginRate(revenue: number, margin: number) {
  if (revenue <= 0) return 0;
  return (margin / revenue) * 100;
}

function growth(current: number, prior: number) {
  if (prior <= 0) return null;
  return ((current / prior) - 1) * 100;
}

export default function WindowYoYCard({ summary }: { summary: WindowYoYSummary }) {
  const revenueGrowth = growth(summary.currentRevenue, summary.priorSamePeriodRevenue);
  const marginGrowth = growth(summary.currentMargin, summary.priorSamePeriodMargin);
  const currentRate = marginRate(summary.currentRevenue, summary.currentMargin);
  const priorRate = marginRate(summary.priorSamePeriodRevenue, summary.priorSamePeriodMargin);
  const rateDelta = currentRate - priorRate;

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-sky-100 bg-sky-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">WINDOW YOY</p>
          <h3 className="mt-1 text-base font-black text-slate-950">창호 전년동기 비교</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {summary.priorYear}년 1~{summary.currentThroughMonth}월과 {summary.currentYear}년 1~{summary.currentThroughMonth}월을 같은 기간으로 비교합니다.
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-sky-800 ring-1 ring-sky-200">
          {summary.currentYear}년 {summary.currentThroughMonth}월까지
        </span>
      </div>

      <div className="grid gap-px bg-slate-100 md:grid-cols-3">
        <Metric
          label="매출"
          current={compactMoney(summary.currentRevenue)}
          prior={`${summary.priorYear} ${compactMoney(summary.priorSamePeriodRevenue)}`}
          delta={revenueGrowth}
        />
        <Metric
          label="마진"
          current={compactMoney(summary.currentMargin)}
          prior={`${summary.priorYear} ${compactMoney(summary.priorSamePeriodMargin)}`}
          delta={marginGrowth}
        />
        <div className="bg-white px-5 py-4">
          <p className="text-xs font-black text-slate-500">마진율</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{currentRate.toFixed(1)}%</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{summary.priorYear} 동기 {priorRate.toFixed(1)}%</p>
          <p className={`mt-2 text-xs font-black ${rateDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {rateDelta >= 0 ? "+" : ""}{rateDelta.toFixed(1)}%p
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>{summary.priorYear} 연간 창호 매출 {compactMoney(summary.priorFullYearRevenue)}</span>
        <span>{summary.priorYear} 연간 마진 {compactMoney(summary.priorFullYearMargin)}</span>
      </div>
    </section>
  );
}

function Metric({
  label,
  current,
  prior,
  delta,
}: {
  label: string;
  current: string;
  prior: string;
  delta: number | null;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{current}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{prior}</p>
      {delta != null ? (
        <p className={`mt-2 text-xs font-black ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          전년동기 {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
        </p>
      ) : null}
    </div>
  );
}
