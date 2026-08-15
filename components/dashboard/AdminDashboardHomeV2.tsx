import Link from "next/link";
import { updateCompanySalesTargetAction } from "@/app/actions/company-sales-target";
import ManagementAiPanel from "@/components/dashboard/ManagementAiPanel";
import MonthlyPnlOverviewV2 from "@/components/dashboard/MonthlyPnlOverviewV2";
import type { CompanyPnlSummary } from "@/lib/crm/company-pnl";
import type { CompanySalesTarget } from "@/lib/crm/company-sales-target";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import { buildRuleBasedManagementAnalysis } from "@/lib/crm/management-analysis";
import {
  DEFAULT_COMPANY_ANNUAL_SALES_TARGET,
  DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET,
} from "@/lib/crm/sales-goals";
import type { SettlementEmployeeOption } from "@/lib/crm/settlements";

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

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const SECTIONS = [
  {
    href: "/dashboard/sales",
    label: "매출·경영 분석",
    description: "창호·인테리어 월별 매출, 전년비와 직원 점유율을 봅니다.",
  },
  {
    href: "/dashboard/finance",
    label: "손익·비용 분석",
    description: "사업부 원가, 공통 판관비, 영업손익과 최종순이익을 봅니다.",
  },
  {
    href: "/dashboard/customers",
    label: "고객·영업 분석",
    description: "상담·실측·견적·계약과 미처리 고객 흐름을 봅니다.",
  },
  {
    href: "/dashboard/marketing",
    label: "마케팅 분석",
    description: "유입경로, 전환율과 광고효율을 연결합니다.",
  },
] as const;

type UnitTotals = {
  revenue: number;
  cost: number;
  margin: number;
};

type EmployeeGoalRow = {
  employeeId: string;
  label: string;
  businessUnit: "window" | "interior";
  revenueAmount: number;
  marginAmount: number;
};

function getTeamName(employee: SettlementEmployeeOption) {
  if (Array.isArray(employee.team)) return employee.team[0]?.name ?? null;
  return employee.team?.name ?? null;
}

function sumUnit(
  rows: DashboardSettlementSummary["employeeSales"],
): UnitTotals {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenueAmount || 0),
      cost: acc.cost + Number(row.costAmount || 0),
      margin: acc.margin + Number(row.marginAmount || 0),
    }),
    { revenue: 0, cost: 0, margin: 0 },
  );
}

export default function AdminDashboardHomeV2({
  summary,
  companyTarget,
  companyPnl,
  salesEmployees,
}: {
  summary: DashboardSettlementSummary;
  companyTarget: CompanySalesTarget | null;
  companyPnl: CompanyPnlSummary | null;
  salesEmployees: SettlementEmployeeOption[];
}) {
  const targetYear = companyTarget?.targetYear ?? 2026;
  const targetAmount =
    companyTarget?.targetAmount ?? DEFAULT_COMPANY_ANNUAL_SALES_TARGET;
  const achievedRate =
    targetAmount > 0 ? (summary.revenueAmount / targetAmount) * 100 : 0;
  const remainingAmount = Math.max(0, targetAmount - summary.revenueAmount);
  const now = new Date();
  const remainingMonths =
    targetYear === now.getFullYear()
      ? Math.max(1, 12 - now.getMonth())
      : targetYear > now.getFullYear()
        ? 12
        : 1;
  const requiredMonthly = Math.ceil(remainingAmount / remainingMonths);

  const window = sumUnit(
    summary.employeeSales.filter(
      (row) => row.businessUnit === "window" || row.businessUnit === "shared",
    ),
  );
  const interior = sumUnit(
    summary.employeeSales.filter((row) => row.businessUnit === "interior"),
  );
  const total: UnitTotals = {
    revenue: summary.revenueAmount,
    cost: summary.costAmount,
    margin: summary.marginAmount,
  };

  const employeeGoalMap = new Map<string, EmployeeGoalRow>();
  for (const employee of salesEmployees) {
    const teamName = getTeamName(employee);
    if (teamName !== "창호" && teamName !== "인테리어") continue;
    employeeGoalMap.set(employee.id, {
      employeeId: employee.id,
      label: employee.name,
      businessUnit: teamName === "인테리어" ? "interior" : "window",
      revenueAmount: 0,
      marginAmount: 0,
    });
  }

  if (employeeGoalMap.size === 0) {
    for (const row of summary.employeeSales) {
      if (!row.employeeId || row.businessUnit === "shared") continue;
      employeeGoalMap.set(row.employeeId, {
        employeeId: row.employeeId,
        label: row.label,
        businessUnit: row.businessUnit,
        revenueAmount: 0,
        marginAmount: 0,
      });
    }
  }

  for (const row of summary.employeeSales) {
    if (!row.employeeId) continue;
    const current = employeeGoalMap.get(row.employeeId);
    if (!current) continue;
    current.revenueAmount += Number(row.revenueAmount || 0);
    current.marginAmount += Number(row.marginAmount || 0);
  }

  const employeeGoalRows = [...employeeGoalMap.values()].sort(
    (a, b) =>
      b.revenueAmount - a.revenueAmount ||
      a.label.localeCompare(b.label, "ko"),
  );

  const managementAnalysis = buildRuleBasedManagementAnalysis({
    summary,
    pnl: companyPnl,
    annualTarget: targetAmount,
  });

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">
              EIGHTY BUSINESS CONTROL
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              2026 경영 대시보드
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              매출·직접원가·마진은 사업부별로, 판매관리비는 회사 공통비로 구분합니다.
            </p>
          </div>
          <div className="min-w-0 lg:min-w-[390px]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-400">회사 목표</p>
                <p className="mt-1 text-2xl font-black">{compactMoney(targetAmount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-slate-400">달성률</p>
                <p className="mt-1 text-3xl font-black text-emerald-300">
                  {achievedRate.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${Math.max(0, Math.min(100, achievedRate))}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs font-bold text-slate-400">
              남은 목표 {compactMoney(remainingAmount)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <BusinessSummaryCard
          title="회사 전체"
          subtitle="영업실적 원장 기준"
          totals={total}
          tone="total"
        />
        <BusinessSummaryCard
          title="창호"
          subtitle={`실적 ${summary.windowSalesCutoffLabel}`}
          totals={window}
          tone="window"
        />
        <BusinessSummaryCard
          title="인테리어"
          subtitle={`실적 ${summary.interiorSalesPeriodLabel}`}
          totals={interior}
          tone="interior"
        />
      </section>

      <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
              SALES TARGET CONTROL
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              100억 목표 운영계획
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              현재 {compactMoney(summary.revenueAmount)} · 남은 {remainingMonths}개월 월평균 {compactMoney(requiredMonthly)} 필요
            </p>
          </div>
          <form
            action={updateCompanySalesTargetAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="targetYear" value={targetYear} />
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-600">
                목표액(억원)
              </span>
              <input
                type="number"
                name="targetEok"
                min="1"
                step="1"
                defaultValue={Math.round(targetAmount / 100_000_000)}
                className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm font-black text-slate-950 outline-none focus:border-emerald-500"
              />
            </label>
            <button
              type="submit"
              className="min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
            >
              목표 저장
            </button>
          </form>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <TargetMetric label="현재 달성률" value={`${achievedRate.toFixed(1)}%`} />
          <TargetMetric label="남은 목표" value={compactMoney(remainingAmount)} />
          <TargetMetric
            label="남은 기간 월평균"
            value={compactMoney(requiredMonthly)}
          />
        </div>
      </section>

      <ManagementAiPanel initial={managementAnalysis} />

      {companyPnl ? (
        <MonthlyPnlOverviewV2
          pnl={companyPnl}
          annualTarget={targetAmount}
          officialSalesRevenue={summary.revenueAmount}
          mode="home"
        />
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
              EMPLOYEE TARGET PROGRESS
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              직원별 8억원 목표 달성률
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              공동매출은 제외하고 활성 창호·인테리어 직원 전체를 표시합니다.
            </p>
          </div>
          <Link
            href="/dashboard/sales"
            className="text-sm font-black text-indigo-700 hover:text-indigo-900"
          >
            상세 매출분석 →
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {employeeGoalRows.map((row) => (
            <EmployeeGoalCard key={row.employeeId} row={row} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-950">
                {section.label}
              </h2>
              <span className="text-lg font-black text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-900">
                →
              </span>
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

function BusinessSummaryCard({
  title,
  subtitle,
  totals,
  tone,
}: {
  title: string;
  subtitle: string;
  totals: UnitTotals;
  tone: "total" | "window" | "interior";
}) {
  const className =
    tone === "window"
      ? "border-sky-200 bg-sky-50/70"
      : tone === "interior"
        ? "border-violet-200 bg-violet-50/70"
        : "border-slate-300 bg-white";
  const accent =
    tone === "window"
      ? "text-sky-800"
      : tone === "interior"
        ? "text-violet-800"
        : "text-slate-950";
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">{subtitle}</p>
        </div>
        <span className={`text-sm font-black ${accent}`}>
          마진율 {rate(totals.margin, totals.revenue)}
        </span>
      </div>
      <p className={`mt-4 text-3xl font-black tracking-tight ${accent}`}>
        {compactMoney(totals.revenue)}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500">누적 매출</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <SummaryMiniMetric label="직접원가" value={compactMoney(totals.cost)} />
        <SummaryMiniMetric label="마진" value={compactMoney(totals.margin)} />
        <SummaryMiniMetric label="원가율" value={rate(totals.cost, totals.revenue)} />
        <SummaryMiniMetric label="매출비중" value="-" />
      </div>
    </div>
  );
}

function EmployeeGoalCard({ row }: { row: EmployeeGoalRow }) {
  const achievement =
    (row.revenueAmount / DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET) * 100;
  const remaining = Math.max(
    0,
    DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET - row.revenueAmount,
  );
  const isInterior = row.businessUnit === "interior";
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-950">{row.label}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                isInterior
                  ? "bg-violet-100 text-violet-800"
                  : "bg-sky-100 text-sky-800"
              }`}
            >
              {isInterior ? "인테리어" : "창호"}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            매출 {compactMoney(row.revenueAmount)} · 마진 {compactMoney(row.marginAmount)}
          </p>
        </div>
        <p className="text-xl font-black text-slate-950">
          {achievement.toFixed(1)}%
        </p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            achievement >= 100
              ? "bg-emerald-500"
              : isInterior
                ? "bg-violet-500"
                : "bg-sky-500"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, achievement))}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
        <span>목표 8억</span>
        <span>
          {remaining > 0 ? `남은 ${compactMoney(remaining)}` : "목표 달성"}
        </span>
      </div>
    </div>
  );
}

function SummaryMiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white/80 px-3 py-3">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black text-slate-950">{value}</p>
    </div>
  );
}

function TargetMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-emerald-50 px-4 py-3">
      <p className="text-xs font-black text-emerald-800">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
