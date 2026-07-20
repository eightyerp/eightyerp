import {
  computeQuoteAmounts,
  formatQuoteUnit,
  groupQuoteItemsByTrade,
  quoteDocumentTitle,
  resolveTradeDisplayName,
} from "@/lib/crm/quote-constants";

export type QuoteDocumentItem = {
  trade_name: string;
  item_name: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount: number;
  cost_type?: string | null;
  is_lx_material?: boolean | null;
  lx_discount_base_amount?: number | null;
  lx_discount_type?: string | null;
  lx_discount_value?: number | null;
  sort_order?: number;
};

export type QuoteDocumentModel = {
  customerName: string;
  title: string;
  quoteType?: string | null;
  quoteMode?: string | null;
  quoteNumber?: string | null;
  versionNumber?: number | null;
  status?: string | null;
  validUntil?: string | null;
  issuedAt?: string | null;
  customerMessage?: string | null;
  discountAmount: number;
  lxDiscountRate: number;
  items: QuoteDocumentItem[];
  showCover?: boolean;
  /** 회사별 표지 브랜드. 없으면 단순 표지 */
  brand?: import("@/lib/crm/quote-brand-shared").QuoteBrandProfile | null;
};

export type QuoteDocumentLine = QuoteDocumentItem & {
  tradeLabel: string;
  lineTitle: string;
  unitLabel: string;
  listAmount: number;
  lxBase: number;
  lxDiscount: number;
  netAmount: number;
};

export type QuoteDocumentViewModel = {
  model: QuoteDocumentModel;
  documentTitle: string;
  lines: QuoteDocumentLine[];
  groups: Array<{
    tradeLabel: string;
    lines: QuoteDocumentLine[];
    /** 공종 소계 = 해당 공종 항목 최종금액(할인 후) 합 */
    subtotal: number;
    lxDiscount: number;
  }>;
  totals: {
    /** 항목 정가(기본금액) 합 */
    total_amount: number;
    /** 공종 소계의 합 = 항목 최종금액 합 (= total_amount - lx_discount_amount) */
    items_net_total: number;
    discount_amount: number;
    lx_discount_rate: number;
    lx_discount_amount: number;
    final_amount: number;
    lx_material_sum: number;
  };
};

/**
 * 미리보기·공유·인쇄 공통 견적 문서 뷰모델.
 * 금액은 computeQuoteAmounts 단일 계산 결과를 재사용한다.
 */
export function buildQuoteDocumentViewModel(
  model: QuoteDocumentModel,
): QuoteDocumentViewModel {
  const amounts = computeQuoteAmounts({
    items: model.items,
    discountAmount: model.discountAmount,
    lxDiscountRate: model.lxDiscountRate,
  });

  const isSimple = model.quoteMode !== "detailed";

  const lines: QuoteDocumentLine[] = model.items.map((item, index) => {
    const perItem = amounts.item_discounts[index] ?? {
      amount: Math.max(0, Math.round(Number(item.amount) || 0)),
      base: 0,
      discount: 0,
      after: Math.max(0, Math.round(Number(item.amount) || 0)),
    };
    const tradeLabel = resolveTradeDisplayName(
      item.trade_name,
      item.item_name,
      model.quoteMode,
    );
    const lineTitle = isSimple
      ? item.item_name || item.trade_name || "항목"
      : item.item_name || item.trade_name || "품목";

    return {
      ...item,
      tradeLabel,
      lineTitle,
      unitLabel: formatQuoteUnit(item.unit),
      listAmount: perItem.amount,
      lxBase: perItem.base,
      lxDiscount: perItem.discount,
      netAmount: perItem.after,
    };
  });

  const grouped = groupQuoteItemsByTrade(
    lines.map((line, index) => ({
      ...line,
      sort_order: line.sort_order ?? index,
    })),
    model.quoteMode,
  );

  const groups = grouped.map((g) => {
    const groupLines = g.items as QuoteDocumentLine[];
    return {
      tradeLabel: g.tradeLabel,
      lines: groupLines,
      subtotal: groupLines.reduce((s, i) => s + i.netAmount, 0),
      lxDiscount: groupLines.reduce((s, i) => s + i.lxDiscount, 0),
    };
  });

  const items_net_total = groups.reduce((s, g) => s + g.subtotal, 0);

  return {
    model,
    documentTitle: quoteDocumentTitle(model.quoteMode),
    lines,
    groups,
    totals: {
      total_amount: amounts.total_amount,
      items_net_total,
      discount_amount: amounts.discount_amount,
      lx_discount_rate: amounts.lx_discount_rate,
      lx_discount_amount: amounts.lx_discount_amount,
      final_amount: amounts.final_amount,
      lx_material_sum: amounts.lx_material_sum,
    },
  };
}

export function sanitizeQuoteFileBaseName(customerName?: string | null): string {
  const trimmed = (customerName ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "");
  const safe = trimmed
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return safe || "에잇티";
}

export function buildQuotePdfFileName(customerName?: string | null): string {
  const base = sanitizeQuoteFileBaseName(customerName);
  return base === "에잇티" ? "에잇티_견적서.pdf" : `${base}_견적서.pdf`;
}

export function buildQuoteSharePageTitle(customerName?: string | null): string {
  const name = (customerName ?? "").trim();
  return name ? `${name} 고객님 견적서 | 에잇티` : "견적서 | 에잇티";
}

/** 공유 URL의 cover 쿼리 파싱. 기본값 true(표지 포함). */
export function parseQuoteCoverParam(
  value: string | string[] | null | undefined,
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw === "") return true;
  const normalized = String(raw).trim().toLowerCase();
  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off" ||
    normalized === "no"
  );
}

/** 미리보기·공유·PDF에 동일한 표지 포함 여부를 URL에 반영 */
export function withQuoteCoverQuery(
  url: string,
  includeCover: boolean,
): string {
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    const parsed = new URL(url, base);
    if (includeCover) {
      parsed.searchParams.delete("cover");
    } else {
      parsed.searchParams.set("cover", "0");
    }
    // 절대 URL이 들어오면 절대 URL로, 상대면 pathname+search 유지
    if (/^https?:\/\//i.test(url)) {
      return parsed.toString();
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    if (includeCover) {
      return url.replace(/([?&])cover=[^&]*&?/g, "$1").replace(/[?&]$/, "");
    }
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}cover=0`;
  }
}
