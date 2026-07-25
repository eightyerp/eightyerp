import {
  computeQuoteAmounts,
  formatLxDiscountSummaryLabel,
  formatQuoteUnit,
  groupQuoteItemsByTrade,
  quoteDocumentTitle,
  resolveQuoteVatDisplayAmounts,
  resolveTradeDisplayName,
  type QuoteVatMode,
} from "@/lib/crm/quote-constants";

export type QuoteDocumentItem = {
  trade_name: string;
  item_name: string | null;
  description?: string | null;
  /** 항목별 선택 비고. 없으면 출력 생략 */
  remark?: string | null;
  quantity?: number | null;
  unit?: string | null;
  /** 단가(원). 표시용 — 계산 재실행 금지 */
  unit_price?: number | null;
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
  /** true면 확정 견적번호 대신 저장 전 상태 표시 */
  isDraft?: boolean;
  versionNumber?: number | null;
  status?: string | null;
  validUntil?: string | null;
  issuedAt?: string | null;
  customerMessage?: string | null;
  discountAmount: number;
  /** 특별할인 메모 (금액 있을 때만 출력 라벨에 반영) */
  specialDiscountMemo?: string | null;
  lxDiscountRate: number;
  /** 회사/견적 VAT 입력 방식. null = legacy */
  vatMode?: QuoteVatMode | null;
  vatRate?: number | null;
  /** 저장된 snapshot (있으면 표시 우선) */
  supplyAmount?: number | null;
  vatAmount?: number | null;
  customerTotalAmount?: number | null;
  items: QuoteDocumentItem[];
  showCover?: boolean;
  /** 회사별 표지 브랜드. 없으면 단순 표지 */
  brand?: import("@/lib/crm/quote-brand-shared").QuoteBrandProfile | null;
  /** 표지 담당자·회사 연락 (스냅샷 우선, 없으면 live fallback) */
  assigneeName?: string | null;
  assigneeTitle?: string | null;
  assigneePhone?: string | null;
  assigneeEmail?: string | null;
  /** 명함 표시 여부 (스냅샷/fallback) */
  assigneeShowBusinessCard?: boolean | null;
  /** 서버에서 만든 명함 signed URL. path는 노출하지 않음 */
  assigneeCardImageUrl?: string | null;
  companyBusinessNumber?: string | null;
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
    /** 특별할인 메모 원문 (라벨 조합용) */
    special_discount_memo: string | null;
    lx_discount_rate: number;
    lx_discount_amount: number;
    /** LX 할인 표시 라벨 (예: 10% · 110,000원) */
    lx_discount_label: string;
    /** 할인 후 금액(= 공급가 기준 입력, exclusive 시 공급가액) */
    final_amount: number;
    vat_mode: QuoteVatMode | null;
    vat_rate: number | null;
    supply_amount: number;
    vat_amount: number;
    /** 고객 최종금액 (VAT 별도: 공급가+부가세) */
    customer_total_amount: number;
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

  // 항목·금액이 없는 공종(예: 준비공사만 추가하고 미입력)은 합계표·상세·PDF에서 제외
  const groups = grouped
    .map((g) => {
      const groupLines = (g.items as QuoteDocumentLine[]).filter((line) => {
        const named = Boolean(
          (line.item_name ?? "").trim() ||
            (line.lineTitle &&
              line.lineTitle !== "품목" &&
              line.lineTitle !== "항목"),
        );
        return named || line.listAmount > 0 || line.netAmount > 0;
      });
      return {
        tradeLabel: g.tradeLabel,
        lines: groupLines,
        subtotal: groupLines.reduce((s, i) => s + i.netAmount, 0),
        lxDiscount: groupLines.reduce((s, i) => s + i.lxDiscount, 0),
      };
    })
    .filter((g) => g.lines.length > 0);

  const items_net_total = groups.reduce((s, g) => s + g.subtotal, 0);

  const vat = resolveQuoteVatDisplayAmounts({
    discountedAmount: amounts.final_amount,
    vatMode: model.vatMode,
    vatRate: model.vatRate,
    supplyAmount: model.supplyAmount,
    vatAmount: model.vatAmount,
    customerTotalAmount: model.customerTotalAmount,
  });

  const lx_discount_label = formatLxDiscountSummaryLabel({
    items: model.items,
    quoteLevelRate: model.lxDiscountRate,
    lxDiscountAmount: amounts.lx_discount_amount,
  });

  return {
    model,
    documentTitle: quoteDocumentTitle(model.quoteMode),
    lines,
    groups,
    totals: {
      total_amount: amounts.total_amount,
      items_net_total,
      discount_amount: amounts.discount_amount,
      special_discount_memo: (() => {
        const text = String(model.specialDiscountMemo ?? "").trim();
        return text ? text.slice(0, 40) : null;
      })(),
      lx_discount_rate: amounts.lx_discount_rate,
      lx_discount_amount: amounts.lx_discount_amount,
      lx_discount_label,
      final_amount: amounts.final_amount,
      vat_mode: vat.vat_mode,
      vat_rate: vat.vat_rate,
      supply_amount: vat.supply_amount,
      vat_amount: vat.vat_amount,
      customer_total_amount: vat.customer_total_amount,
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

/** 수량 표시: 불필요한 소수 0 제거 (1.00→1, 32.0→32, 1.5→1.5) */
export function formatQuoteQuantityDisplay(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const n = Number(value);
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

/** 고객용 특별할인 라벨. 메모 없으면 '특별할인' */
export function formatSpecialDiscountLabel(
  memo?: string | null,
): string {
  const text = String(memo ?? "").trim();
  if (!text) return "특별할인";
  const clipped = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return `특별할인 (${clipped})`;
}
