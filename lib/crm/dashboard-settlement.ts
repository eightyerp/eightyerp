import { createClient } from "@/lib/supabase-server";
import {
  getSettlementAccess,
  listSettlementSummaries2026,
} from "@/lib/crm/settlements";

export type DashboardEmployeeSales = {
  employeeId: string | null;
  label: string;
  businessUnit: "window" | "interior" | "shared";
  revenueAmount: number;
  costAmount: number;
  marginAmount: number;
};

export type DashboardSettlementSummary = {
  isFinanceAdmin: boolean;
  scopeLabel: string;
  revenueAmount: number;
  costAmount: number;
  marginAmount: number;
  baseSettlementAmount: number;
  additionalIncentiveAmount: number;
  deductionAmount: number;
  paidAmount: number;
  latestPayoutDate: string | null;
  settlementCount: number;
  windowSalesCutoffLabel: string;
  interiorSalesPeriodLabel: string;
  interiorSalesIsPartial: boolean;
  salesDataAvailable: boolean;
  employeeSales: DashboardEmployeeSales[];
};

type MonthlySalesPerformanceRow = {
  employee_id: string | null;
  owner_label: string;
  business_unit: "window" | "interior" | "shared";
  sales_year: number;
  sales_month: number;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
  source_cutoff_date: string | null;
};

type PeriodSalesPerformanceRow = {
  employee_id: string | null;
  owner_label: string;
  business_unit: "window" | "interior" | "shared";
  period_start: string;
  period_end: string;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
  source_type: string;
  source_cutoff_date: string | null;
};

type EffectivePerformanceRow = {
  employeeId: string | null;
  label: string;
  businessUnit: "window" | "interior" | "shared";
  periodStart: string;
  periodEnd: string;
  revenueAmount: number;
  costAmount: number;
  marginAmount: number;
  sourceCutoffDate: string | null;
  sourceKind: "monthly" | "period";
  sourceType?: string;
};

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function identityKey(row: {
  employeeId: string | null;
  label: string;
  businessUnit: string;
}) {
  return `${row.businessUnit}:${row.employeeId ?? `shared:${row.label}`}`;
}

function overlaps(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function formatPeriodLabel(start: string | null, end: string | null) {
  if (!start || !end) return "미입력";
  const [startYear, startMonth] = start.split("-");
  const [endYear, endMonth] = end.split("-");
  return startYear === endYear
    ? `${startYear}.${startMonth}~${endMonth}`
    : `${startYear}.${startMonth}~${endYear}.${endMonth}`;
}

export async function getDashboardSettlementSummary(): Promise<DashboardSettlementSummary> {
  const access = await getSettlementAccess();
  const [settlementRows, monthlyResult, periodResult] = await Promise.all([
    listSettlementSummaries2026(),
    (async () => {
      const supabase = await createClient();
      return supabase
        .from("sales_performance_2026")
        .select(
          "employee_id, owner_label, business_unit, sales_year, sales_month, revenue_amount, cost_amount, margin_amount, source_cutoff_date",
        )
        .order("sales_month", { ascending: true });
    })(),
    (async () => {
      const supabase = await createClient();
      return supabase
        .from("sales_performance_period_totals")
        .select(
          "employee_id, owner_label, business_unit, period_start, period_end, revenue_amount, cost_amount, margin_amount, source_type, source_cutoff_date",
        )
        .eq("is_active", true)
        .lte("period_start", "2026-12-31")
        .gte("period_end", "2026-01-01")
        .order("period_end", { ascending: true });
    })(),
  ]);

  // 대시보드 공식 정산에는 작성중/취소 건을 제외합니다.
  const officialRows = settlementRows.filter(
    (row) => row.status === "confirmed" || row.status === "paid",
  );
  const paidRows = officialRows.filter((row) => row.status === "paid");

  const monthlyRows = monthlyResult.error
    ? []
    : ((monthlyResult.data ?? []) as MonthlySalesPerformanceRow[]);
  const periodRows = periodResult.error
    ? []
    : ((periodResult.data ?? []) as PeriodSalesPerformanceRow[]);

  const normalizedPeriods: EffectivePerformanceRow[] = periodRows.map((row) => ({
    employeeId: row.employee_id,
    label: row.owner_label,
    businessUnit: row.business_unit,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    revenueAmount: Number(row.revenue_amount ?? 0),
    costAmount: Number(row.cost_amount ?? 0),
    marginAmount: Number(row.margin_amount ?? 0),
    sourceCutoffDate: row.source_cutoff_date,
    sourceKind: "period",
    sourceType: row.source_type,
  }));

  const normalizedMonthly: EffectivePerformanceRow[] = monthlyRows.map((row) => ({
    employeeId: row.employee_id,
    label: row.owner_label,
    businessUnit: row.business_unit,
    periodStart: monthStart(row.sales_year, row.sales_month),
    periodEnd: monthEnd(row.sales_year, row.sales_month),
    revenueAmount: Number(row.revenue_amount ?? 0),
    costAmount: Number(row.cost_amount ?? 0),
    marginAmount: Number(row.margin_amount ?? 0),
    sourceCutoffDate: row.source_cutoff_date,
    sourceKind: "monthly",
  }));

  // 기간누계가 있는 구간에는 기간누계를 우선합니다. 이후 월별 원본을 추가해도
  // 누계 구간과 겹치는 월을 동시에 더하지 않아 이중집계를 막습니다.
  const nonOverlappingMonthly = normalizedMonthly.filter((monthly) => {
    const key = identityKey(monthly);
    return !normalizedPeriods.some(
      (period) =>
        identityKey(period) === key &&
        overlaps(
          monthly.periodStart,
          monthly.periodEnd,
          period.periodStart,
          period.periodEnd,
        ),
    );
  });

  const performanceRows = [...normalizedPeriods, ...nonOverlappingMonthly];
  const performanceEmployeeIds = new Set(
    performanceRows
      .map((row) => row.employeeId)
      .filter((value): value is string => Boolean(value)),
  );

  // 직원별 매출 실적원장이 있으면 그것을 매출/원가/마진의 기준으로 사용합니다.
  // 실적원장이 전혀 없는 직원만 정산원장의 매출/원가를 임시 보완값으로 사용합니다.
  const settlementFallbackRows = officialRows.filter(
    (row) => !performanceEmployeeIds.has(row.employee_id),
  );

  const salesRevenue = performanceRows.reduce(
    (sum, row) => sum + row.revenueAmount,
    0,
  );
  const salesCost = performanceRows.reduce(
    (sum, row) => sum + row.costAmount,
    0,
  );
  const salesMargin = performanceRows.reduce(
    (sum, row) => sum + row.marginAmount,
    0,
  );

  const fallbackRevenue = settlementFallbackRows.reduce(
    (sum, row) => sum + Number(row.revenue_amount ?? 0),
    0,
  );
  const fallbackCost = settlementFallbackRows.reduce(
    (sum, row) => sum + Number(row.cost_amount ?? 0),
    0,
  );
  const fallbackMargin = settlementFallbackRows.reduce(
    (sum, row) => sum + Number(row.margin_amount ?? 0),
    0,
  );

  const employeeMap = new Map<string, DashboardEmployeeSales>();
  for (const row of performanceRows) {
    const key = identityKey(row);
    const current = employeeMap.get(key) ?? {
      employeeId: row.employeeId,
      label: row.label,
      businessUnit: row.businessUnit,
      revenueAmount: 0,
      costAmount: 0,
      marginAmount: 0,
    };
    current.revenueAmount += row.revenueAmount;
    current.costAmount += row.costAmount;
    current.marginAmount += row.marginAmount;
    employeeMap.set(key, current);
  }

  const latestPayoutDate = paidRows
    .map((row) => row.payout_date)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  const windowRows = performanceRows.filter(
    (row) => row.businessUnit === "window",
  );
  const latestWindowCutoff = windowRows
    .map((row) => row.sourceCutoffDate ?? row.periodEnd)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];

  const interiorRows = performanceRows.filter(
    (row) => row.businessUnit === "interior",
  );
  const interiorStart = interiorRows
    .map((row) => row.periodStart)
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
  const interiorEnd = interiorRows
    .map((row) => row.periodEnd)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
  const interiorSalesIsPartial = interiorRows.some(
    (row) => row.sourceKind === "period" && row.sourceType === "derived_summary",
  );

  return {
    isFinanceAdmin: access.isFinanceAdmin,
    scopeLabel: access.isFinanceAdmin ? "회사 전체" : "내 실적",
    revenueAmount: salesRevenue + fallbackRevenue,
    costAmount: salesCost + fallbackCost,
    marginAmount: salesMargin + fallbackMargin,
    baseSettlementAmount: officialRows.reduce(
      (sum, row) => sum + Number(row.base_settlement_amount ?? 0),
      0,
    ),
    additionalIncentiveAmount: officialRows.reduce(
      (sum, row) => sum + Number(row.additional_incentive_amount ?? 0),
      0,
    ),
    deductionAmount: officialRows.reduce(
      (sum, row) => sum + Number(row.deduction_amount ?? 0),
      0,
    ),
    paidAmount: paidRows.reduce(
      (sum, row) => sum + Number(row.paid_amount ?? 0),
      0,
    ),
    latestPayoutDate,
    settlementCount: officialRows.length,
    windowSalesCutoffLabel: latestWindowCutoff
      ? `${latestWindowCutoff.slice(0, 7).replace("-", ".")}까지`
      : "미입력",
    interiorSalesPeriodLabel: formatPeriodLabel(interiorStart, interiorEnd),
    interiorSalesIsPartial,
    salesDataAvailable: performanceRows.length > 0,
    employeeSales: [...employeeMap.values()].sort(
      (a, b) => b.revenueAmount - a.revenueAmount,
    ),
  };
}
