import { createClient } from "@/lib/supabase-server";
import { getSettlementAccess } from "@/lib/crm/settlements";

export type CompanyMonthlyPnlRow = {
  id: string;
  year: number;
  month: number;
  windowRevenue: number;
  windowCogs: number;
  windowGrossProfit: number;
  windowSgaExpense: number;
  windowOperatingProfit: number;
  interiorRevenue: number;
  interiorCogs: number;
  interiorGrossProfit: number;
  interiorSgaExpense: number;
  interiorOperatingProfit: number;
  commonSgaExpense: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  sgaExpense: number;
  operatingProfit: number;
  homeShoppingIncentive: number;
  salesIncentive: number;
  otherIncome: number;
  netProfit: number;
  sourceType: "erp" | "manual" | "excel_import";
  sourceName: string | null;
  sourceCutoffDate: string | null;
};

export type CompanyPnlSummary = {
  year: number;
  latestMonth: number | null;
  sourceCutoffDate: string | null;
  rows: CompanyMonthlyPnlRow[];
  windowRevenue: number;
  windowCogs: number;
  windowGrossProfit: number;
  windowSgaExpense: number;
  windowOperatingProfit: number;
  interiorRevenue: number;
  interiorCogs: number;
  interiorGrossProfit: number;
  interiorSgaExpense: number;
  interiorOperatingProfit: number;
  commonSgaExpense: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  sgaExpense: number;
  operatingProfit: number;
  otherIncome: number;
  netProfit: number;
};

type DbRow = {
  id: string;
  pnl_year: number;
  pnl_month: number;
  window_revenue: number;
  window_cogs: number;
  window_gross_profit: number;
  window_sga_expense: number;
  window_operating_profit: number;
  interior_revenue: number;
  interior_cogs: number;
  interior_gross_profit: number;
  interior_sga_expense: number;
  interior_operating_profit: number;
  common_sga_expense: number;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  sga_expense: number;
  operating_profit: number;
  home_shopping_incentive: number;
  sales_incentive: number;
  other_income: number;
  net_profit: number;
  source_type: "erp" | "manual" | "excel_import";
  source_name: string | null;
  source_cutoff_date: string | null;
};

export async function getCompanyMonthlyPnl(
  year = 2026,
): Promise<CompanyPnlSummary | null> {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_monthly_pnl_effective")
    .select(
      "id, pnl_year, pnl_month, window_revenue, window_cogs, window_gross_profit, window_sga_expense, window_operating_profit, interior_revenue, interior_cogs, interior_gross_profit, interior_sga_expense, interior_operating_profit, common_sga_expense, total_revenue, total_cogs, gross_profit, sga_expense, operating_profit, home_shopping_incentive, sales_incentive, other_income, net_profit, source_type, source_name, source_cutoff_date",
    )
    .eq("company_id", access.companyId)
    .eq("pnl_year", year)
    .order("pnl_month", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as DbRow[]).map((row) => ({
    id: row.id,
    year: Number(row.pnl_year),
    month: Number(row.pnl_month),
    windowRevenue: Number(row.window_revenue ?? 0),
    windowCogs: Number(row.window_cogs ?? 0),
    windowGrossProfit: Number(row.window_gross_profit ?? 0),
    windowSgaExpense: Number(row.window_sga_expense ?? 0),
    windowOperatingProfit: Number(row.window_operating_profit ?? 0),
    interiorRevenue: Number(row.interior_revenue ?? 0),
    interiorCogs: Number(row.interior_cogs ?? 0),
    interiorGrossProfit: Number(row.interior_gross_profit ?? 0),
    interiorSgaExpense: Number(row.interior_sga_expense ?? 0),
    interiorOperatingProfit: Number(row.interior_operating_profit ?? 0),
    commonSgaExpense: Number(row.common_sga_expense ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    totalCogs: Number(row.total_cogs ?? 0),
    grossProfit: Number(row.gross_profit ?? 0),
    sgaExpense: Number(row.sga_expense ?? 0),
    operatingProfit: Number(row.operating_profit ?? 0),
    homeShoppingIncentive: Number(row.home_shopping_incentive ?? 0),
    salesIncentive: Number(row.sales_incentive ?? 0),
    otherIncome: Number(row.other_income ?? 0),
    netProfit: Number(row.net_profit ?? 0),
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceCutoffDate: row.source_cutoff_date,
  }));

  if (rows.length === 0) return null;

  const total = <K extends keyof CompanyMonthlyPnlRow>(key: K) =>
    rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);

  const latestMonth =
    rows.map((row) => row.month).sort((a, b) => b - a)[0] ?? null;
  const sourceCutoffDate =
    rows
      .map((row) => row.sourceCutoffDate)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    year,
    latestMonth,
    sourceCutoffDate,
    rows,
    windowRevenue: total("windowRevenue"),
    windowCogs: total("windowCogs"),
    windowGrossProfit: total("windowGrossProfit"),
    windowSgaExpense: total("windowSgaExpense"),
    windowOperatingProfit: total("windowOperatingProfit"),
    interiorRevenue: total("interiorRevenue"),
    interiorCogs: total("interiorCogs"),
    interiorGrossProfit: total("interiorGrossProfit"),
    interiorSgaExpense: total("interiorSgaExpense"),
    interiorOperatingProfit: total("interiorOperatingProfit"),
    commonSgaExpense: total("commonSgaExpense"),
    totalRevenue: total("totalRevenue"),
    totalCogs: total("totalCogs"),
    grossProfit: total("grossProfit"),
    sgaExpense: total("sgaExpense"),
    operatingProfit: total("operatingProfit"),
    otherIncome: total("otherIncome"),
    netProfit: total("netProfit"),
  };
}
