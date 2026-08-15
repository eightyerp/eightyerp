"use server";

import { getCompanyMonthlyPnl } from "@/lib/crm/company-pnl";
import { getCompanySalesTarget } from "@/lib/crm/company-sales-target";
import { getDashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";
import {
  buildRuleBasedManagementAnalysis,
  requestOpenAiManagementBrief,
} from "@/lib/crm/management-analysis";
import { DEFAULT_COMPANY_ANNUAL_SALES_TARGET } from "@/lib/crm/sales-goals";

export type ManagementAiResult = {
  ok: boolean;
  source: "openai" | "rules";
  text: string;
  generatedAt: string;
};

function formatRuleBrief(
  analysis: ReturnType<typeof buildRuleBasedManagementAnalysis>,
) {
  const insightText = analysis.insights
    .map((item, index) => `${index + 1}. ${item.title}: ${item.detail}`)
    .join("\n");
  const actionText = analysis.actions
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  return `${analysis.headline}\n\n핵심 분석\n${insightText}\n\n우선 실행과제\n${actionText}`;
}

export async function requestManagementAiAnalysis(): Promise<ManagementAiResult> {
  const summary = await getDashboardSettlementSummary();
  if (!summary.isFinanceAdmin) {
    throw new Error("관리자만 경영 AI 분석을 실행할 수 있습니다.");
  }

  const [pnl, target] = await Promise.all([
    getCompanyMonthlyPnl(2026),
    getCompanySalesTarget(2026),
  ]);
  const annualTarget =
    target?.targetAmount ?? DEFAULT_COMPANY_ANNUAL_SALES_TARGET;
  const fallback = buildRuleBasedManagementAnalysis({
    summary,
    pnl,
    annualTarget,
  });

  try {
    const aiText = await requestOpenAiManagementBrief({
      summary,
      pnl,
      annualTarget,
    });
    if (aiText) {
      return {
        ok: true,
        source: "openai",
        text: aiText,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // 외부 AI 오류가 관리자 대시보드 사용을 막지 않도록 규칙기반 분석으로 대체합니다.
  }

  return {
    ok: true,
    source: "rules",
    text: formatRuleBrief(fallback),
    generatedAt: new Date().toISOString(),
  };
}
