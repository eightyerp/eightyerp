"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import QuoteA4PreviewFrame from "@/components/quotes/QuoteA4PreviewFrame";
import QuoteDocumentView from "@/components/quotes/QuoteDocumentView";
import QuoteShareDownloadLink from "@/components/quotes/QuoteShareDownloadLink";
import { useQuotePrint } from "@/components/quotes/useQuotePrint";
import type { QuoteDocumentModel } from "@/lib/crm/quote-document";

export type QuoteShareFile = {
  id: string;
  file_name: string;
  file_type: string;
  signedUrl?: string;
};

type Props = {
  model: QuoteDocumentModel;
  files: QuoteShareFile[];
  primaryPdfId?: string | null;
};

function subscribeNoop() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/**
 * 고객전송 링크 화면.
 * 화면 미리보기·인쇄 모두 내부 미리보기와 동일한 QuoteDocumentView(print) + print portal 사용.
 */
export default function QuoteCustomerShareView({
  model,
  files,
  primaryPdfId = null,
}: Props) {
  const isClient = useIsClient();
  const { isPrinting, startPrint } = useQuotePrint(model.customerName);
  const primaryPdf = files.find((f) => f.id === primaryPdfId);

  return (
    <main className="quote-share-page min-h-screen bg-slate-100">
      <div
        data-quote-preview-ui=""
        className="quote-share-toolbar sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur"
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-900">
              {model.customerName || "고객"} 견적서
            </p>
            <p className="text-xs text-slate-500">
              A4 미리보기 · 인쇄 시 페이지 분할·번호가 적용됩니다
            </p>
          </div>
          <button
            type="button"
            onClick={startPrint}
            disabled={isPrinting || !isClient}
            className="rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
          >
            {isPrinting ? "인쇄 준비 중…" : "인쇄·PDF 저장"}
          </button>
        </div>
      </div>

      <div className="quote-share-preview mx-auto max-w-4xl px-2 py-4 sm:px-4 sm:py-6">
        <QuoteA4PreviewFrame>
          <QuoteDocumentView model={model} variant="print" />
        </QuoteA4PreviewFrame>
      </div>

      <div
        data-quote-preview-ui=""
        className="quote-share-files mx-auto max-w-3xl space-y-6 px-4 pb-10"
      >
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy-900">첨부파일</h2>
          {files.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">첨부파일이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    {f.file_name}
                    <span className="ml-2 text-xs text-gray-400">
                      {f.file_type.toUpperCase()}
                    </span>
                  </span>
                  {f.signedUrl ? (
                    <div className="flex flex-wrap gap-2">
                      {f.file_type === "pdf" ? (
                        <a
                          href={f.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-navy-800 px-3 py-1.5 text-xs font-medium text-navy-800"
                        >
                          미리보기
                        </a>
                      ) : null}
                      <QuoteShareDownloadLink
                        href={f.signedUrl}
                        customerName={model.customerName}
                        fileType={f.file_type}
                        className="rounded-md bg-navy-800 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        다운로드
                      </QuoteShareDownloadLink>
                    </div>
                  ) : (
                    <span className="text-xs text-red-500">링크 생성 실패</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {primaryPdf?.signedUrl ? (
            <div className="mt-4 overflow-hidden rounded-lg border">
              <iframe
                title="견적 PDF"
                src={primaryPdf.signedUrl}
                className="h-[70vh] w-full"
              />
            </div>
          ) : null}
        </section>

        <p className="text-center text-xs text-slate-500">
          ※ 원가·마진·내부 메모 등 직원 전용 정보는 표시되지 않습니다.
        </p>
      </div>

      {isClient && isPrinting
        ? createPortal(
            <div data-quote-print-portal="" className="quote-print-portal">
              <QuoteDocumentView
                model={model}
                variant="print"
                className="quote-print-document"
              />
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}
