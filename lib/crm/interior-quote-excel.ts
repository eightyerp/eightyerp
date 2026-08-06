import * as XLSX from "xlsx";
import { mapInteriorCostHeaderBlock } from "@/lib/excel-engine/header-mapper";

export const INTERIOR_EXCEL_MAX_BYTES = 15 * 1024 * 1024;
export const INTERIOR_EXCEL_EXTENSIONS = ["xlsx", "xls"] as const;

export type InteriorExcelItem = {
  id: string;
  sourceRow: number;
  tradeName: string;
  itemName: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  materialUnitPrice: number;
  materialAmount: number;
  laborUnitPrice: number;
  laborAmount: number;
  remark: string;
  errors: string[];
  excelOriginal: {
    quantity: number | null;
    materialUnitPrice: number | null;
    materialAmount: number | null;
    laborUnitPrice: number | null;
    laborAmount: number | null;
    amount: number | null;
    invalidFields: string[];
  };
};

export function hasInteriorItemContent(
  item: Pick<InteriorExcelItem, "itemName" | "specification">,
): boolean {
  return Boolean(item.itemName.trim() || item.specification.trim());
}

export function isInteriorReferenceItem(
  item: Pick<InteriorExcelItem, "itemName" | "specification" | "amount">,
): boolean {
  return hasInteriorItemContent(item) && item.amount === 0;
}

export function recalculateInteriorCostItem(
  item: InteriorExcelItem,
  patch: Partial<Pick<InteriorExcelItem, "quantity" | "materialUnitPrice" | "laborUnitPrice">>,
): InteriorExcelItem {
  const next = { ...item, ...patch };
  const materialAmount = Math.round(next.quantity * next.materialUnitPrice);
  const laborAmount = Math.round(next.quantity * next.laborUnitPrice);
  return {
    ...next,
    materialAmount,
    laborAmount,
    unitPrice: next.materialUnitPrice + next.laborUnitPrice,
    amount: materialAmount + laborAmount,
    errors: [],
  };
}

export function buildInteriorQuoteItemsPayload(items: InteriorExcelItem[]) {
  return items.map((item, index) => ({
    id: null,
    client_key: item.id,
    trade_name: item.tradeName || "기타공사",
    item_name: item.itemName.trim() || null,
    description:
      [
        item.specification,
        item.materialAmount || item.laborAmount
          ? `자재 ${Math.round(item.materialAmount).toLocaleString("ko-KR")}원 · 인건비 ${Math.round(item.laborAmount).toLocaleString("ko-KR")}원`
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || null,
    remark: item.remark || null,
    quantity: item.quantity,
    unit: item.unit || null,
    unit_price: item.materialUnitPrice + item.laborUnitPrice,
    amount: Math.round(item.materialAmount + item.laborAmount),
    cost_type: "일반" as const,
    is_lx_material: false,
    lx_discount_base_amount: 0,
    lx_discount_type: null,
    lx_discount_value: null,
    sort_order: index,
  }));
}

export function getInteriorImportBlockingReason(input: {
  customerId: string;
  employeeId: string;
  fileReady: boolean;
  items: InteriorExcelItem[];
  excelDifference: number;
  unresolvedDiagnosticCount?: number;
  totalMismatchConfirmed?: boolean;
}): string | null {
  if (!input.customerId) return "고객을 선택해 주세요.";
  if (!input.employeeId) return "담당 직원을 선택해 주세요.";
  if (!input.fileReady) return "Excel 파일을 분석해 주세요.";
  if (!input.items.some((item) => hasInteriorItemContent(item) && item.amount > 0)) {
    return "유효한 유상 품목이 1개 이상 필요합니다.";
  }
  if ((input.unresolvedDiagnosticCount ?? 0) > 0) {
    return `해결되지 않은 필수 오류 ${input.unresolvedDiagnosticCount}건을 검토해 주세요.`;
  }
  if (Math.abs(input.excelDifference) > 1 && !input.totalMismatchConfirmed) {
    return "Excel 총액과 ERP 계산 총액이 일치하지 않습니다.";
  }
  if (
    input.items.some(
      (item) =>
        !hasInteriorItemContent(item) ||
        item.quantity < 0 ||
        item.unitPrice < 0 ||
        item.amount < 0,
    )
  ) {
    return "음수 금액 또는 내용이 없는 품목을 확인해 주세요.";
  }
  return null;
}

export type InteriorExcelParseResult = {
  sheetName: string;
  customerHints: { name: string; phone: string; address: string; siteName: string };
  items: InteriorExcelItem[];
  totals: {
    tradeSubtotals: Record<string, number>;
    supplyAmount: number | null;
    vatAmount: number | null;
    totalAmount: number | null;
    discountAmount: number;
    vatMode: "inclusive" | "exclusive";
  };
  warnings: string[];
};

const HEADER_ALIASES: Record<string, string[]> = {
  trade: ["공종", "공사명", "내용", "구분", "분류"],
  item: ["품목", "품명", "항목", "내역", "공사내용"],
  spec: ["설명", "규격", "사양", "스펙"],
  quantity: ["수량", "물량"],
  unit: ["단위"],
  unitPrice: ["단가", "재료비단가"],
  amount: ["금액", "합계", "공급가액"],
  materialUnitPrice: ["자재단가"],
  materialAmount: ["자재금액"],
  laborUnitPrice: ["인건비단가", "노무단가"],
  laborAmount: ["인건비금액", "노무금액"],
  remark: ["비고", "메모", "특이사항"],
};

function text(value: unknown): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return /^[=+@]/.test(normalized) ? `'${normalized}` : normalized;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/[\s,원₩]/g, "").replace(/[^0-9.+-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function invalidNumberField(value: unknown, label: string): string | null {
  if (value == null || String(value).trim() === "") return null;
  return optionalNumber(value) == null ? label : null;
}

function normalizedHeader(value: unknown): string {
  return text(value).replace(/[\s()·\/]/g, "").toLowerCase();
}

type HeaderMatch = { row: number; endRow: number; columns: Record<string, number>; score: number };

function findHeader(matrix: unknown[][]): HeaderMatch | null {
  let best: HeaderMatch | null = null;
  for (const [rowIndex, row] of matrix.slice(0, 40).entries()) {
    const columns: Record<string, number> = {};
    for (const [columnIndex, cell] of row.entries()) {
      const candidate = normalizedHeader(cell);
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some((alias) => {
          const normalizedAlias = normalizedHeader(alias);
          return candidate === normalizedAlias || (normalizedAlias.length >= 3 && candidate.includes(normalizedAlias));
        })) {
          columns[key] ??= columnIndex;
        }
      }
    }
    const score = ["item", "quantity", "unitPrice", "amount", "materialUnitPrice", "materialAmount", "laborUnitPrice", "laborAmount"].filter((key) => columns[key] != null).length;
    if (!best || score > best.score) best = { row: rowIndex, endRow: rowIndex, columns, score };
  }
  if (!best || best.score < 2) return null;
  const costs = mapInteriorCostHeaderBlock(matrix, best.row, 3);
  Object.assign(best.columns, costs);
  for (let offset = 1; offset <= 2; offset++) {
    const headerCells = (matrix[best.row + offset] ?? []).map(normalizedHeader).filter(Boolean);
    const hasCostGroup = headerCells.some((cell) => /^(?:자재비?|인건비|노무비?)$/.test(cell));
    const costLeafCount = headerCells.filter((cell) => /^(?:단가|금액)$/.test(cell)).length;
    if (hasCostGroup || costLeafCount >= 2) best.endRow = best.row + offset;
  }
  return best;
}

function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const origin = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1").s;
  for (const merge of sheet["!merges"] ?? []) {
    if (merge.e.c <= merge.s.c) continue;
    const startRow = merge.s.r - origin.r; const endRow = merge.e.r - origin.r;
    const startColumn = merge.s.c - origin.c; const endColumn = merge.e.c - origin.c;
    const value = matrix[startRow]?.[startColumn];
    if (value == null || !/(?:견적가|자재비|인건비|노무비|단가|금액|내용|품목|설명|수량|단위|비고)/.test(normalizedHeader(value))) continue;
    for (let row = startRow; row <= endRow; row++) for (let column = startColumn; column <= endColumn; column++) {
      matrix[row] ??= []; matrix[row][column] ??= value;
    }
  }
  return matrix;
}

function sheetScore(sheet: XLSX.WorkSheet): number {
  const matrix = sheetMatrix(sheet);
  const header = findHeader(matrix);
  if (!header) return 0;
  const textBlob = matrix.slice(0, 60).flat().map(text).join(" ");
  return header.score * 20 + Math.min(matrix.length, 100) + (/견적|내역|공사/.test(textBlob) ? 15 : 0);
}

function inspectWorkbook(workbook: XLSX.WorkBook) {
  if (workbook.vbaraw) throw new Error("매크로가 포함된 Excel 파일은 업로드할 수 없습니다.");
  const external = workbook.Workbook?.Names?.some((name) => /\[[^\]]+\]|https?:\/\//i.test(String(name.Ref ?? "")));
  if (external) throw new Error("외부 통합문서 링크가 포함된 Excel 파일은 업로드할 수 없습니다.");
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    for (const [address, candidate] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      const cell = candidate as XLSX.CellObject;
      if (/\[[^\]]+\]|https?:\/\//i.test(String(cell.f ?? ""))) {
        throw new Error("외부 통합문서 링크가 포함된 Excel 파일은 업로드할 수 없습니다.");
      }
    }
  }
}

function findCustomerHints(matrix: unknown[][]) {
  const hints = { name: "", phone: "", address: "", siteName: "" };
  const labels: Array<[keyof typeof hints, RegExp]> = [
    ["name", /고객명|성명|수신/], ["phone", /연락처|전화|휴대폰/],
    ["address", /주소|공사주소/], ["siteName", /현장명|공사명/],
  ];
  matrix.slice(0, 30).forEach((row) => row.forEach((cell, index) => {
    const label = text(cell);
    for (const [key, pattern] of labels) {
      if (!hints[key] && pattern.test(label)) hints[key] = text(row[index + 1]);
    }
  }));
  return hints;
}

export function parseInteriorQuoteWorkbook(buffer: ArrayBuffer): InteriorExcelParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellFormula: true, cellNF: false, cellText: false, bookVBA: true });
  inspectWorkbook(workbook);
  const ranked = workbook.SheetNames.map((name) => ({ name, score: sheetScore(workbook.Sheets[name]) })).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score === 0) throw new Error("견적 내역 시트를 찾지 못했습니다.");

  const sheetName = ranked[0].name;
  const matrix = sheetMatrix(workbook.Sheets[sheetName]);
  const header = findHeader(matrix);
  if (!header) throw new Error("품목·수량·단가 또는 금액 열을 찾지 못했습니다.");

  const items: InteriorExcelItem[] = [];
  const tradeSubtotals: Record<string, number> = {};
  const warnings: string[] = [];
  let currentTrade = "기타공사";
  let supplyAmount: number | null = null;
  let vatAmount: number | null = null;
  let totalAmount: number | null = null;
  let discountAmount = 0;

  const precedingTrade = text(matrix[header.row - 1]?.[header.columns.trade]);
  const tradeColumnIsDetail = normalizedHeader(matrix[header.row]?.[header.columns.trade]) === "내용";
  if (precedingTrade && !/내용|공종|구분/.test(precedingTrade)) currentTrade = precedingTrade;

  matrix.slice(header.endRow + 1).forEach((row, offset) => {
    const rowNumber = header.endRow + offset + 2;
    const cells = row.map(text);
    const joined = cells.join(" ");
    if (!joined.trim()) return;
    if (/^내\s*용$/i.test(text(row[header.columns.trade])) && /품\s*목/i.test(text(row[header.columns.item]))) return;
    if (/^(?:자재비|인건비|노무비|단가|금액|견적가|총\s*금액)+$/i.test(joined.replace(/\s+/g, ""))) return;
    const rawQuantity = optionalNumber(row[header.columns.quantity]);
    const quantity = rawQuantity ?? 0;
    const rawMaterialUnitPrice = optionalNumber(row[header.columns.materialUnitPrice]);
    const rawMaterialAmount = optionalNumber(row[header.columns.materialAmount]);
    const rawLaborUnitPrice = optionalNumber(row[header.columns.laborUnitPrice]);
    const rawLaborAmount = optionalNumber(row[header.columns.laborAmount]);
    const explicitAmount = optionalNumber(row[header.columns.amount]);
    const invalidFields = [
      invalidNumberField(row[header.columns.quantity], "수량"),
      invalidNumberField(row[header.columns.materialUnitPrice], "자재단가"),
      invalidNumberField(row[header.columns.materialAmount], "자재금액"),
      invalidNumberField(row[header.columns.laborUnitPrice], "인건비단가"),
      invalidNumberField(row[header.columns.laborAmount], "인건비금액"),
      invalidNumberField(row[header.columns.amount], "행 합계금액"),
    ].filter((value): value is string => Boolean(value));
    const materialUnitPrice = rawMaterialUnitPrice ?? (rawMaterialAmount != null && quantity > 0 ? rawMaterialAmount / quantity : 0);
    const laborUnitPrice = rawLaborUnitPrice ?? (rawLaborAmount != null && quantity > 0 ? rawLaborAmount / quantity : 0);
    const materialAmount = rawMaterialAmount ?? (rawMaterialUnitPrice != null ? quantity * rawMaterialUnitPrice : 0);
    const laborAmount = rawLaborAmount ?? (rawLaborUnitPrice != null ? quantity * rawLaborUnitPrice : 0);
    const hasSplitCost = [rawMaterialUnitPrice, rawMaterialAmount, rawLaborUnitPrice, rawLaborAmount].some((value) => value != null);
    const amount = hasSplitCost ? materialAmount + laborAmount : (explicitAmount ?? 0);
    if (/부가세|VAT/i.test(joined)) { vatAmount = amount || numberValue(row.find((v) => numberValue(v))); return; }
    if (/할인|조정/.test(joined)) { discountAmount = Math.abs(amount || numberValue(row.find((v) => numberValue(v)))); return; }
    if (/총\s*금액|합계금액|견적금액/.test(joined)) { totalAmount = amount || numberValue(row.find((v) => numberValue(v))); return; }
    if (/공급가|소\s*계/.test(joined) && !text(row[header.columns.item])) {
      const subtotal = amount || numberValue(row.find((v) => numberValue(v)));
      if (/공급가/.test(joined)) supplyAmount = subtotal;
      else tradeSubtotals[currentTrade] = subtotal;
      return;
    }

    const trade = text(row[header.columns.trade]);
    const itemName = text(row[header.columns.item]);
    const specification = text(row[header.columns.spec]);
    const unitPrice = numberValue(row[header.columns.unitPrice]) || materialUnitPrice + laborUnitPrice;
    if (trade && !itemName && !specification && quantity === 0 && unitPrice === 0 && amount === 0) {
      if (!tradeColumnIsDetail || /^\d{1,2}\s/.test(trade)) currentTrade = trade;
      return;
    }
    if (!itemName && !specification && amount === 0) return;
    if (trade && !tradeColumnIsDetail) currentTrade = trade;

    const calculated = Math.round(quantity * unitPrice);
    const resolvedAmount = Math.round(hasSplitCost ? amount : (explicitAmount ?? calculated));
    const errors: string[] = [];
    if (!itemName && !specification) errors.push("품목·설명 누락");
    if (quantity < 0) errors.push("수량은 0 이상이어야 합니다.");
    if (unitPrice < 0 || resolvedAmount < 0) errors.push("단가·금액은 0 이상이어야 합니다.");
    if (amount && calculated && Math.abs(amount - calculated) > 1) errors.push("수량×단가와 금액 불일치");
    if (explicitAmount != null && Math.abs(explicitAmount - amount) > 1) errors.push(`Excel 합계금액과 자재·인건비 합계 불일치 (${Math.round(explicitAmount - amount).toLocaleString("ko-KR")}원)`);
    items.push({
      id: `excel-${rowNumber}-${items.length}`,
      sourceRow: rowNumber,
      tradeName: currentTrade || "기타공사",
      itemName,
      specification,
      quantity,
      unit: text(row[header.columns.unit]) || "식",
      unitPrice: Math.round(unitPrice),
      amount: resolvedAmount,
      materialUnitPrice: Math.round(materialUnitPrice),
      materialAmount: Math.round(materialAmount),
      laborUnitPrice: Math.round(laborUnitPrice),
      laborAmount: Math.round(laborAmount),
      remark: text(row[header.columns.remark]),
      errors,
      excelOriginal: {
        quantity: rawQuantity,
        materialUnitPrice: rawMaterialUnitPrice,
        materialAmount: rawMaterialAmount,
        laborUnitPrice: rawLaborUnitPrice,
        laborAmount: rawLaborAmount,
        amount: explicitAmount,
        invalidFields,
      },
    });
  });

  if (!items.length) throw new Error("저장 가능한 견적 품목을 찾지 못했습니다.");
  const itemSum = items.reduce((sum, item) => sum + item.amount, 0);
  supplyAmount ??= itemSum;
  if (vatAmount == null && totalAmount != null) vatAmount = Math.max(0, totalAmount - supplyAmount + discountAmount);
  if (totalAmount == null) totalAmount = Math.max(0, supplyAmount + (vatAmount ?? 0) - discountAmount);
  if (Math.abs(itemSum - supplyAmount) > 1) warnings.push(`품목 합계와 Excel 공급가가 ${Math.abs(itemSum - supplyAmount).toLocaleString("ko-KR")}원 다릅니다.`);
  if (ranked.length > 1) warnings.push(`견적 시트로 '${sheetName}'을 자동 선택했습니다.`);
  return {
    sheetName,
    customerHints: findCustomerHints(matrix),
    items,
    totals: { tradeSubtotals, supplyAmount, vatAmount, totalAmount, discountAmount, vatMode: vatAmount && vatAmount > 0 ? "exclusive" : "inclusive" },
    warnings,
  };
}
