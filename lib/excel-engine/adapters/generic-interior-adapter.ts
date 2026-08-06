import { parseInteriorQuoteWorkbook, type InteriorExcelParseResult } from "@/lib/crm/interior-quote-excel";
import { findLikelyHeaderRow } from "../header-mapper";
import type { QuoteExcelAdapter, WorkbookContext } from "../types";

export const genericInteriorAdapter: QuoteExcelAdapter<InteriorExcelParseResult> = {
  id: "generic-interior",
  label: "일반 인테리어 견적 양식",
  parse: parseInteriorQuoteWorkbook,
  recognize(context: WorkbookContext) {
    const best = Math.max(0, ...context.sheets.map((sheet) => findLikelyHeaderRow(sheet.matrix).matches));
    const confidence = Math.min(96, 34 + best * 9);
    return { confidence, reasons: best >= 4 ? [`견적 헤더 ${best}개 매핑`, "공통 인테리어 품목 구조 확인"] : [`견적 헤더 ${best}개만 확인되어 검토가 필요합니다.`] };
  },
};

export class GenericInteriorAdapter {
  readonly id = genericInteriorAdapter.id;
  readonly label = genericInteriorAdapter.label;
  recognize = genericInteriorAdapter.recognize;
  parse = genericInteriorAdapter.parse;
}
