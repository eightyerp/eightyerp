import {
  hasInteriorItemContent,
  isInteriorReferenceItem,
  type InteriorExcelItem,
  type InteriorExcelParseResult,
} from "./interior-quote-excel";

export type InteriorDiagnosticCode =
  | "missing_quantity"
  | "missing_material_unit_price"
  | "missing_labor_unit_price"
  | "missing_amount"
  | "calculated_amount_mismatch"
  | "excel_amount_mismatch"
  | "trade_subtotal_mismatch"
  | "quote_total_mismatch"
  | "invalid_number"
  | "zero_value_reference_item";

export type InteriorDiagnostic = {
  id: string;
  code: InteriorDiagnosticCode;
  scope: "row" | "trade" | "quote";
  itemId?: string;
  tradeName?: string;
  severity: "error" | "info";
  message: string;
  excelAmount: number | null;
  erpAmount: number;
  difference: number;
  differenceRate: number | null;
};

export type InteriorResolutionKind =
  | "excel_amount"
  | "keep_calculated"
  | "manual_prices"
  | "adjustment"
  | "reference";

export type InteriorResolutionDraft = {
  kind: InteriorResolutionKind;
  materialUnitPrice?: number;
  laborUnitPrice?: number;
  allocation?: "material" | "labor";
  reason?: string;
};

export type InteriorResolutionRecord = {
  kind: InteriorResolutionKind;
  reason: string;
  confirmedAt: string;
};

const tolerance = 1;
const finite = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) ? value : null;
const calculatedMaterial = (item: InteriorExcelItem) =>
  Math.round(item.quantity * item.materialUnitPrice);
const calculatedLabor = (item: InteriorExcelItem) =>
  Math.round(item.quantity * item.laborUnitPrice);
const rate = (difference: number, base: number) =>
  base === 0 ? null : Math.abs(difference / base) * 100;

function diagnostic(input: Omit<InteriorDiagnostic, "id" | "differenceRate">): InteriorDiagnostic {
  return {
    ...input,
    id: [input.scope, input.itemId ?? input.tradeName ?? "quote", input.code].join(":"),
    differenceRate: rate(input.difference, input.excelAmount ?? input.erpAmount),
  };
}

export function diagnoseInteriorItem(item: InteriorExcelItem): InteriorDiagnostic[] {
  const original = item.excelOriginal;
  const materialCalculatedAmount = calculatedMaterial(item);
  const laborCalculatedAmount = calculatedLabor(item);
  const calculatedAmount = materialCalculatedAmount + laborCalculatedAmount;
  const results: InteriorDiagnostic[] = [];
  const push = (
    code: InteriorDiagnosticCode,
    message: string,
    excelAmount: number | null,
    erpAmount: number,
    difference: number,
    severity: "error" | "info" = "error",
  ) => results.push(diagnostic({ code, scope: "row", itemId: item.id, tradeName: item.tradeName, severity, message, excelAmount, erpAmount, difference }));

  if (original.invalidFields.length) {
    push("invalid_number", `숫자로 해석할 수 없는 값: ${original.invalidFields.join(", ")}`, null, item.amount, 0);
  }
  const hasPriceSignal = [original.materialUnitPrice, original.materialAmount, original.laborUnitPrice, original.laborAmount, original.amount]
    .some((value) => (value ?? 0) !== 0);
  if (original.quantity == null && hasPriceSignal) {
    push("missing_quantity", "수량이 비어 있습니다.", original.amount, item.amount, item.amount);
  }
  if (original.materialUnitPrice == null && (original.materialAmount ?? 0) > 0) {
    push("missing_material_unit_price", "자재금액은 있지만 자재단가가 없습니다.", original.materialAmount, materialCalculatedAmount, (original.materialAmount ?? 0) - materialCalculatedAmount);
  }
  if (original.laborUnitPrice == null && (original.laborAmount ?? 0) > 0) {
    push("missing_labor_unit_price", "인건비금액은 있지만 인건비단가가 없습니다.", original.laborAmount, laborCalculatedAmount, (original.laborAmount ?? 0) - laborCalculatedAmount);
  }
  if (
    original.amount == null &&
    original.materialAmount == null &&
    original.laborAmount == null &&
    ((original.materialUnitPrice ?? 0) > 0 || (original.laborUnitPrice ?? 0) > 0)
  ) {
    push("missing_amount", "단가는 있지만 Excel 금액이 없습니다.", null, calculatedAmount, -calculatedAmount);
  }
  if (Math.abs(item.amount - calculatedAmount) > tolerance) {
    push("calculated_amount_mismatch", "현재 ERP 금액과 수량×단가 계산값이 다릅니다.", item.amount, calculatedAmount, item.amount - calculatedAmount);
  }
  const componentExcelAmount =
    (finite(original.materialAmount) ?? materialCalculatedAmount) +
    (finite(original.laborAmount) ?? laborCalculatedAmount);
  if (original.amount != null && Math.abs(original.amount - componentExcelAmount) > tolerance) {
    push("excel_amount_mismatch", "Excel 행 합계와 자재·인건비 합계가 다릅니다.", original.amount, componentExcelAmount, original.amount - componentExcelAmount);
  }
  if (isInteriorReferenceItem(item)) {
    push("zero_value_reference_item", "품목·설명은 유지하고 금액은 합계에서 제외되는 참고항목입니다.", original.amount, 0, 0, "info");
  }
  return results;
}

export function diagnoseInteriorWorkbook(
  items: InteriorExcelItem[],
  parsed: InteriorExcelParseResult,
  currentTotal: number,
): InteriorDiagnostic[] {
  const results = items.flatMap(diagnoseInteriorItem);
  for (const [tradeName, excelSubtotal] of Object.entries(parsed.totals.tradeSubtotals)) {
    const erpSubtotal = items.filter((item) => item.tradeName === tradeName).reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(excelSubtotal - erpSubtotal) > tolerance) {
      results.push(diagnostic({
        code: "trade_subtotal_mismatch",
        scope: "trade",
        tradeName,
        severity: "error",
        message: `${tradeName} 공종의 Excel 소계와 ERP 소계가 다릅니다.`,
        excelAmount: excelSubtotal,
        erpAmount: erpSubtotal,
        difference: excelSubtotal - erpSubtotal,
      }));
    }
  }
  if (parsed.totals.totalAmount != null && Math.abs(parsed.totals.totalAmount - currentTotal) > tolerance) {
    results.push(diagnostic({
      code: "quote_total_mismatch",
      scope: "quote",
      severity: "error",
      message: "Excel 총액과 ERP 총액이 다릅니다.",
      excelAmount: parsed.totals.totalAmount,
      erpAmount: currentTotal,
      difference: parsed.totals.totalAmount - currentTotal,
    }));
  }
  return results;
}

export function applyInteriorResolution(
  item: InteriorExcelItem,
  draft: InteriorResolutionDraft,
): { item: InteriorExcelItem; adjustment?: InteriorExcelItem; record: InteriorResolutionRecord } {
  const reason = String(draft.reason ?? "").trim();
  let next = { ...item, errors: [] };
  let adjustment: InteriorExcelItem | undefined;
  if (draft.kind === "excel_amount") {
    const target = item.excelOriginal.amount ??
      (item.excelOriginal.materialAmount ?? 0) + (item.excelOriginal.laborAmount ?? 0);
    const allocation = draft.allocation ?? "material";
    const materialAmount = allocation === "material" ? target : 0;
    const laborAmount = allocation === "labor" ? target : 0;
    next = {
      ...next,
      materialAmount,
      laborAmount,
      materialUnitPrice: item.quantity > 0 ? Math.round(materialAmount / item.quantity) : 0,
      laborUnitPrice: item.quantity > 0 ? Math.round(laborAmount / item.quantity) : 0,
      unitPrice: item.quantity > 0 ? Math.round(target / item.quantity) : 0,
      amount: target,
    };
  } else if (draft.kind === "keep_calculated") {
    const materialAmount = calculatedMaterial(item);
    const laborAmount = calculatedLabor(item);
    next = { ...next, materialAmount, laborAmount, amount: materialAmount + laborAmount };
  } else if (draft.kind === "manual_prices") {
    const materialInput = Number(draft.materialUnitPrice ?? item.materialUnitPrice);
    const laborInput = Number(draft.laborUnitPrice ?? item.laborUnitPrice);
    if (!Number.isFinite(materialInput) || !Number.isFinite(laborInput) || materialInput < 0 || laborInput < 0) {
      throw new Error("자재단가와 인건비단가는 0 이상의 숫자로 입력해 주세요.");
    }
    const materialUnitPrice = materialInput;
    const laborUnitPrice = laborInput;
    const materialAmount = Math.round(item.quantity * materialUnitPrice);
    const laborAmount = Math.round(item.quantity * laborUnitPrice);
    next = { ...next, materialUnitPrice, laborUnitPrice, unitPrice: materialUnitPrice + laborUnitPrice, materialAmount, laborAmount, amount: materialAmount + laborAmount };
  } else if (draft.kind === "reference") {
    next = { ...next, quantity: 0, materialUnitPrice: 0, laborUnitPrice: 0, unitPrice: 0, materialAmount: 0, laborAmount: 0, amount: 0 };
  } else if (draft.kind === "adjustment") {
    if (!reason) throw new Error("차액 조정사유를 입력해 주세요.");
    const target = item.excelOriginal.amount ?? item.amount;
    const difference = target - item.amount;
    if (difference <= 0) throw new Error("감액 조정은 0원 이상 quote_items 제약 때문에 생성할 수 없습니다. 단가 수정 또는 Excel 금액 기준을 선택해 주세요.");
    adjustment = {
      ...item,
      id: `adjustment-${item.id}-${Date.now()}`,
      sourceRow: 0,
      itemName: "금액 조정",
      specification: reason,
      quantity: 1,
      unit: "식",
      materialUnitPrice: difference,
      materialAmount: difference,
      laborUnitPrice: 0,
      laborAmount: 0,
      unitPrice: difference,
      amount: difference,
      remark: `원본 행: ${item.itemName}`,
      errors: [],
      excelOriginal: {
        quantity: 1,
        materialUnitPrice: difference,
        materialAmount: difference,
        laborUnitPrice: 0,
        laborAmount: 0,
        amount: difference,
        invalidFields: [],
      },
    };
  }
  return {
    item: next,
    adjustment,
    record: { kind: draft.kind, reason, confirmedAt: new Date().toISOString() },
  };
}

export function isUnresolvedDiagnostic(
  issue: InteriorDiagnostic,
  rowResolutions: Record<string, InteriorResolutionRecord>,
  aggregateConfirmations: Record<string, boolean>,
) {
  if (issue.severity !== "error") return false;
  if (issue.itemId && rowResolutions[issue.itemId]) return false;
  if (aggregateConfirmations[issue.id]) return false;
  return true;
}

export function isDisplayableItem(item: InteriorExcelItem) {
  return hasInteriorItemContent(item);
}
