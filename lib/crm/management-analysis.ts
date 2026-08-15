import type { CompanyPnlSummary } from "@/lib/crm/company-pnl";
import type { DashboardSettlementSummary } from "@/lib/crm/dashboard-settlement";

export type ManagementInsightTone = "positive" | "warning" | "risk" | "info";

export type ManagementInsight = {
  tone: ManagementInsightTone;
  title: string;
  detail: string;
};

export type ManagementAnalysis = {
  status: "good" | "watch" | "risk";
  headline: string;
  insights: ManagementInsight[];
  actions: string[];
};

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function compactMoney(value: number) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 100_000_000) {
    return `${sign}${(absolute / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1")}억원`;
  }
  if (absolute >= 10_000) {
    return `${sign}${Math.round(absolute / 10_000).toLocaleString("ko-KR")}만원`;
  }
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}원`;
}

function businessUnitTotals(summary: DashboardSettlementSummary) {
  const windowRows = summary.employeeSales.filter(
    (row) => row.businessUnit === "window" || row.businessUnit === "shared",
  );
  const interiorRows = summary.employeeSales.filter(
    (row) => row.businessUnit === "interior",
  );
  const sum = (rows: typeof summary.employeeSales) =>
    rows.reduce(
      (acc, row) => ({
        revenue: acc.revenue + Number(row.revenueAmount || 0),
        cost: acc.cost + Number(row.costAmount || 0),
        margin: acc.margin + Number(row.marginAmount || 0),
      }),
      { revenue: 0, cost: 0, margin: 0 },
    );
  return { window: sum(windowRows), interior: sum(interiorRows) };
}

export function buildRuleBasedManagementAnalysis(input: {
  summary: DashboardSettlementSummary;
  pnl: CompanyPnlSummary | null;
  annualTarget: number;
}): ManagementAnalysis {
  const { summary, pnl, annualTarget } = input;
  const units = businessUnitTotals(summary);
  const latestMonth = pnl?.latestMonth ?? 0;
  const annualAchievement =
    annualTarget > 0 ? (summary.revenueAmount / annualTarget) * 100 : 0;
  const elapsedTargetRate = latestMonth > 0 ? (latestMonth / 12) * 100 : 0;
  const paceGap = annualAchievement - elapsedTargetRate;
  const windowMarginRate =
    units.window.revenue > 0
      ? (units.window.margin / units.window.revenue) * 100
      : 0;
  const interiorMarginRate =
    units.interior.revenue > 0
      ? (units.interior.margin / units.interior.revenue) * 100
      : 0;
  const sgaRatio =
    pnl && pnl.totalRevenue > 0 ? (pnl.sgaExpense / pnl.totalRevenue) * 100 : 0;
  const netMargin =
    pnl && pnl.totalRevenue > 0 ? (pnl.netProfit / pnl.totalRevenue) * 100 : 0;
  const latestRow = pnl?.rows.at(-1) ?? null;
  const priorRow = pnl && pnl.rows.length >= 2 ? pnl.rows.at(-2) ?? null : null;
  const latestNetChange =
    latestRow && priorRow && Math.abs(priorRow.netProfit) > 0
      ? ((latestRow.netProfit - priorRow.netProfit) /
          Math.abs(priorRow.netProfit)) *
        100
      : null;

  const insights: ManagementInsight[] = [];
  const actions: string[] = [];

  if (paceGap >= 0) {
    insights.push({
      tone: "positive",
      title: "연간 목표 진도 양호",
      detail: `현재 매출 달성률은 ${percent(annualAchievement)}로, ${latestMonth || "현재"}월 누적 기준 진도보다 ${percent(Math.abs(paceGap))}p 앞서 있습니다.`,
    });
  } else {
    insights.push({
      tone: paceGap <= -15 ? "risk" : "warning",
      title: "100억 목표 진도 보완 필요",
      detail: `현재 매출 달성률은 ${percent(annualAchievement)}로, ${latestMonth || "현재"}월 누적 기준 진도보다 ${percent(Math.abs(paceGap))}p 부족합니다.`,
    });
    actions.push("남은 기간의 월별 목표를 창호·인테리어로 나눠 주간 수주 목표까지 역산합니다.");
  }

  const strongerUnit =
    interiorMarginRate >= windowMarginRate ? "인테리어" : "창호";
  const strongerRate = Math.max(interiorMarginRate, windowMarginRate);
  const weakerUnit = strongerUnit === "인테리어" ? "창호" : "인테리어";
  const weakerRate = Math.min(interiorMarginRate, windowMarginRate);
  insights.push({
    tone: strongerRate - weakerRate >= 3 ? "info" : "positive",
    title: `${strongerUnit} 수익성이 상대적으로 우수`,
    detail: `${strongerUnit} 마진율은 ${percent(strongerRate)}, ${weakerUnit}는 ${percent(weakerRate)}입니다. 사업부별 직접원가와 할인·외주비 차이를 확인할 필요가 있습니다.`,
  });
  if (strongerRate - weakerRate >= 3) {
    actions.push(`${weakerUnit}의 할인율, 외주비, 공동매출 원가를 월별로 분해해 마진율 하락 원인을 확인합니다.`);
  }

  if (pnl) {
    insights.push({
      tone: sgaRatio >= 12 ? "risk" : sgaRatio >= 10 ? "warning" : "positive",
      title: "판매관리비 관리",
      detail: `누적 판매관리비는 ${compactMoney(pnl.sgaExpense)}, 매출 대비 ${percent(sgaRatio)}입니다. 현재 판관비는 회사 공통비로 관리되며 사업부 표시는 매출비중 가배분 참고값입니다.`,
    });
    if (sgaRatio >= 10) {
      actions.push("광고비·급여·차량·임차료 등 판관비를 사업부 태그로 입력해 실제 사업부 손익을 확보합니다.");
    }

    insights.push({
      tone: netMargin >= 5 ? "positive" : netMargin >= 2 ? "warning" : "risk",
      title: "최종 순이익률",
      detail: `내부 손익 기준 최종 순이익은 ${compactMoney(pnl.netProfit)}, 순이익률은 ${percent(netMargin)}입니다.`,
    });

    if (latestRow && priorRow && latestNetChange != null) {
      const decreased = latestNetChange < 0;
      insights.push({
        tone: decreased && latestNetChange <= -30 ? "risk" : decreased ? "warning" : "positive",
        title: `${latestRow.month}월 순이익 ${decreased ? "감소" : "증가"}`,
        detail: `${latestRow.month}월 순이익은 ${compactMoney(latestRow.netProfit)}로 전월 대비 ${percent(Math.abs(latestNetChange))} ${decreased ? "감소" : "증가"}했습니다.`,
      });
      if (decreased) {
        actions.push(`${latestRow.month}월의 매출총이익, 판매관리비, 장려금 변동을 전월과 비교해 감소 원인을 확인합니다.`);
      }
    }
  }

  if (actions.length === 0) {
    actions.push("현재 추세를 유지하되 사업부별 원가율과 판관비율을 월 단위로 모니터링합니다.");
  }
  actions.push("수기 자료와 ERP 자동자료가 겹치는 월은 자동자료 우선 집계 규칙을 유지합니다.");

  const status: ManagementAnalysis["status"] =
    paceGap <= -15 || (pnl ? netMargin < 2 : false)
      ? "risk"
      : paceGap < 0 || (pnl ? sgaRatio >= 10 : false)
        ? "watch"
        : "good";

  const headline =
    status === "risk"
      ? "매출 목표 진도와 이익 방어를 동시에 관리해야 합니다."
      : status === "watch"
        ? "성장은 이어지고 있지만 목표 속도와 비용 효율 점검이 필요합니다."
        : "매출과 수익성이 안정적으로 개선되고 있습니다.";

  return { status, headline, insights: insights.slice(0, 5), actions: actions.slice(0, 4) };
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return null;
}

export async function requestOpenAiManagementBrief(input: {
  summary: DashboardSettlementSummary;
  pnl: CompanyPnlSummary | null;
  annualTarget: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const units = businessUnitTotals(input.summary);
  const payload = {
    annual_target: input.annualTarget,
    official_sales: input.summary.revenueAmount,
    official_cost: input.summary.costAmount,
    official_margin: input.summary.marginAmount,
    window: units.window,
    interior: units.interior,
    pnl: input.pnl
      ? {
          through_month: input.pnl.latestMonth,
          revenue: input.pnl.totalRevenue,
          gross_profit: input.pnl.grossProfit,
          sga: input.pnl.sgaExpense,
          operating_profit: input.pnl.operatingProfit,
          other_income: input.pnl.otherIncome,
          net_profit: input.pnl.netProfit,
          monthly: input.pnl.rows.map((row) => ({
            month: row.month,
            revenue: row.totalRevenue,
            gross_profit: row.grossProfit,
            sga: row.sgaExpense,
            net_profit: row.netProfit,
          })),
        }
      : null,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-5-mini",
      store: false,
      max_output_tokens: 900,
      input: [
        {
          role: "developer",
          content:
            "당신은 대한민국 주거 인테리어·창호 회사의 CFO 겸 영업전략가입니다. 제공된 집계수치만 사용하고 추측하지 마세요. 답변은 한국어로 작성하며 1) 핵심진단 2) 위험신호 3) 기회 4) 이번달 실행과제 순서로 간결하게 작성하세요. 고객 개인정보나 직원 평가는 포함하지 마세요.",
        },
        {
          role: "user",
          content: `에잇티 ERP 경영 데이터를 분석해 주세요.\n${JSON.stringify(payload)}`,
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const json = (await response.json()) as unknown;
  return extractResponseText(json);
}
