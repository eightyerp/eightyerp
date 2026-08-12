import { createClient } from "@/lib/supabase-server";
import { getSettlementAccess } from "@/lib/crm/settlements";

export type WindowYoYSummary = {
  currentYear: number;
  currentThroughMonth: number;
  currentRevenue: number;
  currentCost: number;
  currentMargin: number;
  priorYear: number;
  priorSamePeriodRevenue: number;
  priorSamePeriodCost: number;
  priorSamePeriodMargin: number;
  priorFullYearRevenue: number;
  priorFullYearCost: number;
  priorFullYearMargin: number;
};

type Row = {
  sales_year: number;
  sales_month: number;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
};

export async function getWindowYoYSummary(): Promise<WindowYoYSummary | null> {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_performance_monthly")
    .select("sales_year, sales_month, revenue_amount, cost_amount, margin_amount")
    .eq("company_id", access.companyId)
    .eq("business_unit", "window")
    .in("sales_year", [2025, 2026])
    .order("sales_year", { ascending: true })
    .order("sales_month", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const currentRows = rows.filter((row) => row.sales_year === 2026);
  const priorRows = rows.filter((row) => row.sales_year === 2025);
  if (currentRows.length === 0 || priorRows.length === 0) return null;

  const currentThroughMonth = Math.max(...currentRows.map((row) => Number(row.sales_month)));
  const sum = (items: Row[]) => items.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenue_amount ?? 0),
      cost: acc.cost + Number(row.cost_amount ?? 0),
      margin: acc.margin + Number(row.margin_amount ?? 0),
    }),
    { revenue: 0, cost: 0, margin: 0 },
  );

  const current = sum(currentRows.filter((row) => row.sales_month <= currentThroughMonth));
  const priorSame = sum(priorRows.filter((row) => row.sales_month <= currentThroughMonth));
  const priorFull = sum(priorRows);

  return {
    currentYear: 2026,
    currentThroughMonth,
    currentRevenue: current.revenue,
    currentCost: current.cost,
    currentMargin: current.margin,
    priorYear: 2025,
    priorSamePeriodRevenue: priorSame.revenue,
    priorSamePeriodCost: priorSame.cost,
    priorSamePeriodMargin: priorSame.margin,
    priorFullYearRevenue: priorFull.revenue,
    priorFullYearCost: priorFull.cost,
    priorFullYearMargin: priorFull.margin,
  };
}
