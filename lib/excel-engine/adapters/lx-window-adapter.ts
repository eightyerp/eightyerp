import { parseLxWindowExcelBuffer, type LxImportParseResult } from "@/lib/crm/lx-window-excel";
import { findLikelyHeaderRow, normalizeHeader } from "../header-mapper";
import type { QuoteExcelAdapter, WorkbookContext } from "../types";

export const lxWindowAdapter: QuoteExcelAdapter<LxImportParseResult> = {
  id: "lx-window",
  label: "LX 창호 견적 양식",
  parse: parseLxWindowExcelBuffer,
  recognize(context: WorkbookContext) {
    const text = context.sheets.flatMap((sheet) => sheet.matrix.slice(0, 35).flat()).map(normalizeHeader);
    const signals = ["lx", "창호", "방충망", "유리", "표준시공비", "완성창총금액"];
    const found = signals.filter((signal) => text.some((cell) => cell.includes(normalizeHeader(signal))));
    const header = Math.max(0, ...context.sheets.map((sheet) => findLikelyHeaderRow(sheet.matrix).matches));
    const confidence = Math.min(99, 18 + found.length * 13 + Math.min(header, 4) * 3);
    return { confidence, reasons: found.length ? [`LX/창호 구조 신호 ${found.length}개`, ...found.slice(0, 3).map((v) => `‘${v}’ 항목 확인`)] : ["LX 전용 구조 신호가 부족합니다."] };
  },
};

export class LxWindowAdapter {
  readonly id = lxWindowAdapter.id;
  readonly label = lxWindowAdapter.label;
  recognize = lxWindowAdapter.recognize;
  parse = lxWindowAdapter.parse;
}
