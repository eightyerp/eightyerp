import type { CompanyPnlSummary } from "@/lib/crm/company-pnl";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}억`;
  }
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function percent(value: number, base: number) {
  if (base <= 0) return "-";
  return `${((value / base) * 100).toFixed(1)}%`;
}

function sumUnit(
  rows: DashboardSettlementSummary["employeeSales"],
  unit: "window" | "interior",
) {
  const selected = rows.filter((row) =>
    unit === "window"
      ? row.businessUnit === "window" || row.businessUnit === "shared"
      : row.businessUnit === "interior",
  );
  return selected.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenueAmount || 0),
      cost: acc.cost + Number(row.costAmount || 0),
      margin: acc.margin + Number(row.marginAmount || 0),
    }),
    { revenue: 0, cost: 0, margin: 0 },
  );
}

function employeeSettlement(
  rows: DashboardSettlementSummary["employeeSales"],
  unit: "window" | "interior",
) {
  return rows
    .filter((row) => row.employeeId && row.businessUnit === unit)
    .reduce((sum, row) => {
      if (unit === "interior") {
        return sum + Math.floor(Math.max(0, Number(row.marginAmount || 0)) * 0.5);
      }
      return sum + Math.floor(Math.max(0, Number(row.revenueAmount || 0)) * 0.02);
    }, 0);
}

export default function FinanceV2Preview({
  summary,
  pnl,
}: {
  summary: DashboardSettlementSummary;
  pnl: CompanyPnlSummary;
}) {
  const window = sumUnit(summary.employeeSales, "window");
  const interior = sumUnit(summary.employeeSales, "interior");
  const windowSettlement = employeeSettlement(summary.employeeSales, "window");
  const interiorSettlement = employeeSettlement(summary.employeeSales, "interior");
  const windowRetained = window.margin - windowSettlement;
  const interiorRetained = interior.margin - interiorSettlement;
  const totalSettlement = windowSettlement + interiorSettlement;
  const totalRetained = windowRetained + interiorRetained;
  const revenueDifference = pnl.totalRevenue - summary.revenueAmount;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-indigo-200 bg-indigo-50 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">FINANCE V2 PREVIEW</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">현장마진 → 직원정산 → 회사귀속마진</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              직원 실적·현장 수익성 원장과 내부 손익 원장을 같은 마진율로 섞지 않습니다. 위쪽은 영업실적 원장의 현장 기여마진 흐름이고, 아래쪽은 내부 손익계산서 기준 공식 손익입니다.
            </p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-black text-indigo-900">
            Preview · 운영 DB 미변경
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ProfitBridgeCard
          title="창호"
          subtitle={`영업실적 ${summary.windowSalesCutoffLabel}`}
          revenue={window.revenue}
          directCost={window.cost}
          fieldMargin={window.margin}
          settlement={windowSettlement}
          settlementLabel="직원 잠정정산 2%"
          retainedMargin={windowRetained}
          note="현재 실제 ERP 확정계약이 없어 직원별 영업실적 매출을 2% 계산의 임시 대체값으로 사용합니다. 공동·대표 직영매출은 개인정산에서 제외합니다."
          tone="window"
        />
        <ProfitBridgeCard
          title="인테리어"
          subtitle={`영업실적 ${summary.interiorSalesPeriodLabel}`}
          revenue={interior.revenue}
          directCost={interior.cost}
          fieldMargin={interior.margin}
          settlement={interiorSettlement}
          settlementLabel="직원 잠정정산 50%"
          retainedMargin={interiorRetained}
          note="직원 잠정정산은 양수인 현장 기여마진의 50%입니다. 회사공통 판관비는 직원 정산마진에서 차감하지 않습니다."
          tone="interior"
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">OPERATIONAL PROFIT BRIDGE</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">영업실적 원장 기준 회사귀속마진 Preview</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            공식 회계손익이 아니라 직원정산 구조를 설명하기 위한 경영 참고값입니다.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="총 현장 기여마진" value={compactMoney(summary.marginAmount)} />
          <Kpi label="직원 잠정 기본정산" value={compactMoney(totalSettlement)} />
          <Kpi label="정산 후 회사귀속마진" value={compactMoney(totalRetained)} emphasis />
          <Kpi label="회사귀속마진율" value={percent(totalRetained, summary.revenueAmount)} />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">INTERNAL P&L</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">내부 손익계산서 기준 — 별도 트랙</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            내부 손익은 매출 인식월과 원가 포함범위가 영업실적 원장과 다릅니다. 특히 인테리어 내부 원가에는 영업인센티브가 포함된 자료이므로 위의 50% 잠정정산을 다시 차감하지 않습니다.
          </p>
        </div>
        <div className="grid gap-px bg-slate-100 lg:grid-cols-3">
          <PnlCard
            title="창호 내부손익"
            revenue={pnl.windowRevenue}
            cogs={pnl.windowCogs}
            grossProfit={pnl.windowGrossProfit}
            sga={pnl.windowSgaExpense}
            operatingProfit={pnl.windowOperatingProfit}
          />
          <PnlCard
            title="인테리어 내부손익"
            revenue={pnl.interiorRevenue}
            cogs={pnl.interiorCogs}
            grossProfit={pnl.interiorGrossProfit}
            sga={pnl.interiorSgaExpense}
            operatingProfit={pnl.interiorOperatingProfit}
          />
          <div className="bg-white p-5">
            <p className="text-xs font-black text-slate-500">회사 전체</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{compactMoney(pnl.totalRevenue)}</p>
            <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
              <Row label="회사 영업이익" value={compactMoney(pnl.operatingProfit)} />
              <Row label="장려금·기타수익" value={compactMoney(pnl.otherIncome)} />
              <Row label="최종 순이익" value={compactMoney(pnl.netProfit)} strong />
              <Row label="순이익률" value={percent(pnl.netProfit, pnl.totalRevenue)} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-slate-950">두 원장 차이</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="영업실적 매출" value={compactMoney(summary.revenueAmount)} />
          <Kpi label="내부 손익 매출" value={compactMoney(pnl.totalRevenue)} />
          <Kpi label="매출 인식 차이" value={compactMoney(revenueDifference)} emphasis={revenueDifference !== 0} />
        </div>
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
          차이는 자동으로 오류로 판정하지 않습니다. 매출 인식시점, 원가 포함범위, 영업인센티브, 사후조정 등을 대조해 사유를 기록하는 구조로 전환할 예정입니다.
        </p>
      </section>
    </div>
  );
}

function ProfitBridgeCard({
  title,
  subtitle,
  revenue,
  directCost,
  fieldMargin,
  settlement,
  settlementLabel,
  retainedMargin,
  note,
  tone,
}: {
  title: string;
  subtitle: string;
  revenue: number;
  directCost: number;
  fieldMargin: number;
  settlement: number;
  settlementLabel: string;
  retainedMargin: number;
  note: string;
  tone: "window" | "interior";
}) {
  const wrap = tone === "window" ? "border-sky-200 bg-sky-50" : "border-violet-200 bg-violet-50";
  const accent = tone === "window" ? "text-sky-800" : "text-violet-800";
  return (
    <article className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.14em] ${accent}`}>{title}</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">현장 수익 → 회사귀속</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700">
          현장마진율 {percent(fieldMargin, revenue)}
        </span>
      </div>
      <div className="mt-5 space-y-2">
        <BridgeStep label="매출" value={revenue} />
        <BridgeMinus label="현장 직접원가" value={directCost} />
        <BridgeResult label="현장 기여마진" value={fieldMargin} />
        <BridgeMinus label={settlementLabel} value={settlement} />
        <BridgeResult label="정산 후 회사귀속마진" value={retainedMargin} strong />
      </div>
      <div className="mt-4 rounded-xl border border-white/80 bg-white/75 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
        {note}
      </div>
    </article>
  );
}

function BridgeStep({ label, value }: { label: string; value: number }) {
  return <RowBox label={label} value={compactMoney(value)} />;
}
function BridgeMinus({ label, value }: { label: string; value: number }) {
  return <RowBox label={`− ${label}`} value={compactMoney(value)} muted />;
}
function BridgeResult({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <RowBox label={`= ${label}`} value={compactMoney(value)} strong={strong} />;
}
function RowBox({ label, value, muted = false, strong = false }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${strong ? "border-emerald-200 bg-emerald-50" : "border-white bg-white/80"}`}>
      <span className={muted ? "text-sm font-bold text-slate-500" : "text-sm font-black text-slate-700"}>{label}</span>
      <span className={strong ? "text-base font-black text-emerald-800" : "text-base font-black text-slate-950"}>{value}</span>
    </div>
  );
}

function PnlCard({ title, revenue, cogs, grossProfit, sga, operatingProfit }: { title: string; revenue: number; cogs: number; grossProfit: number; sga: number; operatingProfit: number }) {
  return (
    <div className="bg-white p-5">
      <p className="text-xs font-black text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{compactMoney(revenue)}</p>
      <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
        <Row label="내부 직접원가" value={compactMoney(cogs)} />
        <Row label="매출총이익" value={`${compactMoney(grossProfit)} · ${percent(grossProfit, revenue)}`} />
        <Row label="사업부 판관비" value={compactMoney(sga)} />
        <Row label="영업손익" value={compactMoney(operatingProfit)} strong />
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={strong ? "font-black text-slate-950" : "font-black text-slate-700"}>{value}</span>
    </div>
  );
}

function Kpi({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4" : "rounded-2xl border border-slate-200 bg-slate-50 p-4"}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={emphasis ? "mt-1 text-xl font-black text-emerald-800" : "mt-1 text-xl font-black text-slate-950"}>{value}</p>
    </div>
  );
}
