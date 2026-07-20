export const ERP_QUOTE_TYPES = ["창호", "인테리어", "기타"] as const;

export const ERP_QUOTE_STATUSES = [
  "작성중",
  "검토중",
  "발송완료",
  "수정요청",
  "승인",
  "계약전환",
  "만료",
  "취소",
] as const;

export const ERP_QUOTE_STATUS_BADGE: Record<string, string> = {
  작성중: "bg-gray-100 text-gray-600",
  검토중: "bg-sky-50 text-sky-700",
  발송완료: "bg-blue-50 text-blue-700",
  수정요청: "bg-orange-50 text-orange-700",
  승인: "bg-emerald-50 text-emerald-700",
  계약전환: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
  만료: "bg-red-50 text-red-700",
  취소: "bg-slate-100 text-slate-500",
};

/** 창호·인테리어·기타 공통 공종 빠른 추가 목록 */
export const TRADE_SUGGESTIONS = [
  "철거",
  "설비",
  "창호",
  "목공",
  "전기",
  "타일",
  "욕실",
  "주방",
  "필름",
  "도배",
  "바닥재",
  "도어",
  "중문",
  "가구",
  "조명",
  "기타",
] as const;

/** @deprecated TRADE_SUGGESTIONS 사용 */
export const INTERIOR_TRADE_SUGGESTIONS = TRADE_SUGGESTIONS;

export const QUOTE_MODES = ["simple", "detailed"] as const;
export type QuoteMode = (typeof QUOTE_MODES)[number];

/** DB·계산용 canonical cost_type (CHECK: 자재|시공|시공+자재|기타) */
export const QUOTE_COST_TYPES = ["자재", "시공", "시공+자재", "기타"] as const;
export type QuoteCostType = (typeof QUOTE_COST_TYPES)[number];

/** LX 체크 가능한 구분 (canonical) */
export const QUOTE_LX_COST_TYPES = ["자재", "시공+자재"] as const;

/**
 * UI 라벨·레거시 별칭 → DB canonical.
 * 화면 표시는 `자재+시공`, 저장값은 반드시 `시공+자재`.
 */
export function normalizeQuoteCostType(
  value?: string | null,
): QuoteCostType {
  const raw = String(value ?? "").trim();
  if (raw === "자재+시공") return "시공+자재";
  if ((QUOTE_COST_TYPES as readonly string[]).includes(raw)) {
    return raw as QuoteCostType;
  }
  return "기타";
}

/** 사용자에게 보이는 구분 라벨 */
export function quoteCostTypeLabel(value?: string | null): string {
  const canonical = normalizeQuoteCostType(value);
  return canonical === "시공+자재" ? "자재+시공" : canonical;
}

export const QUOTE_MODE_LABELS: Record<QuoteMode, string> = {
  simple: "간편견적",
  detailed: "상세견적",
};

/** 항목 표/문서 섹션 제목 */
export const QUOTE_DOCUMENT_TITLES: Record<QuoteMode, string> = {
  simple: "간편견적서",
  detailed: "상세견적서",
};

export function quoteDocumentTitle(mode?: string | null): string {
  return mode === "detailed"
    ? QUOTE_DOCUMENT_TITLES.detailed
    : QUOTE_DOCUMENT_TITLES.simple;
}

export function canCostTypeHaveLx(costType?: string | null): boolean {
  return (QUOTE_LX_COST_TYPES as readonly string[]).includes(
    normalizeQuoteCostType(costType),
  );
}

/** 견적 단위 목록 (표시명 / 저장값). unit 컬럼은 text — migration 불필요 */
export const QUOTE_UNITS = [
  { value: "㎡", label: "㎡" },
  { value: "py", label: "평" },
  { value: "개", label: "개" },
  { value: "식", label: "식" },
  { value: "m", label: "m" },
  { value: "세트", label: "세트" },
  { value: "회", label: "회" },
] as const;

export type QuoteUnitValue = (typeof QUOTE_UNITS)[number]["value"] | string;

export function formatQuoteUnit(unit?: string | null): string {
  const raw = (unit ?? "").trim();
  if (!raw) return "";
  const found = QUOTE_UNITS.find((u) => u.value === raw);
  return found ? found.label : raw;
}

export const LX_DISCOUNT_TYPES = ["none", "rate", "fixed"] as const;
export type LxDiscountType = (typeof LX_DISCOUNT_TYPES)[number];

export function resolveTradeDisplayName(
  tradeName?: string | null,
  itemName?: string | null,
  quoteMode?: string | null,
): string {
  const trade = (tradeName ?? "").trim();
  const item = (itemName ?? "").trim();
  if (!trade || trade === "미분류") return "미분류";
  // 간편견적 레거시: trade_name === item_name 으로 저장되던 경우 → 미분류
  if (quoteMode !== "detailed" && item && trade === item) return "미분류";
  return trade;
}

export function groupQuoteItemsByTrade<
  T extends {
    trade_name?: string | null;
    item_name?: string | null;
    sort_order?: number | null;
  },
>(
  items: T[],
  quoteMode?: string | null,
): Array<{ tradeLabel: string; items: T[] }> {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const label = resolveTradeDisplayName(
      item.trade_name,
      item.item_name,
      quoteMode,
    );
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(item);
  }
  return order.map((tradeLabel) => ({
    tradeLabel,
    items: map.get(tradeLabel)!,
  }));
}

/**
 * LX 할인 대상 금액 (항목 단위)
 * - 자재 + LX: 항목 전체 금액 (lx_discount_base_amount=0 이어도 호환)
 * - 시공+자재 + LX: 사용자가 입력한 lx_discount_base_amount
 */
export function lxDiscountBaseForItem(row: {
  amount: number;
  cost_type?: string | null;
  is_lx_material?: boolean | null;
  lx_discount_base_amount?: number | null;
}): number {
  const costType = normalizeQuoteCostType(row.cost_type);
  if (!row.is_lx_material || !canCostTypeHaveLx(costType)) return 0;
  const amount = Math.max(0, Math.round(Number(row.amount) || 0));
  if (costType === "자재") return amount;
  const base = Math.max(0, Math.round(Number(row.lx_discount_base_amount) || 0));
  return Math.min(base, amount);
}

export type QuoteAmountItemInput = {
  trade_name?: string | null;
  item_name?: string | null;
  amount: number;
  cost_type?: string | null;
  is_lx_material?: boolean | null;
  lx_discount_base_amount?: number | null;
  /** null/undefined = 기존 견적 단위 할인율 적용 */
  lx_discount_type?: string | null;
  lx_discount_value?: number | null;
};

export type QuoteItemDiscountBreakdown = {
  trade_name?: string | null;
  item_name?: string | null;
  amount: number;
  base: number;
  discount: number;
  after: number;
};

function normalizeLxDiscountType(
  value: string | null | undefined,
): LxDiscountType | null {
  if (value == null || value === "") return null;
  if ((LX_DISCOUNT_TYPES as readonly string[]).includes(value)) {
    return value as LxDiscountType;
  }
  return null;
}

/** 항목 1개의 LX 할인액 (원). 시공비 등 비LX는 0 */
export function computeItemLxDiscountAmount(
  row: QuoteAmountItemInput,
  quoteLevelRate: number,
): QuoteItemDiscountBreakdown {
  const amount = Math.max(0, Math.round(Number(row.amount) || 0));
  const base = lxDiscountBaseForItem(row);
  if (base <= 0) {
    return {
      trade_name: row.trade_name,
      item_name: row.item_name,
      amount,
      base: 0,
      discount: 0,
      after: amount,
    };
  }

  const type = normalizeLxDiscountType(row.lx_discount_type);
  let discount = 0;

  if (type === "none") {
    discount = 0;
  } else if (type === "rate") {
    const rateRaw = Number(row.lx_discount_value ?? 0);
    const rate = Number.isFinite(rateRaw)
      ? Math.min(100, Math.max(0, Math.round(rateRaw * 100) / 100))
      : 0;
    discount = Math.round((base * rate) / 100);
  } else if (type === "fixed") {
    const fixedRaw = Number(row.lx_discount_value ?? 0);
    const fixed = Number.isFinite(fixedRaw)
      ? Math.max(0, Math.round(fixedRaw))
      : 0;
    discount = Math.min(base, fixed);
  } else {
    // 기존 호환: 견적 단위 할인율
    const rate = Number.isFinite(quoteLevelRate)
      ? Math.min(100, Math.max(0, Math.round(quoteLevelRate * 100) / 100))
      : 0;
    discount = Math.round((base * rate) / 100);
  }

  return {
    trade_name: row.trade_name,
    item_name: row.item_name,
    amount,
    base,
    discount,
    after: Math.max(0, amount - discount),
  };
}

/** 화면·서버 공통 금액 계산 (클라이언트 최종금액을 신뢰하지 않음) */
export function computeQuoteAmounts(input: {
  items: QuoteAmountItemInput[];
  /** 항목이 없을 때(상세·선택 공종) 사용할 총견적금액 */
  fallbackTotal?: number;
  discountAmount: number;
  lxDiscountRate: number;
}): {
  total_amount: number;
  discount_amount: number;
  lx_discount_rate: number;
  lx_discount_amount: number;
  final_amount: number;
  is_lx_material: boolean;
  lx_material_sum: number;
  item_discounts: QuoteItemDiscountBreakdown[];
} {
  const hasItems = input.items.length > 0;
  const total = hasItems
    ? input.items.reduce(
        (sum, row) => sum + Math.max(0, Math.round(Number(row.amount) || 0)),
        0,
      )
    : Math.max(0, Math.round(Number(input.fallbackTotal) || 0));

  const rateRaw = Number(input.lxDiscountRate);
  const lxDiscountRate = Number.isFinite(rateRaw)
    ? Math.min(100, Math.max(0, Math.round(rateRaw * 100) / 100))
    : 0;

  const item_discounts = input.items.map((row) =>
    computeItemLxDiscountAmount(row, lxDiscountRate),
  );

  const lxMaterialSum = item_discounts.reduce((sum, row) => sum + row.base, 0);
  const lxDiscountAmount = item_discounts.reduce(
    (sum, row) => sum + row.discount,
    0,
  );

  const discountAmount = Math.max(
    0,
    Math.round(Number(input.discountAmount) || 0),
  );
  const finalAmount = Math.max(0, total - discountAmount - lxDiscountAmount);
  const isLxMaterial = input.items.some(
    (row) => Boolean(row.is_lx_material) && canCostTypeHaveLx(row.cost_type),
  );

  return {
    total_amount: total,
    discount_amount: discountAmount,
    lx_discount_rate: lxDiscountRate,
    lx_discount_amount: lxDiscountAmount,
    final_amount: finalAmount,
    is_lx_material: isLxMaterial,
    lx_material_sum: lxMaterialSum,
    item_discounts,
  };
}

export const QUOTE_FILES_BUCKET = "quote-files";
export const QUOTE_FILE_MAX_BYTES = 30 * 1024 * 1024;
export const QUOTE_FILE_EXTENSIONS = ["pdf", "xls", "xlsx"] as const;

export function buildQuoteGuideMessage(input: {
  customerName: string;
  title: string;
  validUntil?: string | null;
  finalAmount?: number | null;
  viewUrl?: string | null;
  customerMessage?: string | null;
}): string {
  if (input.customerMessage?.trim()) {
    const custom = input.customerMessage.trim();
    return input.viewUrl
      ? `${custom}\n\n견적 확인: ${input.viewUrl}`
      : custom;
  }

  const lines = [
    "안녕하세요. 에잇티입니다.",
    "요청하신 견적서를 보내드립니다.",
    "견적 유효기간과 세부 내용을 확인해 주세요.",
    "궁금하신 사항은 담당자에게 연락 부탁드립니다.",
  ];
  if (input.title) {
    lines.splice(2, 0, `견적명: ${input.title}`);
  }
  if (input.validUntil) {
    lines.push(`유효기간: ${input.validUntil}`);
  }
  if (input.viewUrl) {
    lines.push("");
    lines.push(`견적 확인 링크: ${input.viewUrl}`);
  }
  lines.push("");
  lines.push("감사합니다. — 주식회사 에잇티");
  return lines.join("\n");
}
