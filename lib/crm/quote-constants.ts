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

export const QUOTE_COST_TYPES = ["자재", "시공", "시공+자재", "기타"] as const;
export type QuoteCostType = (typeof QUOTE_COST_TYPES)[number];

/** LX 체크 가능한 구분 */
export const QUOTE_LX_COST_TYPES = ["자재", "시공+자재"] as const;

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
  return (QUOTE_LX_COST_TYPES as readonly string[]).includes(costType ?? "");
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
  if (!row.is_lx_material || !canCostTypeHaveLx(row.cost_type)) return 0;
  const amount = Math.max(0, Math.round(Number(row.amount) || 0));
  if (row.cost_type === "자재") return amount;
  const base = Math.max(0, Math.round(Number(row.lx_discount_base_amount) || 0));
  return Math.min(base, amount);
}

/** 화면·서버 공통 금액 계산 (클라이언트 최종금액을 신뢰하지 않음) */
export function computeQuoteAmounts(input: {
  items: Array<{
    amount: number;
    cost_type?: string | null;
    is_lx_material?: boolean | null;
    lx_discount_base_amount?: number | null;
  }>;
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

  const lxMaterialSum = input.items.reduce(
    (sum, row) => sum + lxDiscountBaseForItem(row),
    0,
  );

  const lxDiscountAmount = Math.round((lxMaterialSum * lxDiscountRate) / 100);
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
