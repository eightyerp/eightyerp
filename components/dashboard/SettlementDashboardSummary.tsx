import Link from "next/link";
import type {
  DashboardEmployeeSales,
  DashboardSettlementSummary,
} from "@/lib/crm/dashboard-settlement";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function compactMoney(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100_000_000) {
    const text = (amount / 100_000_000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
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

function sumRows(rows: DashboardEmployeeSales[]) {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenueAmount || 0),
      cost: acc.cost + Number(row.costAmount || 0),
      margin: acc.margin + Number(row.marginAmount || 0),
    }),
    { revenue: 0, cost: 0, margin: 0 },
  );
}

function shareOf(total: number, value: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export default function SettlementDashboardSummary({
  summary,
}: {
  summary: DashboardSettlementSummary;
}) {
  const windowRows = summary.employeeSales.filter(
    (row) => row.businessUnit === "window" && row.employeeId,
  );
  const interiorRows = summary.employeeSales.filter(
    (row) => row.businessUnit === "interior" && row.employeeId,
  );
  const sharedRows = summary.employeeSales.filter(
    (row) => row.businessUnit === "shared" || !row.employeeId,
  );

  const windowOwn = sumRows(windowRows);
  const shared = sumRows(sharedRows);
  const window = {
    revenue: windowOwn.revenue + shared.revenue,
    cost: windowOwn.cost + shared.cost,
    margin: windowOwn.margin + shared.margin,
  };
  const interior = sumRows(interiorRows);

  if (!summary.isFinanceAdmin) {
    const myRows = summary.employeeSales.filter((row) => row.employeeId);
    const my = sumRows(myRows);
    const myUnit = myRows[0]?.businessUnit === "interior" ? "인테리어" : "창호";

    return (
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">MY PERFORMANCE</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-slate-950">내 2026 실적</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                {myUnit}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              다른 직원의 실적·정산자료는 표시되지 않습니다.
            </p>
          </div>
          <Link
            href="/finance/settlements"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50"
          >
            내 정산 보기
          </Link>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <HeroMetric label="내 매출" value={compactMoney(my.revenue || summary.revenueAmount)} exact={money(my.revenue || summary.revenueAmount)} />
          <HeroMetric label="내 마진" value={compactMoney(my.margin || summary.marginAmount)} exact={`마진율 ${marginRate(my.revenue || summary.revenueAmount, my.margin || summary.marginAmount)}`} />
          <HeroMetric label="정산 지급" value={compactMoney(summary.paidAmount)} exact={summary.latestPayoutDate ? `최근 지급 ${summary.latestPayoutDate}` : "지급완료 내역 없음"} />
        </div>

        <SettlementStrip summary={summary} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">2026 BUSINESS DASHBOARD</p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-slate-200">회사 전체</span>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">누적 매출 {compactMoney(summary.revenueAmount)}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              창호와 인테리어를 분리해 보고, 회사 전체는 합산 기준으로 표시합니다.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-2 sm:min-w-[420px]">
            <DarkMetric label="매출원가" value={compactMoney(summary.costAmount)} />
            <DarkMetric label="마진" value={compactMoney(summary.marginAmount)} />
            <DarkMetric label="마진율" value={marginRate(summary.revenueAmount, summary.marginAmount)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BusinessUnitCard
          title="창호"
          subtitle={`입력 기준 ${summary.windowSalesCutoffLabel}`}
          revenue={window.revenue}
          cost={window.cost}
          margin={window.margin}
          totalRevenue={summary.revenueAmount}
          sharedRevenue={shared.revenue}
          unit="window"
        />
        <BusinessUnitCard
          title="인테리어"
          subtitle={`실적 기준 ${summary.interiorSalesPeriodLabel}${summary.interiorSalesIsPartial ? " · 부분실적" : ""}`}
          revenue={interior.revenue}
          cost={interior.cost}
          margin={interior.margin}
          totalRevenue={summary.revenueAmount}
          unit="interior"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-black text-slate-950">직원 정산 현황</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">매출 실적과 분리된 실제 지급·인센·차감 기준입니다.</p>
          </div>
          <Link
            href="/finance/settlements"
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50"
          >
            직원 정산 관리
          </Link>
        </div>
        <SettlementStrip summary={summary} />
      </div>

      {summary.employeeSales.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <TeamSalesPanel
            title="창호팀 실적"
            period={summary.windowSalesCutoffLabel}
            rows={windowRows}
            sharedRows={sharedRows}
            unit="window"
          />
          <TeamSalesPanel
            title="인테리어팀 실적"
            period={summary.interiorSalesPeriodLabel}
            rows={interiorRows}
            unit="interior"
          />
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <SourceNote tone="window" title="창호 데이터 기준">
          현재 {summary.windowSalesCutoffLabel} 입력된 실적입니다. 이후 월 자료는 입력 전까지 0매출로 보지 않습니다.
        </SourceNote>
        <SourceNote tone="interior" title="인테리어 데이터 기준">
          현재 {summary.interiorSalesPeriodLabel} 기준입니다. {summary.interiorSalesIsPartial ? "제공된 기간의 부분실적이며 이후 기간은 미포함입니다." : "입력된 기간 기준 실적입니다."}
        </SourceNote>
      </div>
    </section>
  );
}

function BusinessUnitCard({
  title,
  subtitle,
  revenue,
  cost,
  margin,
  totalRevenue,
  sharedRevenue = 0,
  unit,
}: {
  title: string;
  subtitle: string;
  revenue: number;
  cost: number;
  margin: number;
  totalRevenue: number;
  sharedRevenue?: number;
  unit: "window" | "interior";
}) {
  const isWindow = unit === "window";
  const share = shareOf(totalRevenue, revenue);

  return (
    <div className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${isWindow ? "border-sky-200" : "border-violet-200"}`}>
      <div className={`border-b px-5 py-4 ${isWindow ? "border-sky-100 bg-sky-50/70" : "border-violet-100 bg-violet-50/70"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.14em] ${isWindow ? "text-sky-700" : "text-violet-700"}`}>
              {isWindow ? "WINDOW" : "INTERIOR"}
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">{subtitle}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isWindow ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>
            전체 매출의 {share.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-500">누적 매출</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{compactMoney(revenue)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{money(revenue)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-slate-500">마진</p>
            <p className="mt-1 text-xl font-black text-slate-950">{compactMoney(margin)}</p>
            <p className={`mt-1 text-xs font-black ${isWindow ? "text-sky-700" : "text-violet-700"}`}>
              마진율 {marginRate(revenue, margin)}
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${isWindow ? "bg-sky-500" : "bg-violet-500"}`}
            style={{ width: `${share}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <SmallStat label="매출원가" value={compactMoney(cost)} />
          {isWindow && sharedRevenue > 0 ? (
            <SmallStat label="공동·행사 매출 포함" value={compactMoney(sharedRevenue)} />
          ) : (
            <SmallStat label="영업마진" value={compactMoney(margin)} />
          )}
        </div>
      </div>
    </div>
  );
}

function SettlementStrip({ summary }: { summary: DashboardSettlementSummary }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
      <StripMetric label="기본 정산" value={compactMoney(summary.baseSettlementAmount)} />
      <StripMetric label="추가 인센" value={summary.additionalIncentiveAmount > 0 ? `+ ${compactMoney(summary.additionalIncentiveAmount)}` : "0"} tone="positive" />
      <StripMetric label="차감" value={summary.deductionAmount > 0 ? `- ${compactMoney(summary.deductionAmount)}` : "0"} tone="negative" />
      <StripMetric label="실제 지급" value={compactMoney(summary.paidAmount)} sub={summary.latestPayoutDate ? `최근 ${summary.latestPayoutDate}` : undefined} />
    </div>
  );
}

function TeamSalesPanel({
  title,
  period,
  rows,
  sharedRows = [],
  unit,
}: {
  title: string;
  period: string;
  rows: DashboardEmployeeSales[];
  sharedRows?: DashboardEmployeeSales[];
  unit: "window" | "interior";
}) {
  const allRows = [...rows, ...sharedRows];
  const isWindow = unit === "window";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{period}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isWindow ? "bg-sky-50 text-sky-800" : "bg-violet-50 text-violet-800"}`}>
          {rows.length}명
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {allRows.map((row, index) => (
          <div key={`${row.businessUnit}:${row.employeeId ?? "shared"}:${row.label}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-black text-slate-500">
                  {row.employeeId ? index + 1 : "공"}
                </span>
                <p className="truncate text-sm font-black text-slate-950">{row.employeeId ? row.label : "공동·행사"}</p>
              </div>
              <p className="mt-1 pl-7 text-xs font-semibold text-slate-500">
                마진 {compactMoney(row.marginAmount)} · {marginRate(row.revenueAmount, row.marginAmount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-slate-950">{compactMoney(row.revenueAmount)}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-400">매출</p>
            </div>
          </div>
        ))}
        {allRows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm font-semibold text-slate-500">입력된 실적이 없습니다.</div>
        ) : null}
      </div>
    </div>
  );
}

function HeroMetric({ label, value, exact }: { label: string; value: string; exact: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{exact}</p>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function StripMetric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  const valueClass = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-slate-950";
  return (
    <div className="bg-white px-4 py-3.5">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-black ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{sub}</p> : null}
    </div>
  );
}

function SourceNote({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "window" | "interior";
  children: React.ReactNode;
}) {
  const isWindow = tone === "window";
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${isWindow ? "border-sky-100 bg-sky-50/70 text-sky-900" : "border-violet-100 bg-violet-50/70 text-violet-900"}`}>
      <p className="font-black">{title}</p>
      <p className="mt-1 leading-relaxed opacity-80">{children}</p>
    </div>
  );
}
