import * as XLSX from "xlsx";

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
  remark: string;
  errors: string[];
};

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
  trade: ["공종", "공사명", "구분", "분류"],
  item: ["품목", "품명", "항목", "내역", "공사내용"],
  spec: ["규격", "사양", "스펙"],
  quantity: ["수량", "물량"],
  unit: ["단위"],
  unitPrice: ["단가", "재료비단가"],
  amount: ["금액", "합계", "공급가액"],
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

function normalizedHeader(value: unknown): string {
  return text(value).replace(/[\s()·\/]/g, "").toLowerCase();
}

type HeaderMatch = { row: number; columns: Record<string, number>; score: number };

function findHeader(matrix: unknown[][]): HeaderMatch | null {
  let best: HeaderMatch | null = null;
  for (const [rowIndex, row] of matrix.slice(0, 40).entries()) {
    const columns: Record<string, number> = {};
    for (const [columnIndex, cell] of row.entries()) {
      const candidate = normalizedHeader(cell);
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some((alias) => candidate === normalizedHeader(alias) || candidate.includes(normalizedHeader(alias)))) {
          columns[key] ??= columnIndex;
        }
      }
    }
    const score = ["item", "quantity", "unitPrice", "amount"].filter((key) => columns[key] != null).length;
    if (!best || score > best.score) best = { row: rowIndex, columns, score };
  }
  return best && best.score >= 2 ? best : null;
}

function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
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

  matrix.slice(header.row + 1).forEach((row, offset) => {
    const rowNumber = header.row + offset + 2;
    const cells = row.map(text);
    const joined = cells.join(" ");
    if (!joined.trim()) return;
    const amount = numberValue(row[header.columns.amount]);
    if (/부가세|VAT/i.test(joined)) { vatAmount = amount || numberValue(row.find((v) => numberValue(v))); return; }
    if (/할인|조정/.test(joined)) { discountAmount = Math.abs(amount || numberValue(row.find((v) => numberValue(v)))); return; }
    if (/총\s*금액|합계금액|견적금액/.test(joined)) { totalAmount = amount || numberValue(row.find((v) => numberValue(v))); return; }
    if (/공급가|소계/.test(joined) && !text(row[header.columns.item])) {
      const subtotal = amount || numberValue(row.find((v) => numberValue(v)));
      if (/공급가/.test(joined)) supplyAmount = subtotal;
      else tradeSubtotals[currentTrade] = subtotal;
      return;
    }

    const trade = text(row[header.columns.trade]);
    const itemName = text(row[header.columns.item]);
    const quantity = numberValue(row[header.columns.quantity]);
    const unitPrice = numberValue(row[header.columns.unitPrice]);
    if (trade && !itemName && quantity === 0 && unitPrice === 0 && amount === 0) { currentTrade = trade; return; }
    if (!itemName && amount === 0) return;
    if (trade) currentTrade = trade;

    const calculated = Math.round(quantity * unitPrice);
    const resolvedAmount = Math.round(amount || calculated);
    const errors: string[] = [];
    if (!itemName) errors.push("품목 누락");
    if (quantity <= 0) errors.push("수량 누락");
    if (unitPrice <= 0 && resolvedAmount <= 0) errors.push("단가·금액 누락");
    if (amount && calculated && Math.abs(amount - calculated) > 1) errors.push("수량×단가와 금액 불일치");
    items.push({
      id: `excel-${rowNumber}-${items.length}`,
      sourceRow: rowNumber,
      tradeName: currentTrade || "기타공사",
      itemName,
      specification: text(row[header.columns.spec]),
      quantity,
      unit: text(row[header.columns.unit]) || "식",
      unitPrice: Math.round(unitPrice),
      amount: resolvedAmount,
      remark: text(row[header.columns.remark]),
      errors,
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
