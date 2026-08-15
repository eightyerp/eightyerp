export type SettlementPreviewBusinessUnit = "window" | "interior";

export type EstimatedSettlementInput = {
  businessUnit: SettlementPreviewBusinessUnit;
  revenueAmount: number;
  marginAmount: number;
};

export type EstimatedSettlementResult = {
  basisAmount: number;
  rate: number;
  baseSettlementAmount: number;
  basisLabel: string;
  isProxy: boolean;
};

function safeMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function calculateEstimatedBaseSettlement(
  input: EstimatedSettlementInput,
): EstimatedSettlementResult {
  const revenueAmount = safeMoney(input.revenueAmount);
  const marginAmount = safeMoney(input.marginAmount);

  if (input.businessUnit === "interior") {
    const rate = 0.5;
    return {
      basisAmount: marginAmount,
      rate,
      baseSettlementAmount: Math.floor(marginAmount * rate),
      basisLabel: "현장 기여마진 × 50%",
      isProxy: false,
    };
  }

  const rate = 0.02;
  return {
    basisAmount: revenueAmount,
    rate,
    baseSettlementAmount: Math.floor(revenueAmount * rate),
    basisLabel: "영업실적 매출 × 2%",
    isProxy: true,
  };
}

export function calculateExpectedSettlementPayable(input: {
  baseSettlementAmount: number;
  additionalIncentiveAmount: number;
  deductionAmount: number;
  paidAmount: number;
}) {
  return Math.max(
    0,
    Math.floor(
      safeMoney(input.baseSettlementAmount)
        + safeMoney(input.additionalIncentiveAmount)
        - safeMoney(input.deductionAmount)
        - safeMoney(input.paidAmount),
    ),
  );
}

export function calculateCompanyRetainedMargin(input: {
  contributionMargin: number;
  baseSettlementAmount: number;
}) {
  return Math.max(
    0,
    safeMoney(input.contributionMargin) - safeMoney(input.baseSettlementAmount),
  );
}
