import { createClient } from "@/lib/supabase-server";
import {
  getSettlementAccess,
  listSettlementSummaries2026,
} from "@/lib/crm/settlements";

export type DashboardEmployeeSales = {
  employeeId: string | null;
  label: string;
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
  salesDataAvailable: boolean;
  employeeSales: DashboardEmployeeSales[];
};

type SalesPerformanceRow = {
  employee_id: string | null;
  owner_label: string;
  business_unit: string;
  sales_month: number;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
  source_cutoff_date: string | null;
};

export async function getDashboardSettlementSummary(): Promise<DashboardSettlementSummary> {
  const access = await getSettlementAccess();
  const [settlementRows, salesResult] = await Promise.all([
    listSettlementSummaries2026(),
    (async () => {
      const supabase = await createClient();
      return supabase
        .from("sales_performance_2026")
        .select(
          "employee_id, owner_label, business_unit, sales_month, revenue_amount, cost_amount, margin_amount, source_cutoff_date",
        )
        .order("sales_month", { ascending: true });
    })(),
  ]);

  // 대시보드 공식 정산에는 작성중/취소 건을 제외합니다.
  const officialRows = settlementRows.filter(
    (row) => row.status === "confirmed" || row.status === "paid",
  );
  const paidRows = officialRows.filter((row) => row.status === "paid");

  const salesRows = salesResult.error
    ? []
    : ((salesResult.data ?? []) as SalesPerformanceRow[]);
  const salesEmployeeIds = new Set(
    salesRows
      .map((row) => row.employee_id)
      .filter((value): value is string => Boolean(value)),
  );

  // 직원별 매출 실적원장이 있으면 그것을 매출/원가/마진의 기준으로 사용합니다.
  // 아직 실적원장이 없는 직원(주로 인테리어 과거 이관)은 정산원장의 매출/원가를 임시 보완값으로 사용합니다.
  // 같은 직원에 두 원장이 모두 존재하는 경우 중복집계를 막기 위해 매출 실적원장을 우선합니다.
  const settlementFallbackRows = officialRows.filter(
    (row) => !salesEmployeeIds.has(row.employee_id),
  );

  const salesRevenue = salesRows.reduce(
    (sum, row) => sum + Number(row.revenue_amount ?? 0),
    0,
  );
  const salesCost = salesRows.reduce(
    (sum, row) => sum + Number(row.cost_amount ?? 0),
    0,
  );
  const salesMargin = salesRows.reduce(
    (sum, row) => sum + Number(row.margin_amount ?? 0),
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
  for (const row of salesRows) {
    const key = row.employee_id ?? `shared:${row.owner_label}`;
    const current = employeeMap.get(key) ?? {
      employeeId: row.employee_id,
      label: row.owner_label,
      revenueAmount: 0,
      costAmount: 0,
      marginAmount: 0,
    };
    current.revenueAmount += Number(row.revenue_amount ?? 0);
    current.costAmount += Number(row.cost_amount ?? 0);
    current.marginAmount += Number(row.margin_amount ?? 0);
    employeeMap.set(key, current);
  }

  const latestPayoutDate = paidRows
    .map((row) => row.payout_date)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  const latestWindowCutoff = salesRows
    .filter((row) => row.business_unit === "window")
    .map((row) => row.source_cutoff_date)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];

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
    salesDataAvailable: salesRows.length > 0,
    employeeSales: [...employeeMap.values()].sort(
      (a, b) => b.revenueAmount - a.revenueAmount,
    ),
  };
}
