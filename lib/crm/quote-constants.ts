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
  작성중: "bg-slate-100 text-slate-900",
  검토중: "bg-sky-100 text-sky-900",
  발송완료: "bg-sky-100 text-sky-900",
  수정요청: "bg-orange-50 text-orange-700",
  승인: "bg-emerald-100 text-emerald-900",
  계약전환: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
  만료: "bg-red-50 text-red-700",
  취소: "bg-slate-100 text-slate-900",
};

/** 상세견적 기본 대표공종 (작성 화면 기본 표시·순서) */
export const TRADE_SUGGESTIONS = [
  "준비공사",
  "확장공사",
  "철거공사",
  "창호공사",
  "설비공사",
  "목공사",
  "도어·중문공사",
  "도장·필름공사",
  "욕실공사",
  "도배공사",
  "바닥공사",
  "타일공사",
  "주방·가구공사",
  "전기·조명공사",
  "기타공사",
  "공과잡비",
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
  { value: "SET", label: "SET" },
  { value: "회", label: "회" },
] as const;

export type QuoteUnitValue = (typeof QUOTE_UNITS)[number]["value"] | string;

export function formatQuoteUnit(unit?: string | null): string {
  const raw = (unit ?? "").trim();
  if (!raw) return "";
  const found = QUOTE_UNITS.find((u) => u.value === raw);
  return found ? found.label : raw;
}

/**
 * 견적 금액은 항상 원(won) 정수.
 * 만원 입력·×10000 변환은 하지 않는다. (경쟁사 UX와 같이 단위를 명시하고 상한으로 실수 방지)
 */
export const QUOTE_MONEY_UNIT_LABEL = "원";

/** 항목 단가·금액 경고 (10억 원) — 저장은 허용, UI 경고 */
export const QUOTE_LINE_AMOUNT_WARN = 1_000_000_000;
/** 항목 단가·금액 거부 (100억 원) */
export const QUOTE_LINE_AMOUNT_MAX = 10_000_000_000;
/** 견적 총액 경고 (50억 원) */
export const QUOTE_TOTAL_AMOUNT_WARN = 5_000_000_000;
/** 견적 총액·최종·고객최종 거부 (1,000억 원) */
export const QUOTE_TOTAL_AMOUNT_MAX = 100_000_000_000;

export function parseQuoteMoneyInput(value: string | number | null | undefined): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim() || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function formatQuoteMoneyWon(value: number | null | undefined): string {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return `${n.toLocaleString("ko-KR")}${QUOTE_MONEY_UNIT_LABEL}`;
}

export type QuoteMoneyIssue = {
  level: "warn" | "error";
  code:
    | "line_amount_high"
    | "line_amount_max"
    | "unit_price_high"
    | "unit_price_max"
    | "total_high"
    | "total_max"
    | "qty_unit_price_suspect"
    | "header_items_mismatch";
  message: string;
};

/** 저장 직전·화면 공통 금액 가드 (기존 정상 견적 수억~수십억 호환) */
export function collectQuoteMoneyIssues(input: {
  items: Array<{
    item_name?: string | null;
    trade_name?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    amount: number;
  }>;
  totalAmount: number;
  finalAmount?: number;
  customerTotalAmount?: number;
}): QuoteMoneyIssue[] {
  const issues: QuoteMoneyIssue[] = [];
  const total = Math.max(0, Math.round(Number(input.totalAmount) || 0));
  const finalAmount =
    input.finalAmount == null
      ? null
      : Math.max(0, Math.round(Number(input.finalAmount) || 0));
  const customerTotal =
    input.customerTotalAmount == null
      ? null
      : Math.max(0, Math.round(Number(input.customerTotalAmount) || 0));

  input.items.forEach((row, index) => {
    const label =
      (row.item_name || row.trade_name || "").trim() || `항목 ${index + 1}`;
    const amount = Math.max(0, Math.round(Number(row.amount) || 0));
    const unitPrice = Math.max(0, Math.round(Number(row.unit_price) || 0));
    const qty =
      row.quantity == null || !Number.isFinite(Number(row.quantity))
        ? null
        : Number(row.quantity);

    if (amount > QUOTE_LINE_AMOUNT_MAX) {
      issues.push({
        level: "error",
        code: "line_amount_max",
        message: `${label} 금액이 허용 한도(${formatQuoteMoneyWon(QUOTE_LINE_AMOUNT_MAX)})를 초과합니다. 원 단위로 다시 확인해 주세요.`,
      });
    } else if (amount >= QUOTE_LINE_AMOUNT_WARN) {
      issues.push({
        level: "warn",
        code: "line_amount_high",
        message: `${label} 금액이 ${formatQuoteMoneyWon(amount)}입니다. 만원 단위가 아닌 원 단위 입력인지 확인해 주세요.`,
      });
    }

    if (unitPrice > QUOTE_LINE_AMOUNT_MAX) {
      issues.push({
        level: "error",
        code: "unit_price_max",
        message: `${label} 단가가 허용 한도를 초과합니다. 원 단위 단가인지 확인해 주세요.`,
      });
    } else if (unitPrice >= QUOTE_LINE_AMOUNT_WARN) {
      issues.push({
        level: "warn",
        code: "unit_price_high",
        message: `${label} 단가가 ${formatQuoteMoneyWon(unitPrice)}입니다. 항목 총액을 단가에 넣은 것은 아닌지 확인해 주세요.`,
      });
    }

    if (
      qty != null &&
      qty >= 2 &&
      unitPrice >= QUOTE_LINE_AMOUNT_WARN &&
      amount === Math.round(qty * unitPrice)
    ) {
      issues.push({
        level: "warn",
        code: "qty_unit_price_suspect",
        message: `${label}: 수량(${qty}) × 고액 단가로 금액이 커졌습니다. 단가에 총액을 넣고 수량을 올린 실수는 아닌지 확인해 주세요.`,
      });
    }
  });

  const itemsSum = input.items.reduce(
    (sum, row) => sum + Math.max(0, Math.round(Number(row.amount) || 0)),
    0,
  );
  if (input.items.length > 0 && total !== itemsSum) {
    issues.push({
      level: "error",
      code: "header_items_mismatch",
      message: `총견적금액(${formatQuoteMoneyWon(total)})과 품목 합계(${formatQuoteMoneyWon(itemsSum)})가 일치하지 않습니다. 저장 전 금액을 다시 계산해 주세요.`,
    });
  }

  const peaks = [total, finalAmount ?? 0, customerTotal ?? 0];
  const peak = Math.max(...peaks);
  if (peak > QUOTE_TOTAL_AMOUNT_MAX) {
    issues.push({
      level: "error",
      code: "total_max",
      message: `견적 합계가 허용 한도(${formatQuoteMoneyWon(QUOTE_TOTAL_AMOUNT_MAX)})를 초과합니다. 원 단위 입력·수량·단가를 확인해 주세요.`,
    });
  } else if (peak >= QUOTE_TOTAL_AMOUNT_WARN) {
    issues.push({
      level: "warn",
      code: "total_high",
      message: `견적 합계가 ${formatQuoteMoneyWon(peak)}로 큽니다. 만원 단위 오입력 여부를 확인해 주세요.`,
    });
  }

  return issues;
}

export function assertQuoteMoneyBounds(
  input: Parameters<typeof collectQuoteMoneyIssues>[0],
): void {
  const errors = collectQuoteMoneyIssues(input).filter((i) => i.level === "error");
  if (errors.length > 0) {
    throw new Error(errors[0]!.message);
  }
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

/** 견적 VAT 입력 방식. null = legacy(부가세 미적용 snapshot) */
export const QUOTE_VAT_MODES = ["exclusive", "inclusive"] as const;
export type QuoteVatMode = (typeof QUOTE_VAT_MODES)[number];

export const DEFAULT_QUOTE_VAT_MODE: QuoteVatMode = "exclusive";
export const DEFAULT_QUOTE_VAT_RATE = 10;

export function normalizeQuoteVatMode(
  value: string | null | undefined,
): QuoteVatMode | null {
  if (value == null || value === "") return null;
  if ((QUOTE_VAT_MODES as readonly string[]).includes(value)) {
    return value as QuoteVatMode;
  }
  return null;
}

export function normalizeQuoteVatRate(value: number | null | undefined): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_QUOTE_VAT_RATE;
  return Math.min(100, Math.max(0, Math.round(raw * 100) / 100));
}

export function isActiveQuoteVatMode(
  value: string | null | undefined,
): value is QuoteVatMode {
  return normalizeQuoteVatMode(value) != null;
}

export type QuoteVatAmounts = {
  vat_mode: QuoteVatMode | null;
  vat_rate: number | null;
  supply_amount: number;
  vat_amount: number;
  customer_total_amount: number;
};

export function isWindowQuoteType(
  quoteType: string | null | undefined,
): boolean {
  return String(quoteType ?? "").trim() === "창호";
}

/**
 * 할인 후 금액(discountedAmount = computeQuoteAmounts.final_amount) 기준 VAT snapshot.
 * - exclusive: 공급가=할인후, 부가세=반올림(공급가×세율), 고객최종=공급가+부가세
 * - inclusive: 고객최종=할인후, 공급가=반올림(고객최종/(1+세율)), 부가세=고객최종-공급가
 * - legacy(null): 공급가=고객최종=할인후, 부가세=0 (기존 견적 호환)
 * 항상 supply + vat === customer_total (원 단위).
 */
export function computeQuoteVatAmounts(input: {
  discountedAmount: number;
  vatMode: QuoteVatMode | null | undefined;
  vatRate?: number | null;
}): QuoteVatAmounts {
  const discounted = Math.max(0, Math.round(Number(input.discountedAmount) || 0));
  const mode = normalizeQuoteVatMode(input.vatMode);

  if (mode == null) {
    return {
      vat_mode: null,
      vat_rate: null,
      supply_amount: discounted,
      vat_amount: 0,
      customer_total_amount: discounted,
    };
  }

  const rate = normalizeQuoteVatRate(input.vatRate);

  if (mode === "exclusive") {
    const supply_amount = discounted;
    const vat_amount =
      rate === 0 ? 0 : Math.round((supply_amount * rate) / 100);
    return {
      vat_mode: mode,
      vat_rate: rate,
      supply_amount,
      vat_amount,
      customer_total_amount: supply_amount + vat_amount,
    };
  }

  // inclusive: 할인 후 입력금액을 고객 최종으로 보고 공급가·부가세 분해
  const customer_total_amount = discounted;
  const supply_amount =
    rate === 0
      ? customer_total_amount
      : Math.round(customer_total_amount / (1 + rate / 100));
  const vat_amount = customer_total_amount - supply_amount;
  return {
    vat_mode: mode,
    vat_rate: rate,
    supply_amount,
    vat_amount,
    customer_total_amount,
  };
}

/**
 * 저장된 VAT snapshot이 있으면 우선 사용, 없으면 discountedAmount 기준 재계산.
 * UI는 final_amount(할인후)를 고객 최종금액으로 오인하지 않도록 이 결과를 사용한다.
 */
export function resolveQuoteVatDisplayAmounts(input: {
  discountedAmount: number;
  quoteType?: string | null;
  vatMode?: string | null;
  vatRate?: number | null;
  supplyAmount?: number | null;
  vatAmount?: number | null;
  customerTotalAmount?: number | null;
}): QuoteVatAmounts {
  // LX 창호 엑셀의 최종금액은 VAT가 이미 포함된 고객 결제금액이다.
  // 과거에 exclusive 스냅샷으로 잘못 저장된 창호 견적도 화면에서 바로잡는다.
  if (isWindowQuoteType(input.quoteType)) {
    return computeQuoteVatAmounts({
      discountedAmount: input.discountedAmount,
      vatMode: "inclusive",
      vatRate: DEFAULT_QUOTE_VAT_RATE,
    });
  }

  const mode = normalizeQuoteVatMode(input.vatMode);
  if (
    mode != null &&
    input.supplyAmount != null &&
    input.vatAmount != null &&
    input.customerTotalAmount != null
  ) {
    return {
      vat_mode: mode,
      vat_rate: normalizeQuoteVatRate(input.vatRate),
      supply_amount: Math.max(0, Math.round(Number(input.supplyAmount) || 0)),
      vat_amount: Math.max(0, Math.round(Number(input.vatAmount) || 0)),
      customer_total_amount: Math.max(
        0,
        Math.round(Number(input.customerTotalAmount) || 0),
      ),
    };
  }
  return computeQuoteVatAmounts({
    discountedAmount: input.discountedAmount,
    vatMode: mode,
    vatRate: input.vatRate,
  });
}

/**
 * LX 할인 요약 라벨.
 * - 적용 항목 할인율이 모두 동일하면 `N% · 금액`
 * - 서로 다르거나 fixed 혼합이면 `항목별 · 금액`
 * - 할인금액이 있는데 0%로 표시하지 않음
 */
export function formatLxDiscountSummaryLabel(input: {
  items: Array<{
    is_lx_material?: boolean | null;
    cost_type?: string | null;
    lx_discount_type?: string | null;
    lx_discount_value?: number | null;
  }>;
  quoteLevelRate: number;
  lxDiscountAmount: number;
}): string {
  const amount = Math.max(0, Math.round(Number(input.lxDiscountAmount) || 0));
  const money = `${amount.toLocaleString("ko-KR")}원`;
  if (amount <= 0) return `0% · ${money}`;

  const rates: number[] = [];
  let hasFixed = false;

  for (const row of input.items) {
    if (!row.is_lx_material || !canCostTypeHaveLx(row.cost_type)) continue;
    const type = normalizeLxDiscountType(row.lx_discount_type);
    if (type === "none") continue;
    if (type === "fixed") {
      hasFixed = true;
      continue;
    }
    if (type === "rate") {
      const rateRaw = Number(row.lx_discount_value ?? 0);
      const rate = Number.isFinite(rateRaw)
        ? Math.min(100, Math.max(0, Math.round(rateRaw * 100) / 100))
        : 0;
      rates.push(rate);
      continue;
    }
    const quoteRate = Number(input.quoteLevelRate);
    rates.push(
      Number.isFinite(quoteRate)
        ? Math.min(100, Math.max(0, Math.round(quoteRate * 100) / 100))
        : 0,
    );
  }

  if (hasFixed || rates.length === 0) {
    return `항목별 · ${money}`;
  }
  const first = rates[0]!;
  const allSame = rates.every((r) => r === first);
  if (allSame && first > 0) {
    return `${first}% · ${money}`;
  }
  return `항목별 · ${money}`;
}

export const QUOTE_FILES_BUCKET = "quote-files";
export const QUOTE_FILE_MAX_BYTES = 30 * 1024 * 1024;
export const QUOTE_FILE_EXTENSIONS = ["pdf", "xls", "xlsx"] as const;

/** 직원 명함 이미지 (private). path: {company_id}/{employee_id}/{uuid}.ext */
export const EMPLOYEE_BUSINESS_CARDS_BUCKET = "employee-business-cards";
export const EMPLOYEE_BUSINESS_CARD_MAX_BYTES = 10 * 1024 * 1024;
export const EMPLOYEE_BUSINESS_CARD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

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
