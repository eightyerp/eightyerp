import type { ExcelMatrix } from "./types";

export const QUOTE_HEADER_ALIASES = {
  trade: ["공종", "구분", "분류"], item: ["품목", "품명", "제품명", "모델명"], spec: ["설명", "규격", "사양"],
  quantity: ["수량", "qty"], unit: ["단위"], unitPrice: ["단가"], amount: ["금액", "합계"],
  materialUnitPrice: ["자재단가"], materialAmount: ["자재금액"], laborUnitPrice: ["인건비단가"], laborAmount: ["인건비금액"],
  remark: ["비고", "특이사항"],
} as const;

export function normalizeHeader(value: unknown): string { return String(value ?? "").toLowerCase().replace(/[\s.:()\[\]_-]/g, ""); }

export function findLikelyHeaderRow(matrix: ExcelMatrix): { rowIndex: number; matches: number } {
  let best = { rowIndex: -1, matches: 0 };
  matrix.slice(0, 40).forEach((row, rowIndex) => {
    const cells = row.map(normalizeHeader);
    const matches = Object.values(QUOTE_HEADER_ALIASES).filter((aliases) => aliases.some((a) => cells.includes(normalizeHeader(a)))).length;
    if (matches > best.matches) best = { rowIndex, matches };
  });
  return best;
}

export type InteriorCostColumns = {
  materialUnitPrice?: number; materialAmount?: number; laborUnitPrice?: number; laborAmount?: number; amount?: number;
};

export function mapInteriorCostHeaderBlock(matrix: ExcelMatrix, startRow: number, depth = 3): InteriorCostColumns {
  const result: InteriorCostColumns = {};
  const width = Math.max(0, ...matrix.slice(startRow, startRow + depth).map((row) => row.length));
  for (let column = 0; column < width; column++) {
    const path = matrix.slice(startRow, startRow + depth).map((row) => normalizeHeader(row[column])).filter(Boolean).join("");
    if (/자재(?:비)?.*단가/.test(path)) result.materialUnitPrice ??= column;
    else if (/자재(?:비)?.*금액/.test(path)) result.materialAmount ??= column;
    else if (/(?:인건비|노무비?).*단가/.test(path)) result.laborUnitPrice ??= column;
    else if (/(?:인건비|노무비?).*금액/.test(path)) result.laborAmount ??= column;
    else if (/총금액|합계금액/.test(path)) result.amount ??= column;
  }
  return result;
}
