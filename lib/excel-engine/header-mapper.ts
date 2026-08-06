import type { ExcelMatrix } from "./types";

export const QUOTE_HEADER_ALIASES = {
  trade: ["공종", "구분", "분류"], item: ["품목", "품명", "제품명", "모델명"], spec: ["규격", "사양"],
  quantity: ["수량", "qty"], unit: ["단위"], unitPrice: ["단가"], amount: ["금액", "합계"], remark: ["비고", "특이사항"],
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
