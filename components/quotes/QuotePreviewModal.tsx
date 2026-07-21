"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import QuoteDocumentView from "@/components/quotes/QuoteDocumentView";
import {
  buildQuotePdfFileName,
  type QuoteDocumentModel,
} from "@/lib/crm/quote-document";

type Props = {
  open: boolean;
  onClose: () => void;
  model: QuoteDocumentModel;
  /** 부모(위저드)와 표지 포함 여부를 동기화 */
  includeCover?: boolean;
  onIncludeCoverChange?: (value: boolean) => void;
};

function subscribeNoop() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export default function QuotePreviewModal({
  open,
  onClose,
  model,
  includeCover,
  onIncludeCoverChange,
}: Props) {
  const [variant, setVariant] = useState<"mobile" | "print">("print");
  const [localCover, setLocalCover] = useState(model.showCover !== false);
  const [isPrinting, setIsPrinting] = useState(false);
  const isClient = useIsClient();
  const showCover = includeCover ?? localCover;

  useEffect(() => {
    if (!isPrinting) return;

    const previousTitle = document.title;
    document.title = buildQuotePdfFileName(model.customerName).replace(
      /\.pdf$/i,
      "",
    );
    document.body.setAttribute("data-quote-printing", "1");
    document.documentElement.setAttribute("data-quote-printing", "1");

    let finished = false;

    function cleanup() {
      if (finished) return;
      finished = true;
      document.body.removeAttribute("data-quote-printing");
      document.documentElement.removeAttribute("data-quote-printing");
      document.title = previousTitle;
      setIsPrinting(false);
    }

    function onAfterPrint() {
      cleanup();
    }

    window.addEventListener("afterprint", onAfterPrint);

    const timer = window.setTimeout(() => {
      window.print();
    }, 80);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", onAfterPrint);
      document.body.removeAttribute("data-quote-printing");
      document.documentElement.removeAttribute("data-quote-printing");
      document.title = previousTitle;
    };
  }, [isPrinting, model.customerName]);

  if (!open || !isClient) return null;

  const docModel: QuoteDocumentModel = {
    ...model,
    showCover,
  };

  /** 인쇄는 항상 A4 print variant만 사용 (모바일 미리보기 제외) */
  const printModel: QuoteDocumentModel = {
    ...model,
    showCover,
  };

  function setShowCover(value: boolean) {
    if (onIncludeCoverChange) onIncludeCoverChange(value);
    else setLocalCover(value);
  }

  function handlePrint() {
    setIsPrinting(true);
  }

  return createPortal(
    <>
      <div
        data-quote-preview-ui=""
        className="quote-preview-overlay fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-2 sm:p-4"
      >
        <div className="quote-preview-shell flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                견적서 미리보기
              </p>
              <p className="text-xs text-slate-600">
                저장하지 않은 현재 작성 내용입니다.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                PDF 저장 시 배경 그래픽을 켜고, 머리글과 바닥글을 꺼주세요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={showCover}
                  onChange={(e) => setShowCover(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                표지 포함
              </label>
              <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setVariant("print")}
                  className={`rounded-md px-2.5 py-1.5 font-medium ${
                    variant === "print"
                      ? "bg-navy-900 text-white"
                      : "text-slate-600"
                  }`}
                >
                  PC/A4
                </button>
                <button
                  type="button"
                  onClick={() => setVariant("mobile")}
                  className={`rounded-md px-2.5 py-1.5 font-medium ${
                    variant === "mobile"
                      ? "bg-navy-900 text-white"
                      : "text-slate-600"
                  }`}
                >
                  모바일
                </button>
              </div>
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
              >
                인쇄 / PDF 저장
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>

          <div
            className={`quote-preview-scroll flex-1 overflow-y-auto ${
              variant === "print" ? "bg-slate-100 p-4" : "bg-white"
            }`}
          >
            <div
              className={
                variant === "print"
                  ? "quote-preview-sheet mx-auto w-[210mm] max-w-full"
                  : "quote-preview-sheet"
              }
            >
              <QuoteDocumentView model={docModel} variant={variant} />
            </div>
          </div>
        </div>
      </div>

      {isPrinting
        ? (
            <div data-quote-print-portal="" className="quote-print-portal">
              <QuoteDocumentView
                model={printModel}
                variant="print"
                className="quote-print-document"
              />
            </div>
          )
        : null}
    </>,
    document.body,
  );
}
