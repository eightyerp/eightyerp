import { createClient } from "@/lib/supabase-server";
import { getSettlementAccess } from "@/lib/crm/settlements";

export type CompanySalesTarget = {
  targetYear: number;
  targetAmount: number;
};

export async function getCompanySalesTarget(
  targetYear = 2026,
): Promise<CompanySalesTarget | null> {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_sales_targets")
    .select("target_year, target_amount")
    .eq("company_id", access.companyId)
    .eq("target_year", targetYear)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    targetYear: Number(data.target_year),
    targetAmount: Number(data.target_amount),
  };
}

export async function saveCompanySalesTarget(input: {
  targetYear: number;
  targetAmount: number;
}) {
  const access = await getSettlementAccess();
  if (!access.isFinanceAdmin) {
    throw new Error("관리자만 회사 매출목표를 변경할 수 있습니다.");
  }

  const targetYear = Math.trunc(input.targetYear);
  const targetAmount = Math.trunc(input.targetAmount);
  if (targetYear < 2020 || targetYear > 2100) {
    throw new Error("목표 연도가 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
    throw new Error("목표금액이 올바르지 않습니다.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("company_sales_targets").upsert(
    {
      company_id: access.companyId,
      target_year: targetYear,
      target_amount: targetAmount,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,target_year" },
  );

  if (error) throw new Error(error.message);
}
