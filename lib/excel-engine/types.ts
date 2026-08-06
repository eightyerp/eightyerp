import type * as XLSX from "xlsx";

export type ExcelMatrix = unknown[][];
export type WorkbookContext = {
  workbook: XLSX.WorkBook;
  sheets: Array<{ name: string; matrix: ExcelMatrix; merges: string[] }>;
};
export type TemplateFingerprint = { hash: string; descriptor: string };
export type AdapterRecognition = { confidence: number; reasons: string[] };
export type TemplateRecognition = AdapterRecognition & {
  adapterId: string;
  label: string;
  fingerprint: string;
};
export interface QuoteExcelAdapter<TResult> {
  readonly id: string;
  readonly label: string;
  recognize(context: WorkbookContext): AdapterRecognition;
  parse(buffer: ArrayBuffer): TResult;
}
