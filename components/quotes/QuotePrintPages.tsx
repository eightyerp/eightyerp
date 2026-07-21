const QUOTE_PAGE_FOOTER_COMPANY = "주식회사 에잇티";

export type QuotePrintPage = {
  key: string;
  kind: "cover" | "body";
};

/** 명시적 A4 페이지 배열 (표지 선택 + 본문). 화면/인쇄/PDF 공통. */
export function buildQuotePrintPages(showCover: boolean): QuotePrintPage[] {
  const pages: QuotePrintPage[] = [];
  if (showCover) {
    pages.push({ key: "cover", kind: "cover" });
  }
  pages.push({ key: "body", kind: "body" });
  return pages;
}

export function QuotePageFooter({
  pageIndex,
  pageCount,
}: {
  pageIndex: number;
  pageCount: number;
}) {
  return (
    <div className="quote-print-page-footer" aria-hidden="true">
      <span className="quote-print-page-footer-company">
        {QUOTE_PAGE_FOOTER_COMPANY}
      </span>
      <span className="quote-print-page-footer-pages">
        {`${pageIndex + 1} / ${pageCount}`}
      </span>
    </div>
  );
}
