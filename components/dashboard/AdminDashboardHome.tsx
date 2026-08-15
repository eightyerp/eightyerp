import Link from "next/link";
import { updateCompanySalesTargetAction } from "@/app/actions/company-sales-target";
import type { CompanySalesTarget } from "@/lib/crm/company-sales-target";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import {
  DEFAULT_COMPANY_ANNUAL_SALES_TARGET,
  DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET,
} from "@/lib/crm/sales-goals";

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

const SECTIONS = [
  {
    href: "/dashboard/sales",
    label: "매출·경영 분석",
    description: "창호·인테리어 매출, 월별 추이, 전년비, 직원 점유율, 마진을 봅니다.",
  },
  {
    href: "/dashboard/customers",
    label: "고객·영업 분석",
    description: "오늘 할 일, 상담·실측·견적·계약, 미처리 고객 흐름을 봅니다.",
  },
  {
    href: "/dashboard/marketing",
    label: "마케팅 분석",
    description: "유입경로, 문의→견적→계약 전환과 광고효율을 연결할 전용 화면입니다.",
  },
] as const;

type EmployeeGoalRow = {
  employeeId: string;
  label: string;
  businessUnits: Set<"window" | "interior" | "shared">;
  revenueAmount: number;
  marginAmount: number;
};

function employeeUnitLabel(units: Set<"window" | "interior" | "shared">) {
  if (units.size > 1) return "복수사업부";
  const unit = [...units][0];
  if (unit === "interior") return "인테리어";
  if (unit === "window") return "창호";
  return "공동";
}

export default function AdminDashboardHome({
  summary,
  companyTarget,
}: {
  summary: DashboardSettlementSummary;
  companyTarget: CompanySalesTarget | null;
}) {
  const targetYear = companyTarget?.targetYear ?? 2026;
  const targetAmount =
    companyTarget?.targetAmount ?? DEFAULT_COMPANY_ANNUAL_SALES_TARGET;
  const achievedRate = targetAmount > 0
    ? (summary.revenueAmount / targetAmount) * 100
    : 0;
  const progressWidth = Math.max(0, Math.min(100, achievedRate));
  const remainingAmount = Math.max(0, targetAmount - summary.revenueAmount);
  const now = new Date();
  const remainingMonths =
    targetYear === now.getFullYear()
      ? Math.max(1, 12 - now.getMonth())
      : targetYear > now.getFullYear()
        ? 12
        : 1;
  const requiredMonthly = Math.ceil(remainingAmount / remainingMonths);

  const employeeGoalMap = new Map<string, EmployeeGoalRow>();
  for (const row of summary.employeeSales) {
    if (!row.employeeId) continue;
    const current = employeeGoalMap.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      label: row.label,
      businessUnits: new Set<"window" | "interior" | "shared">(),
      revenueAmount: 0,
      marginAmount: 0,
    };
    current.businessUnits.add(row.businessUnit);
    current.revenueAmount += Number(row.revenueAmount || 0);
    current.marginAmount += Number(row.marginAmount || 0);
    employeeGoalMap.set(row.employeeId, current);
  }
  const employeeGoalRows = [...employeeGoalMap.values()].sort(
    (a, b) => b.revenueAmount - a.revenueAmount,
  );

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">
            ADMIN BUSINESS HOME
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            2026 경영 요약
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            상세 분석은 목적별 대시보드로 분리했습니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 lg:grid-cols-4">
          <DarkMetric label="누적 매출" value={compactMoney(summary.revenueAmount)} />
          <DarkMetric label="매출원가" value={compactMoney(summary.costAmount)} />
          <DarkMetric label="마진" value={compactMoney(summary.marginAmount)} />
          <DarkMetric label="마진율" value={marginRate(summary.revenueAmount, summary.marginAmount)} />
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
              COMPANY SALES TARGET
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <h2 className="text-2xl font-black text-slate-950">
                {targetYear} 회사 목표 {compactMoney(targetAmount)}
              </h2>
              <span className="pb-0.5 text-sm font-black text-emerald-700">
                {achievedRate.toFixed(1)}% 달성
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              현재 {compactMoney(summary.revenueAmount)} · 남은 목표 {compactMoney(remainingAmount)}
            </p>
          </div>

          <form action={updateCompanySalesTargetAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="targetYear" value={targetYear} />
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-600">목표액(억원)</span>
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

        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <TargetMetric label="달성률" value={`${achievedRate.toFixed(1)}%`} />
          <TargetMetric label="남은 목표" value={compactMoney(remainingAmount)} />
          <TargetMetric
            label={`남은 ${remainingMonths}개월 월평균 필요매출`}
            value={compactMoney(requiredMonthly)}
          />
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">
          실적은 현재 입력된 수기·이관 데이터 기준입니다. 향후 ERP 자동실적이 같은 직원·월에 생성되면 자동실적을 우선 집계합니다.
        </p>
      </section>

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
              공동매출은 제외하고 직원 ID별 공식 실적만 합산합니다.
            </p>
          </div>
          <Link
            href="/dashboard/sales"
            className="text-sm font-black text-indigo-700 hover:text-indigo-900"
          >
            상세 매출분석 →
          </Link>
        </div>

        {employeeGoalRows.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {employeeGoalRows.map((row) => (
              <EmployeeGoalCard key={row.employeeId} row={row} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            직원별 매출실적이 아직 입력되지 않았습니다.
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-950">{section.label}</h2>
              <span className="text-lg font-black text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-900">→</span>
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

function EmployeeGoalCard({ row }: { row: EmployeeGoalRow }) {
  const achievement =
    (row.revenueAmount / DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET) * 100;
  const progressWidth = Math.max(0, Math.min(100, achievement));
  const remaining = Math.max(
    0,
    DEFAULT_EMPLOYEE_ANNUAL_SALES_TARGET - row.revenueAmount,
  );
  const unitLabel = employeeUnitLabel(row.businessUnits);
  const isInterior = unitLabel === "인테리어";

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
              {unitLabel}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            현재 매출 {compactMoney(row.revenueAmount)} · 마진 {compactMoney(row.marginAmount)}
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
          style={{ width: `${progressWidth}%` }}
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

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950 px-5 py-4">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
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
