import Link from "next/link";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import { DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET } from "@/lib/crm/sales-goals";

function money(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

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

export default function EmployeeGoalDashboard({
  summary,
}: {
  summary: DashboardSettlementSummary;
}) {
  const ownRows = summary.employeeSales.filter((row) => row.employeeId);
  const revenue = ownRows.reduce(
    (sum, row) => sum + Number(row.revenueAmount || 0),
    0,
  ) || summary.revenueAmount;
  const margin = ownRows.reduce(
    (sum, row) => sum + Number(row.marginAmount || 0),
    0,
  ) || summary.marginAmount;
  const achievement = DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET > 0
    ? (revenue / DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET) * 100
    : 0;
  const progressWidth = Math.min(100, Math.max(0, achievement));
  const remaining = Math.max(
    0,
    DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET - revenue,
  );
  const businessUnit = summary.currentEmployeeBusinessUnit === "interior"
    ? "인테리어"
    : summary.currentEmployeeBusinessUnit === "window"
      ? "창호"
      : "미분류";
  const periodLabel = summary.currentEmployeeBusinessUnit === "interior"
    ? summary.interiorSalesPeriodLabel
    : summary.currentEmployeeBusinessUnit === "window"
      ? summary.windowSalesCutoffLabel
      : "미입력";
  const estimatedPayable = Math.max(
    0,
    summary.estimatedBaseSettlementAmount
      + summary.additionalIncentiveAmount
      - summary.deductionAmount
      - summary.paidAmount,
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-950 px-5 py-5 text-white sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-sky-300">
                MY 2026 TARGET
              </p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-slate-200">
                {businessUnit}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              연간 매출 목표 8억원
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              본인 실적과 정산만 표시됩니다. 실적 입력 기준 {periodLabel}.
            </p>
          </div>
          <Link
            href="/finance/settlements"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-black text-white hover:bg-white/15"
          >
            내 정산 보기
          </Link>
        </div>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black text-slate-400">목표 달성률</p>
              <p className="mt-1 text-4xl font-black tracking-tight text-white">
                {achievement.toFixed(1)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-400">현재 매출</p>
              <p className="mt-1 text-xl font-black text-white">{compactMoney(revenue)}</p>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sky-400 transition-all"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs font-bold text-slate-400">
            <span>0원</span>
            <span>목표 {money(DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-5">
        <Metric label="현재 매출" value={compactMoney(revenue)} sub={money(revenue)} />
        <Metric
          label="남은 목표"
          value={remaining > 0 ? compactMoney(remaining) : "목표 달성"}
          sub={remaining > 0 ? money(remaining) : "8억원 이상 달성"}
        />
        <Metric
          label="내 현장 기여마진"
          value={compactMoney(margin)}
          sub={`기여마진율 ${marginRate(revenue, margin)}`}
        />
        <Metric
          label="잠정 예상 기본정산"
          value={compactMoney(summary.estimatedBaseSettlementAmount)}
          sub={summary.estimatedSettlementBasisLabel ?? "정산기준 미설정"}
          accent
        />
        <Metric
          label="지급완료 정산"
          value={compactMoney(summary.paidAmount)}
          sub={summary.latestPayoutDate ? `최근 ${summary.latestPayoutDate}` : "지급완료 없음"}
        />
      </div>

      <div className="grid grid-cols-4 gap-px border-t border-slate-100 bg-slate-100">
        <SmallMetric label="잠정 기본정산" value={compactMoney(summary.estimatedBaseSettlementAmount)} />
        <SmallMetric label="추가 인센" value={compactMoney(summary.additionalIncentiveAmount)} />
        <SmallMetric label="차감" value={compactMoney(summary.deductionAmount)} />
        <SmallMetric label="잠정 예상 지급액" value={compactMoney(estimatedPayable)} />
      </div>

      <div className="border-t border-amber-200 bg-amber-50 px-5 py-4 text-xs font-semibold leading-5 text-amber-950 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2 py-1 font-black">잠정값</span>
          <span className="rounded-full bg-white px-2 py-1 font-black">2026년 7월 기준</span>
          {summary.estimatedSettlementIsProxy ? (
            <span className="rounded-full bg-white px-2 py-1 font-black text-orange-800">
              실제 계약 연동 전 대체계산
            </span>
          ) : null}
        </div>
        <p className="mt-2">
          잠정 예상 정산금은 현재 입력된 매출·원가를 기준으로 계산한 값이며 실제 지급확정액이 아닙니다. 관리자 원가확정, 승인대기 지출, 사후지출, 추가인센티브와 차감에 따라 변경될 수 있습니다.
        </p>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "bg-emerald-50 px-5 py-4" : "bg-white px-5 py-4"}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={accent ? "mt-1 text-xl font-black text-emerald-800" : "mt-1 text-xl font-black text-slate-950"}>
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 px-4 py-3 text-center">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
