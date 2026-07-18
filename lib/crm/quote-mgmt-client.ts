import type { ErpQuote } from "@/types/database";

/** 클라이언트에서 사용 가능한 순수 헬퍼 (서버 모듈 금지) */
export function calcQuoteSummary(quotes: ErpQuote[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = quotes.filter(
    (q) => new Date(q.created_at) >= monthStart,
  );
  return {
    totalCount: quotes.length,
    drafting: quotes.filter((q) => q.status === "작성중").length,
    sent: quotes.filter((q) => q.status === "발송완료").length,
    contracted: quotes.filter(
      (q) => q.status === "계약전환" || q.is_contract_quote,
    ).length,
    monthAmount: thisMonth.reduce((s, q) => s + (q.final_amount || 0), 0),
    monthContractAmount: thisMonth
      .filter((q) => q.is_contract_quote || q.status === "계약전환")
      .reduce((s, q) => s + (q.final_amount || 0), 0),
  };
}

export function isQuoteExpired(quote: ErpQuote): boolean {
  if (!quote.valid_until) return false;
  if (quote.status === "만료") return true;
  if (["계약전환", "취소"].includes(quote.status)) return false;
  const end = new Date(`${quote.valid_until}T23:59:59`);
  return end.getTime() < Date.now();
}

export function formatWonInput(value: number | string): string {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

export function parseWonInput(value: string): number {
  const n = Number(String(value).replace(/,/g, "").trim() || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
