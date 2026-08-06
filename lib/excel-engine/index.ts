import { genericInteriorAdapter } from "./adapters/generic-interior-adapter";
import { lxWindowAdapter } from "./adapters/lx-window-adapter";
import { fingerprintWorkbook } from "./fingerprint";
import { assertWorkbookSafe } from "./security-scanner";
import type { QuoteExcelAdapter, TemplateRecognition } from "./types";
import { readQuoteWorkbook } from "./workbook-reader";

export * from "./types";
export * from "./workbook-reader";
export * from "./security-scanner";
export * from "./matrix-normalizer";
export * from "./fingerprint";
export * from "./sheet-recognizer";
export * from "./header-mapper";
export * from "./column-mapper";
export * from "./adapters/lx-window-adapter";
export * from "./adapters/generic-interior-adapter";

const adapters: QuoteExcelAdapter<unknown>[] = [lxWindowAdapter, genericInteriorAdapter];

export function recognizeQuoteWorkbook(buffer: ArrayBuffer): TemplateRecognition {
  const context = readQuoteWorkbook(buffer);
  assertWorkbookSafe(context.workbook);
  const fingerprint = fingerprintWorkbook(context).hash;
  const winner = adapters.map((adapter) => ({ adapter, ...adapter.recognize(context) }))
    .sort((a, b) => b.confidence - a.confidence)[0];
  return { adapterId: winner.adapter.id, label: winner.adapter.label, confidence: winner.confidence, reasons: winner.reasons, fingerprint };
}
