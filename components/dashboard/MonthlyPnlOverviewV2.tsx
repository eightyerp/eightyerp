import Link from "next/link";
import type { CompanyPnlSummary } from "@/lib/crm/company-pnl";

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

  const windowGrossProfit = pnl.windowRevenue - pnl.windowCogs;
  const interiorGrossProfit = pnl.interiorRevenue - pnl.interiorCogs;
  const windowShare =
    pnl.totalRevenue > 0 ? pnl.windowRevenue / pnl.totalRevenue : 0;
  const windowAllocatedSga = Math.round(pnl.sgaExpense * windowShare);
  const interiorAllocatedSga = pnl.sgaExpense - windowAllocatedSga;
  const windowEstimatedOperatingProfit = windowGrossProfit - windowAllocatedSga;
  const interiorEstimatedOperatingProfit =
    interiorGrossProfit - interiorAllocatedSga;

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
            사업부별 비용·손익
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            창호와 인테리어의 매출원가를 직접 구분하고, 판매관리비는 회사 공통비와 매출비중 가배분 참고값으로 나눠 봅니다.
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

      <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-3">
        <BusinessPnlCard
          title="창호"
          tone="window"
          revenue={pnl.windowRevenue}
          directCost={pnl.windowCogs}
          grossProfit={windowGrossProfit}
          allocatedSga={windowAllocatedSga}
          estimatedOperatingProfit={windowEstimatedOperatingProfit}
        />
        <BusinessPnlCard
          title="인테리어"
          tone="interior"
          revenue={pnl.interiorRevenue}
          directCost={pnl.interiorCogs}
          grossProfit={interiorGrossProfit}
          allocatedSga={interiorAllocatedSga}
          estimatedOperatingProfit={interiorEstimatedOperatingProfit}
        />
        <CompanyCostCard pnl={pnl} />
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
        <PaceMetric
          label="연간 100억 목표 대비"
          value={`${annualAchievement.toFixed(1)}%`}
          sub={`손익 매출 ${compactMoney(pnl.totalRevenue)}`}
        />
        <PaceMetric
          label={`${pnl.latestMonth ?? 0}월 누적 목표 진도`}
          value={`${paceAchievement.toFixed(1)}%`}
          sub={`누적 기준목표 ${compactMoney(elapsedTarget)}`}
        />
        <PaceMetric
          label="월평균 손익 매출"
          value={compactMoney(pnl.totalRevenue / Math.max(1, pnl.rows.length))}
          sub={`월 목표 ${compactMoney(monthlyTarget)}`}
        />
        <PaceMetric
          label="공통 판매관리비율"
          value={rate(pnl.sgaExpense, pnl.totalRevenue)}
          sub={`누계 ${money(pnl.sgaExpense)}`}
        />
      </div>

      <div className="overflow-x-auto border-t border-slate-100">
        <table className="min-w-[1240px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-600">
            <tr>
              <th className="px-4 py-3">월</th>
              <th className="px-4 py-3 text-right text-sky-800">창호 매출</th>
              <th className="px-4 py-3 text-right text-sky-800">창호 원가</th>
              <th className="px-4 py-3 text-right text-violet-800">인테리어 매출</th>
              <th className="px-4 py-3 text-right text-violet-800">인테리어 원가</th>
              <th className="px-4 py-3 text-right">총매출</th>
              <th className="px-4 py-3 text-right">매출총이익</th>
              <th className="px-4 py-3 text-right text-orange-800">공통 판관비</th>
              {isDetail ? (
                <th className="px-4 py-3 text-right">영업손익</th>
              ) : null}
              {isDetail ? (
                <th className="px-4 py-3 text-right">장려금·기타</th>
              ) : null}
              <th className="px-4 py-3 text-right">최종순이익</th>
              <th className="px-4 py-3 text-right">월 목표</th>
            </tr>
          </thead>
          <tbody>
            {pnl.rows.map((row) => {
              const monthAchievement =
                monthlyTarget > 0
                  ? (row.totalRevenue / monthlyTarget) * 100
                  : 0;
              return (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-black text-slate-950">
                    {row.month}월
                  </td>
                  <MoneyCell value={row.windowRevenue} tone="window" />
                  <MoneyCell value={row.windowCogs} tone="windowCost" />
                  <MoneyCell value={row.interiorRevenue} tone="interior" />
                  <MoneyCell value={row.interiorCogs} tone="interiorCost" />
                  <MoneyCell value={row.totalRevenue} strong />
                  <MoneyCell value={row.grossProfit} strong />
                  <MoneyCell value={row.sgaExpense} tone="expense" />
                  {isDetail ? (
                    <MoneyCell
                      value={row.operatingProfit}
                      negative={row.operatingProfit < 0}
                    />
                  ) : null}
                  {isDetail ? <MoneyCell value={row.otherIncome} /> : null}
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
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-950">
            <tr>
              <td className="px-4 py-3">누계</td>
              <td className="px-4 py-3 text-right text-sky-800">
                {compactMoney(pnl.windowRevenue)}
              </td>
              <td className="px-4 py-3 text-right text-sky-950">
                {compactMoney(pnl.windowCogs)}
              </td>
              <td className="px-4 py-3 text-right text-violet-800">
                {compactMoney(pnl.interiorRevenue)}
              </td>
              <td className="px-4 py-3 text-right text-violet-950">
                {compactMoney(pnl.interiorCogs)}
              </td>
              <td className="px-4 py-3 text-right">
                {compactMoney(pnl.totalRevenue)}
              </td>
              <td className="px-4 py-3 text-right">
                {compactMoney(pnl.grossProfit)}
              </td>
              <td className="px-4 py-3 text-right text-orange-800">
                {compactMoney(pnl.sgaExpense)}
              </td>
              {isDetail ? (
                <td
                  className={`px-4 py-3 text-right ${
                    pnl.operatingProfit < 0 ? "text-red-700" : ""
                  }`}
                >
                  {compactMoney(pnl.operatingProfit)}
                </td>
              ) : null}
              {isDetail ? (
                <td className="px-4 py-3 text-right">
                  {compactMoney(pnl.otherIncome)}
                </td>
              ) : null}
              <td
                className={`px-4 py-3 text-right ${
                  pnl.netProfit < 0 ? "text-red-700" : "text-emerald-700"
                }`}
              >
                {compactMoney(pnl.netProfit)}
              </td>
              <td className="px-4 py-3 text-right">
                {annualAchievement.toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600 sm:px-6">
        <p>
          창호·인테리어 원가는 내부 손익계산서의 사업부 직접원가입니다. 판매관리비는 현재 회사 공통비이며, 카드에 표시한 사업부 판관비는 매출비중 가배분 참고값입니다.
        </p>
        <p>
          향후 지출등록에 사업부·공통비 태그가 누적되면 실제 사용기준으로 판관비를 자동 분리할 수 있습니다.
        </p>
        {Math.abs(reconciliationGap) >= 1 ? (
          <p className="font-bold text-slate-800">
            현재 내부 손익매출과 영업 실적원장 차이: {reconciliationGap >= 0 ? "+" : ""}
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
  allocatedSga,
  estimatedOperatingProfit,
}: {
  title: string;
  tone: "window" | "interior";
  revenue: number;
  directCost: number;
  grossProfit: number;
  allocatedSga: number;
  estimatedOperatingProfit: number;
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
          원가율 {rate(directCost, revenue)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="매출" value={compactMoney(revenue)} />
        <MiniMetric label="직접원가" value={compactMoney(directCost)} />
        <MiniMetric label="매출총이익" value={compactMoney(grossProfit)} />
        <MiniMetric label="마진율" value={rate(grossProfit, revenue)} />
      </div>
      <div className="mt-3 rounded-xl border border-white/80 bg-white/70 px-3 py-3">
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
          <span>판관비 가배분(매출비중)</span>
          <span>{compactMoney(allocatedSga)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-xs font-black text-slate-600">가배분 영업손익</span>
          <span
            className={`text-base font-black ${
              estimatedOperatingProfit < 0
                ? "text-red-700"
                : "text-emerald-700"
            }`}
          >
            {compactMoney(estimatedOperatingProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CompanyCostCard({ pnl }: { pnl: CompanyPnlSummary }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-300">
        COMPANY COMMON COST
      </p>
      <h3 className="mt-1 text-xl font-black">회사 공통비</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <DarkMiniMetric label="판매관리비" value={compactMoney(pnl.sgaExpense)} />
        <DarkMiniMetric
          label="판관비율"
          value={rate(pnl.sgaExpense, pnl.totalRevenue)}
        />
        <DarkMiniMetric label="장려금·기타" value={compactMoney(pnl.otherIncome)} />
        <DarkMiniMetric label="최종 순이익" value={compactMoney(pnl.netProfit)} />
      </div>
      <div className="mt-3 rounded-xl bg-white/10 px-3 py-3">
        <p className="text-xs font-bold text-slate-300">공식 영업이익</p>
        <p
          className={`mt-1 text-xl font-black ${
            pnl.operatingProfit < 0 ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {compactMoney(pnl.operatingProfit)}
        </p>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-3">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black text-slate-950">{value}</p>
    </div>
  );
}

function DarkMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-3">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
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
  tone?:
    | "window"
    | "windowCost"
    | "interior"
    | "interiorCost"
    | "expense";
  strong?: boolean;
  negative?: boolean;
  positive?: boolean;
}) {
  const color = negative
    ? "text-red-700"
    : positive
      ? "text-emerald-700"
      : tone === "window"
        ? "text-sky-700"
        : tone === "windowCost"
          ? "text-sky-950"
          : tone === "interior"
            ? "text-violet-700"
            : tone === "interiorCost"
              ? "text-violet-950"
              : tone === "expense"
                ? "text-orange-800"
                : "text-slate-700";
  return (
    <td
      className={`px-4 py-3 text-right ${
        strong ? "font-black" : "font-semibold"
      } ${color}`}
      title={money(value)}
    >
      {compactMoney(value)}
    </td>
  );
}
