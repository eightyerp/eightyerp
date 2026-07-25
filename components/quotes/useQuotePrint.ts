"use client";

import { useCallback, useEffect, useState } from "react";
import { buildQuotePdfFileName } from "@/lib/crm/quote-document";

/**
 * 견적 A4 인쇄 공통 흐름.
 * data-quote-printing + print portal 마운트 후 폰트·레이아웃 완료를 기다린 뒤 print().
 */
export function useQuotePrint(customerName?: string | null) {
  const [isPrinting, setIsPrinting] = useState(false);

  const startPrint = useCallback(() => {
    setIsPrinting(true);
  }, []);

  useEffect(() => {
    if (!isPrinting) return;

    const previousTitle = document.title;
    document.title = buildQuotePdfFileName(customerName).replace(/\.pdf$/i, "");
    document.body.setAttribute("data-quote-printing", "1");
    document.documentElement.setAttribute("data-quote-printing", "1");

    let finished = false;
    let cancelled = false;

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

    async function run() {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch {
        // ignore
      }
      // portal 마운트 + QuotePrintBodyPager 측정 완료 대기
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      await new Promise((r) => window.setTimeout(r, 120));
      if (cancelled) return;
      window.print();
    }

    void run();

    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", onAfterPrint);
      document.body.removeAttribute("data-quote-printing");
      document.documentElement.removeAttribute("data-quote-printing");
      document.title = previousTitle;
    };
  }, [isPrinting, customerName]);

  return { isPrinting, startPrint };
}
