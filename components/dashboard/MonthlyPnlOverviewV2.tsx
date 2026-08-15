import Link from "next/link";
import type {
  CompanyMonthlyPnlRow,
  CompanyPnlSummary,
} from "@/lib/crm/company-pnl";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 100_000_000) {
    return `${sign}${(absolute / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1")}억`;
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

export default function MonthlyPnlOverviewV2({
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
  const isDetail = mode === "detail";
  const monthlyTarget = annualTarget > 0 ? annualTarget / 12 : 0;
  const elapsedTarget = monthlyTarget * Number(pnl.latestMonth ?? 0);
  const annualAchievement =
    annualTarget > 0 ? (pnl.totalRevenue / annualTarget) * 100 : 0;
  const paceAchievement =
    elapsedTarget > 0 ? (pnl.totalRevenue / elapsedTarget) * 100 : 0;
  const reconciliationGap = pnl.totalRevenue - officialSalesRevenue;

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">
              MONTHLY P&amp;L
            </p>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-amber-900 shadow-sm">
              {pnl.year}년 1~{pnl.latestMonth ?? "-"}월
            </span>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white">
              내부 손익자료
            </span>
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
            사업부별 실제 판관비·영업손익
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            매출비중 가배분을 제거하고 내부 손익 엑셀의 사업부별 경비총액을 그대로 반영합니다.
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

      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold leading-5 text-slate-700 sm:px-6">
        <strong className="text-slate-950">지표 기준:</strong> 위 영업실적 카드의 마진은 현장 기여마진이고, 이 영역은 영업인센티브와 내부 매출 인식이 반영된 손익계산서 기준입니다. 서로 다른 지표이므로 동일한 마진율로 비교하지 않습니다.
      </div>

      <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-3">
        <BusinessPnlCard
          title="창호"
          tone="window"
          revenue={pnl.windowRevenue}
          directCost={pnl.windowCogs}
          grossProfit={pnl.windowGrossProfit}
          sgaExpense={pnl.windowSgaExpense}
          operatingProfit={pnl.windowOperatingProfit}
          note="내부 엑셀의 창호 비용 블록 기준이며 사무실·대표급여 등 본사성 비용이 포함되어 있습니다."
        />
        <BusinessPnlCard
          title="인테리어"
          tone="interior"
          revenue={pnl.interiorRevenue}
          directCost={pnl.interiorCogs}
          grossProfit={pnl.interiorGrossProfit}
          sgaExpense={pnl.interiorSgaExpense}
          operatingProfit={pnl.interiorOperatingProfit}
          note="인테리어 손익 블록의 경비총액을 그대로 반영했습니다."
        />
        <CompanyCostCard pnl={pnl} />
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
        <PaceMetric
          label="연간 목표 대비"
          value={`${annualAchievement.toFixed(1)}%`}
          sub={`손익 매출 ${compactMoney(pnl.totalRevenue)}`}
        />
        <PaceMetric
          label={`${pnl.latestMonth ?? 0}월 누적 목표 진도`}
          value={`${paceAchievement.toFixed(1)}%`}
          sub={`누적 기준목표 ${compactMoney(elapsedTarget)}`}
        />
        <PaceMetric
          label="총 판매관리비율"
          value={rate(pnl.sgaExpense, pnl.totalRevenue)}
          sub={`누계 ${compactMoney(pnl.sgaExpense)}`}
        />
        <PaceMetric
          label="최종 순이익률"
          value={rate(pnl.netProfit, pnl.totalRevenue)}
          sub={`순이익 ${compactMoney(pnl.netProfit)}`}
        />
      </div>

      <div className="overflow-x-auto border-t border-slate-100">
        <table className="w-full min-w-[1450px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-600">
            <tr>
              <th className="px-4 py-3">월</th>
              <th className="px-4 py-3 text-right text-sky-800">창호 매출</th>
              <th className="px-4 py-3 text-right text-sky-800">창호 직접원가</th>
              <th className="px-4 py-3 text-right text-sky-800">창호 판관비</th>
              <th className="px-4 py-3 text-right text-sky-800">창호 영업손익</th>
              <th className="px-4 py-3 text-right text-violet-800">인테리어 매출</th>
              <th className="px-4 py-3 text-right text-violet-800">인테리어 직접원가</th>
              <th className="px-4 py-3 text-right text-violet-800">인테리어 판관비</th>
              <th className="px-4 py-3 text-right text-violet-800">인테리어 영업손익</th>
              <th className="px-4 py-3 text-right text-orange-800">공통 판관비</th>
              {isDetail ? (
                <th className="px-4 py-3 text-right">장려금·기타</th>
              ) : null}
              <th className="px-4 py-3 text-right">최종 순이익</th>
              <th className="px-4 py-3 text-right">월 목표</th>
            </tr>
          </thead>
          <tbody>
            {pnl.rows.map((row) => (
              <PnlRow
                key={row.id}
                row={row}
                monthlyTarget={monthlyTarget}
                showOtherIncome={isDetail}
              />
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-950">
            <tr>
              <td className="px-4 py-3">누계</td>
              <MoneyFoot value={pnl.windowRevenue} tone="window" />
              <MoneyFoot value={pnl.windowCogs} tone="window" />
              <MoneyFoot value={pnl.windowSgaExpense} tone="window" />
              <MoneyFoot
                value={pnl.windowOperatingProfit}
                negative={pnl.windowOperatingProfit < 0}
              />
              <MoneyFoot value={pnl.interiorRevenue} tone="interior" />
              <MoneyFoot value={pnl.interiorCogs} tone="interior" />
              <MoneyFoot value={pnl.interiorSgaExpense} tone="interior" />
              <MoneyFoot
                value={pnl.interiorOperatingProfit}
                positive={pnl.interiorOperatingProfit > 0}
                negative={pnl.interiorOperatingProfit < 0}
              />
              <MoneyFoot value={pnl.commonSgaExpense} tone="expense" />
              {isDetail ? <MoneyFoot value={pnl.otherIncome} /> : null}
              <MoneyFoot
                value={pnl.netProfit}
                positive={pnl.netProfit > 0}
                negative={pnl.netProfit < 0}
              />
              <td className="px-4 py-3 text-right">
                {annualAchievement.toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600 sm:px-6">
        <p>
          2026 영업계획 엑셀 기준 누적 판관비는 창호·본사 {compactMoney(pnl.windowSgaExpense)}, 인테리어 {compactMoney(pnl.interiorSgaExpense)}, 별도 공통 {compactMoney(pnl.commonSgaExpense)}입니다.
        </p>
        <p className="font-bold text-amber-900">
          현재 창호 비용 블록에는 사무실·대표급여 등 본사성 비용이 포함되어 있으므로 창호 순수 수익성을 확정하려면 해당 비용을 공통비로 재분류해야 합니다.
        </p>
        {Math.abs(reconciliationGap) >= 1 ? (
          <p className="font-bold text-slate-800">
            내부 손익매출과 영업 실적원장 차이: {reconciliationGap >= 0 ? "+" : ""}
            {compactMoney(reconciliationGap)}
            {pnl.sourceCutoffDate
              ? ` · 자료 기준일 ${pnl.sourceCutoffDate}`
              : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BusinessPnlCard({
  title,
  tone,
  revenue,
  directCost,
  grossProfit,
  sgaExpense,
  operatingProfit,
  note,
}: {
  title: string;
  tone: "window" | "interior";
  revenue: number;
  directCost: number;
  grossProfit: number;
  sgaExpense: number;
  operatingProfit: number;
  note: string;
}) {
  const isWindow = tone === "window";
  return (
    <div
      className={`rounded-2xl border p-5 ${
        isWindow
          ? "border-sky-200 bg-sky-50/70"
          : "border-violet-200 bg-violet-50/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-xs font-black uppercase tracking-[0.14em] ${
              isWindow ? "text-sky-700" : "text-violet-700"
            }`}
          >
            {isWindow ? "WINDOW" : "INTERIOR"}
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black ${
            isWindow
              ? "bg-sky-100 text-sky-800"
              : "bg-violet-100 text-violet-800"
          }`}
        >
          매출총이익률 {rate(grossProfit, revenue)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="매출" value={compactMoney(revenue)} />
        <MiniMetric label="직접원가" value={compactMoney(directCost)} />
        <MiniMetric label="매출총이익" value={compactMoney(grossProfit)} />
        <MiniMetric label="판관비" value={compactMoney(sgaExpense)} />
      </div>

      <div className="mt-3 rounded-xl border border-white/80 bg-white/80 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-black text-slate-600">사업부 영업손익</span>
          <span
            className={`text-lg font-black ${
              operatingProfit < 0 ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {compactMoney(operatingProfit)}
          </span>
        </div>
        <p className="mt-1 text-right text-xs font-bold text-slate-500">
          영업손익률 {rate(operatingProfit, revenue)}
        </p>
      </div>

      <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{note}</p>
    </div>
  );
}

function CompanyCostCard({ pnl }: { pnl: CompanyPnlSummary }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-800">
        COMPANY TOTAL
      </p>
      <h3 className="mt-1 text-xl font-black text-slate-950">회사 공통·최종손익</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="총 판관비" value={compactMoney(pnl.sgaExpense)} />
        <MiniMetric label="별도 공통비" value={compactMoney(pnl.commonSgaExpense)} />
        <MiniMetric label="회사 영업이익" value={compactMoney(pnl.operatingProfit)} />
        <MiniMetric label="장려금·기타" value={compactMoney(pnl.otherIncome)} />
      </div>
      <div className="mt-3 rounded-xl border border-white/80 bg-white/80 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-black text-slate-600">최종 순이익</span>
          <span
            className={`text-xl font-black ${
              pnl.netProfit < 0 ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {compactMoney(pnl.netProfit)}
          </span>
        </div>
        <p className="mt-1 text-right text-xs font-bold text-slate-500">
          순이익률 {rate(pnl.netProfit, pnl.totalRevenue)}
        </p>
      </div>
    </div>
  );
}

function PnlRow({
  row,
  monthlyTarget,
  showOtherIncome,
}: {
  row: CompanyMonthlyPnlRow;
  monthlyTarget: number;
  showOtherIncome: boolean;
}) {
  const monthAchievement =
    monthlyTarget > 0 ? (row.totalRevenue / monthlyTarget) * 100 : 0;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/70">
      <td className="px-4 py-3 font-black text-slate-950">{row.month}월</td>
      <MoneyCell value={row.windowRevenue} tone="window" />
      <MoneyCell value={row.windowCogs} tone="windowCost" />
      <MoneyCell value={row.windowSgaExpense} tone="windowCost" />
      <MoneyCell
        value={row.windowOperatingProfit}
        negative={row.windowOperatingProfit < 0}
        positive={row.windowOperatingProfit > 0}
      />
      <MoneyCell value={row.interiorRevenue} tone="interior" />
      <MoneyCell value={row.interiorCogs} tone="interiorCost" />
      <MoneyCell value={row.interiorSgaExpense} tone="interiorCost" />
      <MoneyCell
        value={row.interiorOperatingProfit}
        negative={row.interiorOperatingProfit < 0}
        positive={row.interiorOperatingProfit > 0}
      />
      <MoneyCell value={row.commonSgaExpense} tone="expense" />
      {showOtherIncome ? <MoneyCell value={row.otherIncome} /> : null}
      <MoneyCell
        value={row.netProfit}
        strong
        negative={row.netProfit < 0}
        positive={row.netProfit > 0}
      />
      <td className="px-4 py-3 text-right">
        <span
          className={`font-black ${
            monthAchievement >= 100
              ? "text-emerald-700"
              : monthAchievement < 70
                ? "text-red-700"
                : "text-slate-700"
          }`}
        >
          {monthAchievement.toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/80 px-3 py-3">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black text-slate-950">{value}</p>
    </div>
  );
}

function PaceMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
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
  tone?: "window" | "windowCost" | "interior" | "interiorCost" | "expense";
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
        : tone === "windowCost"
          ? "text-sky-950"
          : tone === "interior"
            ? "text-violet-800"
            : tone === "interiorCost"
              ? "text-violet-950"
              : tone === "expense"
                ? "text-orange-800"
                : "text-slate-700";
  return (
    <td
      className={`px-4 py-3 text-right ${strong ? "font-black" : "font-semibold"} ${color}`}
      title={money(value)}
    >
      {compactMoney(value)}
    </td>
  );
}

function MoneyFoot({
  value,
  tone,
  negative,
  positive,
}: {
  value: number;
  tone?: "window" | "interior" | "expense";
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
            : "text-slate-950";
  return (
    <td className={`px-4 py-3 text-right ${color}`} title={money(value)}>
      {compactMoney(value)}
    </td>
  );
}
