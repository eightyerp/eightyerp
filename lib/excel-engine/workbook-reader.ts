import * as XLSX from "xlsx";
import type { WorkbookContext } from "./types";
import { normalizeSheetMatrix } from "./matrix-normalizer";

export function readQuoteWorkbook(buffer: ArrayBuffer): WorkbookContext {
  const workbook = XLSX.read(buffer, { type: "array", cellFormula: true, cellNF: false, cellText: false });
  return {
    workbook,
    sheets: workbook.SheetNames.map((name) => ({
      name,
      matrix: normalizeSheetMatrix(workbook.Sheets[name]),
      merges: (workbook.Sheets[name]?.["!merges"] ?? []).map(XLSX.utils.encode_range),
    })),
  };
}
