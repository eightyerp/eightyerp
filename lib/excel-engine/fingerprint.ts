import { QUOTE_HEADER_ALIASES, normalizeHeader } from "./header-mapper";
import type { TemplateFingerprint, WorkbookContext } from "./types";

const SAFE_HEADERS = new Set(Object.values(QUOTE_HEADER_ALIASES).flat().map(normalizeHeader));
function fnv1a(value: string): string { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8, "0"); }
function cellShape(value: unknown): string {
  if (value == null || String(value).trim() === "") return "_";
  if (typeof value === "number") return "N";
  if (typeof value === "boolean") return "B";
  const normalized = normalizeHeader(value);
  return SAFE_HEADERS.has(normalized) ? `H:${normalized}` : "T";
}
export function fingerprintWorkbook(context: WorkbookContext): TemplateFingerprint {
  const descriptor = context.sheets.map((sheet) => {
    const width = sheet.matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const shape = sheet.matrix.slice(0, 60).map((row) => row.slice(0, 30).map(cellShape).join(",")).join(";");
    return `${sheet.matrix.length}x${width}|m:${sheet.merges.join(",")}|${shape}`;
  }).join("||");
  return { hash: `qxf-${fnv1a(descriptor)}`, descriptor };
}
