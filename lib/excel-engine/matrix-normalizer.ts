import * as XLSX from "xlsx";
import type { ExcelMatrix } from "./types";

export function normalizeSheetMatrix(sheet: XLSX.WorkSheet | undefined): ExcelMatrix {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  let lastRow = rows.length - 1;
  while (lastRow >= 0 && rows[lastRow].every((cell) => cell == null || String(cell).trim() === "")) lastRow--;
  const trimmed = rows.slice(0, lastRow + 1);
  let width = 0;
  for (const row of trimmed) for (let i = row.length - 1; i >= 0; i--) if (row[i] != null && String(row[i]).trim() !== "") { width = Math.max(width, i + 1); break; }
  return trimmed.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? null));
}
