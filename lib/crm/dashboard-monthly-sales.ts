import { createClient } from "@/lib/supabase-server";
import { getSettlementAccess } from "@/lib/crm/settlements";

export type DashboardMonthlySalesPoint = {
  month: number;
  revenue2025: number;
  revenue2026: number | null;
  margin2025: number;
  margin2026: number | null;
};

export type DashboardMonthlySalesAnalytics = {
  isFinanceAdmin: boolean;
  windowMonthly: DashboardMonthlySalesPoint[];
  latest2026Month: number | null;
};

type Row = {
  sales_year: number;
  sales_month: number;
  revenue_amount: number;
  margin_amount: number;
};

export async function getDashboardMonthlySalesAnalytics(): Promise<DashboardMonthlySalesAnalytics | null> {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_performance_monthly")
    .select("sales_year, sales_month, revenue_amount, margin_amount")
    .eq("company_id", access.companyId)
    .eq("business_unit", "window")
    .in("sales_year", [2025, 2026])
    .order("sales_year", { ascending: true })
    .order("sales_month", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const byYearMonth = new Map<string, { revenue: number; margin: number }>();

  for (const row of rows) {
    const key = `${row.sales_year}-${row.sales_month}`;
    const current = byYearMonth.get(key) ?? { revenue: 0, margin: 0 };
    current.revenue += Number(row.revenue_amount ?? 0);
    current.margin += Number(row.margin_amount ?? 0);
    byYearMonth.set(key, current);
  }

  const latest2026Month = rows
    .filter((row) => row.sales_year === 2026)
    .map((row) => row.sales_month)
    .sort((a, b) => b - a)[0] ?? null;

  const windowMonthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const y2025 = byYearMonth.get(`2025-${month}`) ?? { revenue: 0, margin: 0 };
    const y2026 = byYearMonth.get(`2026-${month}`);
    return {
      month,
      revenue2025: y2025.revenue,
      revenue2026: y2026 ? y2026.revenue : null,
      margin2025: y2025.margin,
      margin2026: y2026 ? y2026.margin : null,
    };
  });

  return {
    isFinanceAdmin: true,
    windowMonthly,
    latest2026Month,
  };
}
