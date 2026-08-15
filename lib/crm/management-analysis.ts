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

function numberRate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function buildRuleBasedManagementAnalysis(input: {
  summary: DashboardSettlementSummary;
  pnl: CompanyPnlSummary | null;
  annualTarget: number;
}): ManagementAnalysis {
  const { summary, pnl, annualTarget } = input;
  const officialUnits = businessUnitTotals(summary);
  const latestMonth = pnl?.latestMonth ?? 0;
  const annualAchievement = numberRate(summary.revenueAmount, annualTarget);
  const elapsedTargetRate = latestMonth > 0 ? (latestMonth / 12) * 100 : 0;
  const paceGap = annualAchievement - elapsedTargetRate;

  const officialWindowContributionRate = numberRate(
    officialUnits.window.margin,
    officialUnits.window.revenue,
  );
  const officialInteriorContributionRate = numberRate(
    officialUnits.interior.margin,
    officialUnits.interior.revenue,
  );

  const sgaRatio = pnl ? numberRate(pnl.sgaExpense, pnl.totalRevenue) : 0;
  const netMargin = pnl ? numberRate(pnl.netProfit, pnl.totalRevenue) : 0;
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
      detail: `현재 영업실적 달성률은 ${percent(annualAchievement)}로, ${latestMonth || "현재"}월 누적 기준 진도보다 ${percent(Math.abs(paceGap))}p 앞서 있습니다.`,
    });
  } else {
    insights.push({
      tone: paceGap <= -15 ? "risk" : "warning",
      title: "100억 목표 속도 보완 필요",
      detail: `현재 영업실적 달성률은 ${percent(annualAchievement)}로, ${latestMonth || "현재"}월 누적 기준 진도보다 ${percent(Math.abs(paceGap))}p 부족합니다.`,
    });
    actions.push("남은 기간 목표를 창호·인테리어 수주목표와 월·주 단위 실행목표로 역산합니다.");
  }

  if (pnl) {
    const windowGrossMarginRate = numberRate(
      pnl.windowGrossProfit,
      pnl.windowRevenue,
    );
    const interiorGrossMarginRate = numberRate(
      pnl.interiorGrossProfit,
      pnl.interiorRevenue,
    );
    const windowOperatingMarginRate = numberRate(
      pnl.windowOperatingProfit,
      pnl.windowRevenue,
    );
    const interiorOperatingMarginRate = numberRate(
      pnl.interiorOperatingProfit,
      pnl.interiorRevenue,
    );

    insights.push({
      tone: "info",
      title: "수익성 지표 기준을 분리해 봐야 합니다",
      detail: `내부 손익 기준 매출총이익률은 창호 ${percent(windowGrossMarginRate)}, 인테리어 ${percent(interiorGrossMarginRate)}입니다. 반면 영업실적 원장의 현장 기여마진율은 창호 ${percent(officialWindowContributionRate)}, 인테리어 ${percent(officialInteriorContributionRate)}입니다. 영업인센티브 포함 범위와 매출 인식 시점이 달라 두 지표를 혼용하면 안 됩니다.`,
    });

    insights.push({
      tone:
        pnl.windowOperatingProfit < 0 || pnl.interiorOperatingProfit < 0
          ? "warning"
          : "positive",
      title: "사업부별 판관비를 실제 분류로 반영",
      detail: `현재 내부 엑셀 분류 기준 창호·본사 판관비는 ${compactMoney(pnl.windowSgaExpense)}, 인테리어 판관비는 ${compactMoney(pnl.interiorSgaExpense)}, 별도 공통비는 ${compactMoney(pnl.commonSgaExpense)}입니다. 반영 후 영업손익률은 창호 ${percent(windowOperatingMarginRate)}, 인테리어 ${percent(interiorOperatingMarginRate)}입니다.`,
    });

    if (pnl.windowSgaExpense > 0) {
      actions.push("창호 판관비에 포함된 사무실·대표급여 등 본사성 비용을 공통비 태그로 재분류해 순수 창호 영업손익을 확정합니다.");
    }

    insights.push({
      tone: sgaRatio >= 12 ? "risk" : sgaRatio >= 10 ? "warning" : "positive",
      title: "판매관리비 관리",
      detail: `누적 판매관리비는 ${compactMoney(pnl.sgaExpense)}, 손익매출 대비 ${percent(sgaRatio)}입니다. 매출비중 가배분이 아니라 내부 엑셀의 사업부 경비총액을 사용합니다.`,
    });
    if (sgaRatio >= 10) {
      actions.push("급여·광고·차량·임차료·법인카드를 창호/인테리어/공통 태그로 입력해 월별 실비 손익을 관리합니다.");
    }

    insights.push({
      tone: netMargin >= 5 ? "positive" : netMargin >= 2 ? "warning" : "risk",
      title: "최종 순이익률",
      detail: `내부 손익 기준 최종 순이익은 ${compactMoney(pnl.netProfit)}, 순이익률은 ${percent(netMargin)}입니다.`,
    });

    if (latestRow && priorRow && latestNetChange != null) {
      const decreased = latestNetChange < 0;
      insights.push({
        tone:
          decreased && latestNetChange <= -30
            ? "risk"
            : decreased
              ? "warning"
              : "positive",
        title: `${latestRow.month}월 순이익 ${decreased ? "감소" : "증가"}`,
        detail: `${latestRow.month}월 순이익은 ${compactMoney(latestRow.netProfit)}로 전월 대비 ${percent(Math.abs(latestNetChange))} ${decreased ? "감소" : "증가"}했습니다.`,
      });
      if (decreased) {
        actions.push(`${latestRow.month}월 사업부별 매출총이익·판관비·장려금 변동을 전월과 비교합니다.`);
      }
    }
  } else {
    const strongerUnit =
      officialInteriorContributionRate >= officialWindowContributionRate
        ? "인테리어"
        : "창호";
    insights.push({
      tone: "info",
      title: `${strongerUnit} 현장 기여마진이 상대적으로 높음`,
      detail: `내부 손익자료가 없어 영업실적 원장의 현장 기여마진만 비교했습니다. 창호 ${percent(officialWindowContributionRate)}, 인테리어 ${percent(officialInteriorContributionRate)}입니다.`,
    });
  }

  if (actions.length === 0) {
    actions.push("현재 추세를 유지하되 사업부별 매출총이익률·판관비율·영업손익률을 월 단위로 모니터링합니다.");
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
      ? "목표 속도와 사업부별 비용구조를 동시에 바로잡아야 합니다."
      : status === "watch"
        ? "매출은 성장하고 있지만 지표 기준과 판관비 분류를 함께 관리해야 합니다."
        : "매출과 수익성이 안정적으로 개선되고 있습니다.";

  return {
    status,
    headline,
    insights: insights.slice(0, 6),
    actions: actions.slice(0, 5),
  };
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

  const officialUnits = businessUnitTotals(input.summary);
  const payload = {
    annual_target: input.annualTarget,
    official_sales_performance: {
      revenue: input.summary.revenueAmount,
      cost: input.summary.costAmount,
      margin: input.summary.marginAmount,
      definition:
        "현장·영업 실적원장 기준. 직원 목표와 매출 달성률에 사용하며 내부 손익과 원가범위가 다를 수 있음",
      window: officialUnits.window,
      interior: officialUnits.interior,
    },
    internal_pnl: input.pnl
      ? {
          through_month: input.pnl.latestMonth,
          revenue: input.pnl.totalRevenue,
          gross_profit: input.pnl.grossProfit,
          sga: input.pnl.sgaExpense,
          operating_profit: input.pnl.operatingProfit,
          other_income: input.pnl.otherIncome,
          net_profit: input.pnl.netProfit,
          window: {
            revenue: input.pnl.windowRevenue,
            cogs: input.pnl.windowCogs,
            gross_profit: input.pnl.windowGrossProfit,
            sga: input.pnl.windowSgaExpense,
            operating_profit: input.pnl.windowOperatingProfit,
            note: "현재 내부 엑셀의 창호 비용 블록이며 사무실·대표급여 등 본사성 비용 포함 가능",
          },
          interior: {
            revenue: input.pnl.interiorRevenue,
            cogs: input.pnl.interiorCogs,
            gross_profit: input.pnl.interiorGrossProfit,
            sga: input.pnl.interiorSgaExpense,
            operating_profit: input.pnl.interiorOperatingProfit,
          },
          common_sga: input.pnl.commonSgaExpense,
          monthly: input.pnl.rows.map((row) => ({
            month: row.month,
            revenue: row.totalRevenue,
            window_gross_profit: row.windowGrossProfit,
            window_sga: row.windowSgaExpense,
            window_operating_profit: row.windowOperatingProfit,
            interior_gross_profit: row.interiorGrossProfit,
            interior_sga: row.interiorSgaExpense,
            interior_operating_profit: row.interiorOperatingProfit,
            common_sga: row.commonSgaExpense,
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
      max_output_tokens: 1000,
      input: [
        {
          role: "developer",
          content:
            "당신은 대한민국 주거 인테리어·창호 회사의 CFO 겸 영업전략가입니다. 제공된 집계수치만 사용하고 추측하지 마세요. 사업부 수익성 비교는 internal_pnl을 우선 사용하고, official_sales_performance의 현장 기여마진과 절대 혼용하지 마세요. 서로 다른 지표를 언급할 때는 반드시 기준을 이름으로 밝혀야 합니다. 창호 판관비에는 본사성 비용이 포함될 수 있다는 주석도 반영하세요. 답변은 한국어로 1) 핵심진단 2) 지표기준 3) 위험신호 4) 실행과제 순서로 작성하세요. 고객 개인정보나 직원 평가는 포함하지 마세요.",
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
