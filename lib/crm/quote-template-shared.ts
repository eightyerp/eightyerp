import {
  normalizeQuoteCostType,
  type QuoteCostType,
  type QuoteMode,
} from "@/lib/crm/quote-constants";

export const QUOTE_TEMPLATE_TYPES = ["인테리어", "창호", "공통"] as const;
export type QuoteTemplateType = (typeof QUOTE_TEMPLATE_TYPES)[number];

export type QuoteTemplateItemPayload = {
  trade_name: string;
  item_name: string;
  description: string;
  remark: string;
  quantity: string;
  unit: string;
  unit_price: string;
  amount: string;
  cost_type: QuoteCostType;
  is_lx_material: boolean;
  lx_discount_base_amount: string;
  lx_discount_type: "" | "none" | "rate" | "fixed";
  lx_discount_value: string;
};

export type QuoteTemplate = {
  id: string;
  company_id: string;
  name: string;
  quote_type: QuoteTemplateType | string;
  quote_mode: QuoteMode | string;
  trade_order: string[];
  items: QuoteTemplateItemPayload[];
  trade_count: number;
  item_count: number;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteTemplateListItem = Pick<
  QuoteTemplate,
  | "id"
  | "name"
  | "quote_type"
  | "quote_mode"
  | "trade_count"
  | "item_count"
  | "updated_at"
  | "archived_at"
>;

export function templateItemDedupeKey(item: {
  trade_name?: string | null;
  item_name?: string | null;
  description?: string | null;
  unit?: string | null;
  unit_price?: string | number | null;
}): string {
  return [
    String(item.trade_name ?? "").trim(),
    String(item.item_name ?? "").trim(),
    String(item.description ?? "").trim(),
    String(item.unit ?? "").trim(),
    String(item.unit_price ?? "").replace(/,/g, "").trim(),
  ].join("\u0001");
}

export function normalizeTemplateItem(
  raw: unknown,
): QuoteTemplateItemPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const trade = String(row.trade_name ?? "").trim() || "미분류";
  const itemName = String(row.item_name ?? "").trim();
  const description = String(row.description ?? "").trim();
  const remark = String(row.remark ?? "").trim();
  if (!itemName && !description && !trade) return null;
  const lxTypeRaw = String(row.lx_discount_type ?? "").trim();
  const lxType =
    lxTypeRaw === "rate" || lxTypeRaw === "fixed" || lxTypeRaw === "none"
      ? lxTypeRaw
      : ("" as const);
  return {
    trade_name: trade,
    item_name: itemName,
    description,
    remark,
    quantity: String(row.quantity ?? ""),
    unit: String(row.unit ?? ""),
    unit_price: String(row.unit_price ?? "0"),
    amount: String(row.amount ?? "0"),
    cost_type: normalizeQuoteCostType(String(row.cost_type ?? "기타")),
    is_lx_material: Boolean(row.is_lx_material),
    lx_discount_base_amount: String(row.lx_discount_base_amount ?? ""),
    lx_discount_type: lxType,
    lx_discount_value: String(row.lx_discount_value ?? "0"),
  };
}

export function canManageQuoteTemplates(
  role: string | null | undefined,
): boolean {
  return role === "owner" || role === "director" || role === "admin";
}
