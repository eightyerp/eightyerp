/** 견적 저장 성공 후 목록 화면 1회성 안내 (개인정보·금액 저장 금지) */
export const QUOTE_LIST_FLASH_KEY = "eighty-erp:quote-list-flash-v1";

export type QuoteListFlash = {
  quoteId: string;
  mode: "create" | "update";
  savedAt: number;
};

export function writeQuoteListFlash(flash: QuoteListFlash): void {
  try {
    window.sessionStorage.setItem(QUOTE_LIST_FLASH_KEY, JSON.stringify(flash));
  } catch {
    /* ignore */
  }
}

/** 목록 진입 시 1회 읽고 즉시 제거 */
export function consumeQuoteListFlash(): QuoteListFlash | null {
  try {
    const raw = window.sessionStorage.getItem(QUOTE_LIST_FLASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(QUOTE_LIST_FLASH_KEY);
    const parsed = JSON.parse(raw) as QuoteListFlash;
    if (!parsed?.quoteId || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    try {
      window.sessionStorage.removeItem(QUOTE_LIST_FLASH_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}
