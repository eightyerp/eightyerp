import { findLikelyHeaderRow } from "./header-mapper";
import type { WorkbookContext } from "./types";

export function rankQuoteSheets(context: WorkbookContext) {
  return context.sheets.map((sheet, index) => ({ index, name: sheet.name, ...findLikelyHeaderRow(sheet.matrix) }))
    .sort((a, b) => b.matches - a.matches || a.index - b.index);
}
