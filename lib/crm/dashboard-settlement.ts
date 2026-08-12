import {
  getSettlementAccess,
  listSettlementSummaries2026,
} from "@/lib/crm/settlements";

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
};

export async function getDashboardSettlementSummary(): Promise<DashboardSettlementSummary> {
  const access = await getSettlementAccess();
  const rows = await listSettlementSummaries2026();

  // 대시보드 공식 실적에는 작성중/취소 건을 제외합니다.
  const officialRows = rows.filter(
    (row) => row.status === "confirmed" || row.status === "paid",
  );

  const paidRows = officialRows.filter((row) => row.status === "paid");
  const latestPayoutDate = paidRows
    .map((row) => row.payout_date)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    isFinanceAdmin: access.isFinanceAdmin,
    scopeLabel: access.isFinanceAdmin ? "회사 전체" : "내 정산",
    revenueAmount: officialRows.reduce(
      (sum, row) => sum + Number(row.revenue_amount ?? 0),
      0,
    ),
    costAmount: officialRows.reduce(
      (sum, row) => sum + Number(row.cost_amount ?? 0),
      0,
    ),
    marginAmount: officialRows.reduce(
      (sum, row) => sum + Number(row.margin_amount ?? 0),
      0,
    ),
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
    windowSalesCutoffLabel: "2026년 7월까지",
  };
}
