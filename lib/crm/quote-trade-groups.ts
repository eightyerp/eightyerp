import { resolveTradeDisplayName } from "@/lib/crm/quote-constants";

/** 행의 공종 표시 키 (빈 값은 미분류) */
export function tradeKeyOf(
  row: { trade_name?: string | null; item_name?: string | null },
  quoteMode?: string | null,
): string {
  return resolveTradeDisplayName(row.trade_name, row.item_name, quoteMode);
}

/** 항목 등장 순서로 공종 목록 추출 (가나다 정렬 금지) */
export function extractTradeOrder<
  T extends { trade_name?: string | null; item_name?: string | null },
>(items: T[], quoteMode?: string | null, extraTrades: string[] = []): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = tradeKeyOf(item, quoteMode);
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  for (const raw of extraTrades) {
    const key = raw.trim() || "미분류";
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  return order;
}

export type TradeGroup<T> = {
  tradeLabel: string;
  items: T[];
  subtotal: number;
};

/** 공종 순서를 유지한 채 한 번 순회로 그룹·소계 계산 */
export function buildTradeGroups<
  T extends {
    trade_name?: string | null;
    item_name?: string | null;
    amount?: string | number | null;
    isPlaceholder?: boolean;
  },
>(
  items: T[],
  tradeOrder: string[],
  quoteMode: string | null | undefined,
  toAmount: (row: T) => number,
): TradeGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const label of tradeOrder) {
    map.set(label, []);
  }
  for (const item of items) {
    const key = tradeKeyOf(item, quoteMode);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const labels =
    tradeOrder.length > 0
      ? tradeOrder
      : extractTradeOrder(items, quoteMode);

  return labels.map((tradeLabel) => {
    const groupItems = map.get(tradeLabel) ?? [];
    const subtotal = groupItems.reduce((sum, row) => {
      if (row.isPlaceholder) return sum;
      return sum + toAmount(row);
    }, 0);
    return { tradeLabel, items: groupItems, subtotal };
  });
}

export function moveTradeOrder(
  order: string[],
  tradeLabel: string,
  direction: "up" | "down",
): string[] {
  const idx = order.indexOf(tradeLabel);
  if (idx < 0) return order;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) return order;
  const next = [...order];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return next;
}

/** 공종 순서에 맞춰 항목을 평탄화 (저장·미리보기용 sort_order) */
export function flattenItemsByTradeOrder<
  T extends { trade_name?: string | null; item_name?: string | null },
>(items: T[], tradeOrder: string[], quoteMode?: string | null): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = tradeKeyOf(item, quoteMode);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const result: T[] = [];
  const used = new Set<string>();
  for (const label of tradeOrder) {
    const rows = groups.get(label);
    if (rows?.length) {
      result.push(...rows);
      used.add(label);
    }
  }
  for (const [label, rows] of groups) {
    if (!used.has(label)) result.push(...rows);
  }
  return result;
}
