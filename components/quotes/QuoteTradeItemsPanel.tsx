"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  QUOTE_COST_TYPES,
  QUOTE_LINE_AMOUNT_WARN,
  QUOTE_UNITS,
  TRADE_SUGGESTIONS,
  canCostTypeHaveLx,
  formatQuoteMoneyWon,
  normalizeQuoteCostType,
  quoteCostTypeLabel,
  type QuoteCostType,
  type QuoteMode,
} from "@/lib/crm/quote-constants";
import {
  buildTradeGroups,
  extractTradeOrder,
  flattenItemsByTradeOrder,
  moveTradeOrder,
  tradeKeyOf,
} from "@/lib/crm/quote-trade-groups";
import { LX_WINDOW_TRADE_NAME } from "@/lib/crm/lx-window-excel";

const LxWindowExcelImportModal = dynamic(
  () => import("@/components/quotes/LxWindowExcelImportModal"),
  { ssr: false },
);

export type QuoteLineRow = {
  key: string;
  /** 기존 DB quote_items.id. 신규 행은 null */
  id: string | null;
  trade_name: string;
  item_name: string;
  description: string;
  /** 항목별 선택 비고 (규격 description과 별도) */
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
  isPlaceholder?: boolean;
};

type Props = {
  quoteMode: QuoteMode;
  items: QuoteLineRow[];
  tradeOrder: string[];
  onTradeOrderChange: (next: string[]) => void;
  onItemsChange: (updater: (prev: QuoteLineRow[]) => QuoteLineRow[]) => void;
  /** 기존 DB 항목을 화면에서 삭제할 때 호출 (저장 시 soft-delete용) */
  onRemoveExistingItem?: (itemId: string) => void;
  createRow: (partial?: Partial<QuoteLineRow>) => QuoteLineRow;
  isInterior?: boolean;
  /** 창호 견적(quote_type===창호)일 때만 LX 엑셀 가져오기 표시 */
  isWindowQuote?: boolean;
  /** 프로모션 할인 → 특별할인 금액에 반영 (계산식 변경 아님) */
  onApplyPromotionDiscount?: (amount: number, memo: string) => void;
};

function toNumber(value: string): number {
  const num = Number(String(value).replace(/,/g, "").trim() || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: number): string {
  return formatQuoteMoneyWon(value);
}

function formatComma(value: string | number): string {
  const n = typeof value === "number" ? value : toNumber(String(value));
  return Math.max(0, Math.round(n)).toLocaleString("ko-KR");
}

function digitsOnlyMoney(value: string): string {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function moneyHint(amount: number): string | null {
  if (amount >= QUOTE_LINE_AMOUNT_WARN) {
    return `확인: ${formatMoney(amount)} (원 단위)`;
  }
  if (amount > 0) {
    return formatMoney(amount);
  }
  return null;
}

function rowAmount(row: QuoteLineRow): number {
  const qty = toNumber(row.quantity);
  return qty > 0
    ? Math.round(qty * toNumber(row.unit_price))
    : toNumber(row.amount);
}

/** cost_type 저장값은 "시공+자재" (화면 표시: 자재+시공) */
function lxBaseAmountError(
  row: QuoteLineRow,
  opts?: { requireWhenLx?: boolean },
): string | null {
  if (row.cost_type !== "시공+자재" || !row.is_lx_material) return null;
  const amount = rowAmount(row);
  const raw = row.lx_discount_base_amount.trim();
  const base = toNumber(row.lx_discount_base_amount);
  if (raw !== "" && base > amount) {
    return "LX 자재금액은 항목 총금액 이하로 입력해주세요.";
  }
  const requireBase =
    opts?.requireWhenLx === true ||
    row.lx_discount_type === "rate" ||
    row.lx_discount_type === "fixed";
  if (requireBase && (raw === "" || base <= 0)) {
    return "자재+시공 항목의 LX 할인 대상 자재금액을 입력해주세요.";
  }
  return null;
}

const cellInputClass =
  "w-full min-w-0 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

const UNIT_OPTIONS = [
  ...QUOTE_UNITS,
  { value: "EA", label: "EA" },
] as const;

export default function QuoteTradeItemsPanel({
  quoteMode,
  items,
  tradeOrder,
  onTradeOrderChange,
  onItemsChange,
  onRemoveExistingItem,
  createRow,
  isInterior = false,
  isWindowQuote = false,
  onApplyPromotionDiscount,
}: Props) {
  const isSimple = quoteMode === "simple";
  const [customTrade, setCustomTrade] = useState("");
  const [bulkLxRate, setBulkLxRate] = useState("");
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<string[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);
  /** 일괄 할인 등으로 강제 표시하는 행 오류 */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const focusKeyRef = useRef<string | null>(null);
  /** 상세견적 공종 접기 상태 */
  const [collapsedTrades, setCollapsedTrades] = useState<Set<string>>(
    () => new Set(),
  );
  const [lxImportOpen, setLxImportOpen] = useState(false);

  const showLxImport =
    isWindowQuote && !isSimple && !isInterior;

  function openLxImportForTrade(tradeLabel: string) {
    if (tradeLabel !== LX_WINDOW_TRADE_NAME) return;
    setLxImportOpen(true);
  }

  function toggleTradeCollapsed(label: string) {
    setCollapsedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const groups = useMemo(() => {
    const built = buildTradeGroups(items, tradeOrder, quoteMode, (row) =>
      rowAmount(row),
    );
    // 상세견적: 빈 대표공종도 화면에 표시. 간편: 항목 있는 공종만.
    if (!isSimple) return built;
    return built.filter((g) => g.items.some((row) => !row.isPlaceholder));
  }, [items, tradeOrder, quoteMode, isSimple]);

  const flatRows = useMemo(() => {
    const ordered = flattenItemsByTradeOrder(items, tradeOrder, quoteMode);
    return ordered.filter((r) => !r.isPlaceholder);
  }, [items, tradeOrder, quoteMode]);

  function updateRow(key: string, patch: Partial<QuoteLineRow>) {
    if (
      patch.lx_discount_base_amount !== undefined ||
      patch.lx_discount_type !== undefined ||
      patch.is_lx_material !== undefined ||
      patch.cost_type !== undefined ||
      patch.quantity !== undefined ||
      patch.unit_price !== undefined ||
      patch.amount !== undefined
    ) {
      setRowErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    onItemsChange((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch, isPlaceholder: false };
        if (patch.cost_type !== undefined && !canCostTypeHaveLx(next.cost_type)) {
          next.is_lx_material = false;
          next.lx_discount_base_amount = "";
          next.lx_discount_type = "";
          next.lx_discount_value = "0";
        }
        // LX 해제 시 할인 방식만 초기화 — 자재금액(base)은 form state에 유지해 재체크 시 복원
        if (patch.is_lx_material === false) {
          next.lx_discount_type = "";
          next.lx_discount_value = "0";
        }
        if (patch.quantity !== undefined || patch.unit_price !== undefined) {
          const qty = toNumber(next.quantity);
          const price = toNumber(next.unit_price);
          if (qty > 0) {
            next.amount = String(Math.round(qty * price));
          }
        }
        return next;
      }),
    );
  }

  function removeRow(key: string) {
    onItemsChange((prev) => {
      const target = prev.find((r) => r.key === key);
      const next = prev.filter((r) => r.key !== key);
      if (!target) return next;
      if (target.id) {
        onRemoveExistingItem?.(target.id);
      }
      const label = tradeKeyOf(target, quoteMode);
      const stillHas = next.some((r) => tradeKeyOf(r, quoteMode) === label);
      // 상세견적 대표공종은 항목이 없어도 화면에 유지 (출력에서만 제외)
      if (
        !stillHas &&
        (isSimple ||
          !(TRADE_SUGGESTIONS as readonly string[]).includes(label))
      ) {
        onTradeOrderChange(tradeOrder.filter((t) => t !== label));
      }
      return next;
    });
  }

  /** 공종 빠른 추가: 해당 공종 행 1개만 추가 */
  function addRowForTrade(tradeName: string) {
    const name = tradeName.trim();
    if (!name) return;
    setPanelError(null);
    const nextOrder = tradeOrder.includes(name)
      ? tradeOrder
      : [...tradeOrder, name];
    if (nextOrder !== tradeOrder) onTradeOrderChange(nextOrder);

    const row = createRow({
      trade_name: name === "미분류" ? "" : name,
      item_name: "",
      cost_type: "자재",
      amount: "0",
      unit_price: "0",
    });
    focusKeyRef.current = row.key;

    onItemsChange((prev) => {
      const ordered = flattenItemsByTradeOrder(prev, nextOrder, quoteMode);
      const lastIdx = (() => {
        let idx = -1;
        ordered.forEach((r, i) => {
          if (tradeKeyOf(r, quoteMode) === name) idx = i;
        });
        return idx;
      })();
      if (lastIdx < 0) return [...ordered, row];
      const copy = [...ordered];
      copy.splice(lastIdx + 1, 0, row);
      return copy;
    });
  }

  function moveTrade(label: string, direction: "up" | "down") {
    onTradeOrderChange(moveTradeOrder(tradeOrder, label, direction));
  }

  function moveItemInTrade(key: string, direction: "up" | "down") {
    onItemsChange((prev) => {
      const ordered = flattenItemsByTradeOrder(prev, tradeOrder, quoteMode);
      const idx = ordered.findIndex((r) => r.key === key);
      if (idx < 0) return prev;
      const label = tradeKeyOf(ordered[idx], quoteMode);
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= ordered.length) return prev;
      if (tradeKeyOf(ordered[swapWith], quoteMode) !== label) return prev;
      const next = [...ordered];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  function applyBulkLxRate() {
    const rate = toNumber(bulkLxRate);
    if (rate < 0 || rate > 100) {
      setPanelError("일괄 할인율은 0~100 사이여야 합니다.");
      return;
    }
    const candidates =
      bulkSelectedKeys.length > 0
        ? items.filter((row) => bulkSelectedKeys.includes(row.key))
        : items.filter(
            (row) => canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
          );
    const eligible = candidates.filter(
      (row) => canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
    );
    if (eligible.length === 0) {
      setPanelError("할인율을 적용할 LX 자재 항목이 없습니다.");
      return;
    }

    const nextErrors: Record<string, string> = {};
    const applyKeys = new Set<string>();
    for (const row of eligible) {
      if (row.cost_type === "시공+자재") {
        const err = lxBaseAmountError(row, { requireWhenLx: true });
        if (err) {
          nextErrors[row.key] = err;
          continue;
        }
      }
      applyKeys.add(row.key);
    }

    setRowErrors((prev) => ({ ...prev, ...nextErrors }));
    if (applyKeys.size === 0) {
      setPanelError(
        "자재+시공 항목의 LX 할인 대상 자재금액을 입력해주세요.",
      );
      return;
    }
    setPanelError(
      Object.keys(nextErrors).length > 0
        ? "일부 항목은 자재금액 입력 후 다시 적용해 주세요."
        : null,
    );
    onItemsChange((prev) =>
      prev.map((row) => {
        if (!applyKeys.has(row.key)) return row;
        return {
          ...row,
          lx_discount_type: "rate" as const,
          lx_discount_value: String(rate),
        };
      }),
    );
  }

  function resolveRowError(row: QuoteLineRow): string | null {
    const live = lxBaseAmountError(row, {
      requireWhenLx:
        row.lx_discount_type === "rate" || row.lx_discount_type === "fixed",
    });
    if (live) return live;
    return rowErrors[row.key] ?? null;
  }

  function renderLxDiscountControls(row: QuoteLineRow, withCheckbox: boolean) {
    const canLx = canCostTypeHaveLx(row.cost_type);
    return (
      <div className="min-w-[110px] space-y-1">
        {withCheckbox ? (
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={row.is_lx_material}
              disabled={!canLx}
              onChange={(e) =>
                updateRow(row.key, { is_lx_material: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-gold-600 disabled:opacity-40"
            />
            LX
          </label>
        ) : null}
        {canLx && row.is_lx_material ? (
          <div className="space-y-1">
            <select
              value={row.lx_discount_type || "legacy"}
              onChange={(e) => {
                const v = e.target.value;
                updateRow(row.key, {
                  lx_discount_type:
                    v === "legacy" ? "" : (v as "none" | "rate" | "fixed"),
                });
              }}
              className={`${cellInputClass} text-xs`}
              aria-label="LX 할인 방식"
            >
              <option value="legacy">견적할인율</option>
              <option value="none">없음</option>
              <option value="rate">정률%</option>
              <option value="fixed">정액</option>
            </select>
            {(row.lx_discount_type === "rate" ||
              row.lx_discount_type === "fixed") && (
              <input
                value={row.lx_discount_value}
                onChange={(e) =>
                  updateRow(row.key, { lx_discount_value: e.target.value })
                }
                inputMode="decimal"
                placeholder={
                  row.lx_discount_type === "rate" ? "할인율 %" : "할인액"
                }
                aria-label={
                  row.lx_discount_type === "rate"
                    ? "LX 할인율"
                    : "LX 정액 할인"
                }
                className={`${cellInputClass} text-right text-xs tabular-nums`}
              />
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">-</span>
        )}
      </div>
    );
  }

  /** LX 할인 대상 자재금액 전용 셀 */
  function renderLxBaseAmountCell(row: QuoteLineRow) {
    const amount = rowAmount(row);
    if (!row.is_lx_material || !canCostTypeHaveLx(row.cost_type)) {
      return <span className="text-xs text-slate-400">-</span>;
    }
    if (row.cost_type === "자재") {
      return (
        <p className="text-xs font-medium tabular-nums text-slate-700">
          전액 {formatMoney(amount)}
        </p>
      );
    }
    if (row.cost_type === "시공+자재") {
      const display =
        row.lx_discount_base_amount.trim() === ""
          ? ""
          : formatComma(row.lx_discount_base_amount);
      return (
        <div className="space-y-1">
          <p className="text-[10px] leading-tight text-slate-500">
            항목 총액 {formatMoney(amount)}
          </p>
          <input
            value={display}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              updateRow(row.key, { lx_discount_base_amount: digits });
            }}
            inputMode="numeric"
            placeholder="자재금액 입력"
            aria-label="LX 할인 대상 자재금액"
            className={`${cellInputClass} text-right text-xs tabular-nums`}
          />
        </div>
      );
    }
    return <span className="text-xs text-slate-400">-</span>;
  }

  function renderRemarkField(row: QuoteLineRow, opts?: { compact?: boolean }) {
    return (
      <div className={opts?.compact ? "space-y-1" : "space-y-1.5"}>
        <label className="block text-[11px] font-medium text-slate-600">
          비고{" "}
          <span className="font-normal text-slate-400">(선택)</span>
        </label>
        <textarea
          value={row.remark}
          maxLength={500}
          rows={opts?.compact ? 2 : 2}
          placeholder="색상, 규격, 시공 조건 등"
          onChange={(e) =>
            updateRow(row.key, {
              remark: e.target.value.slice(0, 500),
            })
          }
          className={`${cellInputClass} min-h-[2.5rem] resize-y leading-snug`}
        />
      </div>
    );
  }

  function tradeSelect(row: QuoteLineRow) {
    const inList = (TRADE_SUGGESTIONS as readonly string[]).includes(
      row.trade_name,
    );
    return (
      <div className="min-w-[110px] space-y-1">
        <select
          value={
            inList || row.trade_name === "" || row.trade_name === "미분류"
              ? row.trade_name === "미분류"
                ? ""
                : row.trade_name
              : "__custom__"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom__") return;
            updateRow(row.key, { trade_name: v });
            const label = v.trim() || "미분류";
            if (!tradeOrder.includes(label)) {
              onTradeOrderChange([...tradeOrder, label]);
            }
          }}
          className={cellInputClass}
        >
          <option value="">미분류</option>
          {TRADE_SUGGESTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {!inList && row.trade_name ? (
            <option value="__custom__">{row.trade_name}</option>
          ) : null}
        </select>
        {!inList || row.trade_name === "" ? (
          <input
            value={inList ? "" : row.trade_name}
            onChange={(e) => {
              const v = e.target.value;
              updateRow(row.key, { trade_name: v });
              const label = v.trim() || "미분류";
              if (v.trim() && !tradeOrder.includes(label)) {
                onTradeOrderChange([...tradeOrder, label]);
              }
            }}
            placeholder="직접입력"
            className={`${cellInputClass} text-xs`}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">
          공종 빠른 추가
          {!isInterior && !isSimple ? (
            <span className="ml-1 font-normal text-slate-400">(선택)</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TRADE_SUGGESTIONS.map((trade) => (
            <button
              key={trade}
              type="button"
              onClick={() => addRowForTrade(trade)}
              className="rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-gold-100"
            >
              + {trade}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customTrade}
            onChange={(e) => setCustomTrade(e.target.value)}
            placeholder="공종명 직접 입력 후 행 추가"
            className={`${cellInputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              addRowForTrade(customTrade);
              setCustomTrade("");
            }}
            className="shrink-0 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            행 추가
          </button>
        </div>
      </div>

      {groups.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">공종 순서</p>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g, i) => (
              <div
                key={g.tradeLabel}
                className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white pl-2.5 pr-1 py-1 text-xs text-slate-800"
              >
                <span className="max-w-[7rem] truncate font-medium">
                  {g.tradeLabel}
                </span>
                <button
                  type="button"
                  aria-label={`${g.tradeLabel} 위로 이동`}
                  disabled={i === 0}
                  onClick={() => moveTrade(g.tradeLabel, "up")}
                  className="rounded px-1.5 py-0.5 font-semibold hover:bg-slate-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${g.tradeLabel} 아래로 이동`}
                  disabled={i === groups.length - 1}
                  onClick={() => moveTrade(g.tradeLabel, "down")}
                  className="rounded px-1.5 py-0.5 font-semibold hover:bg-slate-100 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">
            LX 일괄 할인율(%)
          </label>
          <input
            inputMode="decimal"
            value={bulkLxRate}
            onChange={(e) => setBulkLxRate(e.target.value)}
            placeholder="예: 10"
            className={`${cellInputClass} w-28`}
          />
        </div>
        <button
          type="button"
          onClick={applyBulkLxRate}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {bulkSelectedKeys.length > 0
            ? `선택 LX에 적용 (${bulkSelectedKeys.length})`
            : "모든 LX에 적용"}
        </button>
      </div>

      {panelError ? (
        <p className="text-sm text-red-600">{panelError}</p>
      ) : null}

      {flatRows.length === 0 && isSimple ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          {isInterior
            ? "공종 빠른 추가로 항목 행을 추가해 주세요."
            : "항목이 없습니다. 공종 빠른 추가 또는 행 추가로 입력해 주세요."}
        </p>
      ) : isSimple ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-slate-600">
                <th className="w-10 px-2 py-2 text-center">선택</th>
                <th className="px-3 py-2 font-medium">공종</th>
                <th className="px-3 py-2 font-medium">항목내역</th>
                <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                <th className="px-3 py-2 font-medium">LX/할인</th>
                <th className="min-w-[140px] px-3 py-2 font-medium">
                  LX 할인 대상
                  <br />
                  자재금액
                </th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) =>
                group.items
                  .filter((r) => !r.isPlaceholder)
                  .map((row, idxInGroup) => {
                    const err = resolveRowError(row);
                    return (
                      <Fragment key={row.key}>
                        <tr
                          className={`border-b border-slate-100 ${
                            idxInGroup === 0
                              ? "border-t-2 border-t-slate-200 bg-slate-50/40"
                              : ""
                          }`}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={bulkSelectedKeys.includes(row.key)}
                              disabled={
                                !(
                                  canCostTypeHaveLx(row.cost_type) &&
                                  row.is_lx_material
                                )
                              }
                              onChange={(e) =>
                                setBulkSelectedKeys((prev) =>
                                  e.target.checked
                                    ? [...prev, row.key]
                                    : prev.filter((k) => k !== row.key),
                                )
                              }
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            {idxInGroup === 0 ? (
                              <div>
                                {tradeSelect(row)}
                                <p className="mt-1 text-[11px] font-medium text-navy-800">
                                  소계 {formatMoney(group.subtotal)}
                                </p>
                              </div>
                            ) : (
                              tradeSelect(row)
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              ref={(el) => {
                                if (el && focusKeyRef.current === row.key) {
                                  el.focus();
                                  focusKeyRef.current = null;
                                }
                              }}
                              value={row.item_name}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  item_name: e.target.value,
                                })
                              }
                              placeholder="항목내역"
                              className={cellInputClass}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              value={row.amount}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  amount: digitsOnlyMoney(e.target.value),
                                })
                              }
                              inputMode="numeric"
                              className={`${cellInputClass} text-right font-medium tabular-nums ${
                                toNumber(row.amount) >= QUOTE_LINE_AMOUNT_WARN
                                  ? "border-amber-300 bg-amber-50"
                                  : ""
                              }`}
                              placeholder="원"
                              title="원 단위 (예: 35000000)"
                            />
                            {moneyHint(toNumber(row.amount)) ? (
                              <p
                                className={`mt-0.5 text-[10px] tabular-nums ${
                                  toNumber(row.amount) >= QUOTE_LINE_AMOUNT_WARN
                                    ? "text-amber-700"
                                    : "text-slate-400"
                                }`}
                              >
                                {moneyHint(toNumber(row.amount))}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {renderLxDiscountControls(row, true)}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {renderLxBaseAmountCell(row)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              aria-label="항목 삭제"
                              onClick={() => removeRow(row.key)}
                              className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                        {err ? (
                          <tr className="border-b border-red-100 bg-red-50/50">
                            <td
                              colSpan={7}
                              className="px-3 py-1.5 text-xs text-red-600"
                            >
                              {err}
                            </td>
                          </tr>
                        ) : null}
                        <tr className="border-b border-gray-100 bg-slate-50/40">
                          <td colSpan={7} className="px-3 pb-2.5 pt-0">
                            {renderRemarkField(row, { compact: true })}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  }),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* PC: 한 화면 표 */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
            <table className="w-full min-w-[1280px] table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-slate-600">
                  <th className="w-[52px] px-2 py-2 font-medium">순서</th>
                  <th className="w-[120px] px-2 py-2 font-medium">공종</th>
                  <th className="w-[120px] px-2 py-2 font-medium">품목</th>
                  <th className="w-[100px] px-2 py-2 font-medium">규격</th>
                  <th className="w-[92px] px-2 py-2 font-medium">구분</th>
                  <th className="w-[64px] px-2 py-2 font-medium">수량</th>
                  <th className="w-[72px] px-2 py-2 font-medium">단위</th>
                  <th className="w-[96px] px-2 py-2 text-right font-medium">
                    단가(원)
                  </th>
                  <th className="w-[96px] px-2 py-2 text-right font-medium">
                    금액(원)
                  </th>
                  <th className="w-[72px] px-2 py-2 text-center font-medium">
                    LX
                    <br />
                    자재
                  </th>
                  <th className="w-[120px] px-2 py-2 font-medium">할인</th>
                  <th className="w-[148px] px-2 py-2 font-medium">
                    LX 할인 대상
                    <br />
                    자재금액
                  </th>
                  <th className="w-[52px] px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const rows = group.items.filter((r) => !r.isPlaceholder);
                  const collapsed = collapsedTrades.has(group.tradeLabel);
                  const groupIndex = groups.findIndex(
                    (g) => g.tradeLabel === group.tradeLabel,
                  );
                  return (
                    <Fragment key={group.tradeLabel}>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={13} className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                toggleTradeCollapsed(group.tradeLabel)
                              }
                              className="flex min-w-0 items-center gap-2 text-left"
                            >
                              <span className="text-xs text-slate-500">
                                {collapsed ? "▶" : "▼"}
                              </span>
                              <span className="text-sm font-bold text-navy-900">
                                {group.tradeLabel}
                              </span>
                              <span className="text-xs font-semibold tabular-nums text-slate-700">
                                소계 {formatMoney(group.subtotal)}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {rows.length}항목
                              </span>
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`${group.tradeLabel} 위로`}
                                disabled={groupIndex <= 0}
                                onClick={() =>
                                  moveTrade(group.tradeLabel, "up")
                                }
                                className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                aria-label={`${group.tradeLabel} 아래로`}
                                disabled={groupIndex >= groups.length - 1}
                                onClick={() =>
                                  moveTrade(group.tradeLabel, "down")
                                }
                                className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => addRowForTrade(group.tradeLabel)}
                                className="rounded-md border border-gold-300 bg-gold-50 px-2.5 py-1 text-xs font-medium text-navy-800 hover:bg-gold-100"
                              >
                                + 항목 추가
                              </button>
                              {showLxImport &&
                              group.tradeLabel === LX_WINDOW_TRADE_NAME ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openLxImportForTrade(group.tradeLabel)
                                  }
                                  className="rounded-md border border-navy-800/20 bg-white px-2.5 py-1 text-xs font-semibold text-navy-900 hover:bg-navy-50"
                                >
                                  LX 본사 엑셀 가져오기
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {collapsed
                        ? null
                        : rows.length === 0
                          ? (
                              <tr className="border-b border-slate-100">
                                <td
                                  colSpan={13}
                                  className="px-3 py-3 text-xs text-slate-400"
                                >
                                  세부항목이 없습니다. 위 ‘+ 항목 추가’로
                                  입력하세요. (비어 있으면 출력에서 제외됩니다)
                                </td>
                              </tr>
                            )
                          : rows.map((row, idxInGroup) => {
                    const qty = toNumber(row.quantity);
                    const computedAmount =
                      qty > 0
                        ? Math.round(qty * toNumber(row.unit_price))
                        : toNumber(row.amount);
                    const rowErr = resolveRowError(row);
                    return (
                      <Fragment key={row.key}>
                      <tr
                        className={`border-b border-slate-100 ${
                          idxInGroup === 0
                            ? "border-t-2 border-t-slate-300 bg-slate-50/50"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-2 align-top">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              aria-label="항목 위로"
                              disabled={idxInGroup === 0}
                              onClick={() => moveItemInTrade(row.key, "up")}
                              className="rounded border border-slate-200 px-1 text-[11px] disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label="항목 아래로"
                              disabled={idxInGroup === rows.length - 1}
                              onClick={() => moveItemInTrade(row.key, "down")}
                              className="rounded border border-slate-200 px-1 text-[11px] disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top">
                          {idxInGroup === 0 ? (
                            <div>
                              {tradeSelect(row)}
                              <p className="mt-1 break-keep text-[11px] font-semibold text-navy-800">
                                {group.tradeLabel} · 소계{" "}
                                {formatMoney(group.subtotal)}
                              </p>
                            </div>
                          ) : (
                            tradeSelect(row)
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            ref={(el) => {
                              if (el && focusKeyRef.current === row.key) {
                                el.focus();
                                focusKeyRef.current = null;
                              }
                            }}
                            value={row.item_name}
                            onChange={(e) =>
                              updateRow(row.key, { item_name: e.target.value })
                            }
                            placeholder="품목"
                            className={cellInputClass}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            value={row.description}
                            onChange={(e) =>
                              updateRow(row.key, {
                                description: e.target.value,
                              })
                            }
                            placeholder="규격"
                            className={cellInputClass}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={row.cost_type}
                            onChange={(e) =>
                              updateRow(row.key, {
                                cost_type: normalizeQuoteCostType(e.target.value),
                              })
                            }
                            className={cellInputClass}
                          >
                            {QUOTE_COST_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {quoteCostTypeLabel(t)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            value={row.quantity}
                            onChange={(e) =>
                              updateRow(row.key, { quantity: e.target.value })
                            }
                            inputMode="decimal"
                            className={`${cellInputClass} tabular-nums`}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={row.unit}
                            onChange={(e) =>
                              updateRow(row.key, { unit: e.target.value })
                            }
                            className={cellInputClass}
                          >
                            <option value="">-</option>
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                            {row.unit &&
                            !(
                              UNIT_OPTIONS as readonly { value: string }[]
                            ).some((u) => u.value === row.unit) ? (
                              <option value={row.unit}>{row.unit}</option>
                            ) : null}
                          </select>
                        </td>
                        <td className="px-2 py-2 align-top text-right">
                          <input
                            value={row.unit_price}
                            onChange={(e) =>
                              updateRow(row.key, {
                                unit_price: digitsOnlyMoney(e.target.value),
                              })
                            }
                            inputMode="numeric"
                            className={`${cellInputClass} text-right tabular-nums ${
                              toNumber(row.unit_price) >= QUOTE_LINE_AMOUNT_WARN
                                ? "border-amber-300 bg-amber-50"
                                : ""
                            }`}
                            placeholder="원"
                            title="원 단위 단가"
                          />
                          {moneyHint(toNumber(row.unit_price)) ? (
                            <p
                              className={`mt-0.5 text-[10px] tabular-nums ${
                                toNumber(row.unit_price) >= QUOTE_LINE_AMOUNT_WARN
                                  ? "text-amber-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {moneyHint(toNumber(row.unit_price))}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 align-top text-right">
                          {qty > 0 ? (
                            <div>
                              <p
                                className={`rounded-md border border-transparent px-2 py-1.5 text-sm font-semibold tabular-nums ${
                                  computedAmount >= QUOTE_LINE_AMOUNT_WARN
                                    ? "bg-amber-50 text-amber-900"
                                    : "text-slate-900"
                                }`}
                              >
                                {formatComma(computedAmount)}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                수량×단가(원)
                              </p>
                            </div>
                          ) : (
                            <input
                              value={row.amount}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  amount: digitsOnlyMoney(e.target.value),
                                })
                              }
                              inputMode="numeric"
                              className={`${cellInputClass} text-right font-medium tabular-nums`}
                              title="수량 없을 때 금액 직접 입력 (원)"
                              placeholder="원"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 align-top text-center">
                          <input
                            type="checkbox"
                            checked={row.is_lx_material}
                            disabled={!canCostTypeHaveLx(row.cost_type)}
                            onChange={(e) =>
                              updateRow(row.key, {
                                is_lx_material: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-gray-300 text-gold-600 disabled:opacity-40"
                            aria-label="LX 자재"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          {renderLxDiscountControls(row, false)}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {renderLxBaseAmountCell(row)}
                        </td>
                        <td className="px-2 py-2 align-top text-center">
                          <button
                            type="button"
                            aria-label="항목 삭제"
                            onClick={() => removeRow(row.key)}
                            className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                      {rowErr ? (
                        <tr
                          key={`${row.key}-err`}
                          className="border-b border-red-100 bg-red-50/50"
                        >
                          <td
                            colSpan={13}
                            className="px-2 py-1.5 text-xs text-red-600"
                          >
                            {rowErr}
                          </td>
                        </tr>
                      ) : null}
                      <tr className="border-b border-gray-100 bg-slate-50/40">
                        <td colSpan={13} className="px-2 pb-2.5 pt-0">
                          {renderRemarkField(row, { compact: true })}
                        </td>
                      </tr>
                    </Fragment>
                    );
                  })
                        }
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일: 항목 카드 */}
          <div className="space-y-3 md:hidden">
            {groups.map((group) => {
              const rows = group.items.filter((r) => !r.isPlaceholder);
              const collapsed = collapsedTrades.has(group.tradeLabel);
              return (
                <div
                  key={group.tradeLabel}
                  className="space-y-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <button
                      type="button"
                      onClick={() => toggleTradeCollapsed(group.tradeLabel)}
                      className="flex items-center gap-1.5 text-left text-xs font-semibold text-navy-800"
                    >
                      <span>{collapsed ? "▶" : "▼"}</span>
                      <span>
                        {group.tradeLabel} · 소계 {formatMoney(group.subtotal)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addRowForTrade(group.tradeLabel)}
                      className="rounded-md border border-gold-300 bg-gold-50 px-2 py-1 text-[11px] font-medium text-navy-800"
                    >
                      + 항목 추가
                    </button>
                    {showLxImport &&
                    group.tradeLabel === LX_WINDOW_TRADE_NAME ? (
                      <button
                        type="button"
                        onClick={() => openLxImportForTrade(group.tradeLabel)}
                        className="rounded-md border border-navy-800/20 bg-white px-2 py-1 text-[11px] font-semibold text-navy-900"
                      >
                        LX 엑셀 가져오기
                      </button>
                    ) : null}
                  </div>
                  {collapsed ? null : rows.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-slate-400">
                      세부항목 없음 (출력 제외)
                    </p>
                  ) : (
                    rows.map((row, idxInGroup) => {
                    const qty = toNumber(row.quantity);
                    const computedAmount =
                      qty > 0
                        ? Math.round(qty * toNumber(row.unit_price))
                        : toNumber(row.amount);
                    const mobileErr = resolveRowError(row);
                    return (
                      <details
                        key={row.key}
                        className="rounded-lg border border-slate-200 bg-white open:shadow-sm"
                      >
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {row.item_name || "품목 미입력"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {group.tradeLabel}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                            {formatMoney(computedAmount)}
                          </p>
                        </summary>
                        <div className="space-y-2 border-t border-slate-100 px-3 py-3">
                          {tradeSelect(row)}
                          <input
                            value={row.item_name}
                            onChange={(e) =>
                              updateRow(row.key, { item_name: e.target.value })
                            }
                            placeholder="품목"
                            className={cellInputClass}
                          />
                          <input
                            value={row.description}
                            onChange={(e) =>
                              updateRow(row.key, {
                                description: e.target.value,
                              })
                            }
                            placeholder="규격"
                            className={cellInputClass}
                          />
                          {renderRemarkField(row)}
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={row.cost_type}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  cost_type: normalizeQuoteCostType(e.target.value),
                                })
                              }
                              className={cellInputClass}
                            >
                              {QUOTE_COST_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {quoteCostTypeLabel(t)}
                                </option>
                              ))}
                            </select>
                            <select
                              value={row.unit}
                              onChange={(e) =>
                                updateRow(row.key, { unit: e.target.value })
                              }
                              className={cellInputClass}
                            >
                              <option value="">단위</option>
                              {UNIT_OPTIONS.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                            <input
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  quantity: e.target.value,
                                })
                              }
                              placeholder="수량"
                              inputMode="decimal"
                              className={cellInputClass}
                            />
                            <input
                              value={row.unit_price}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  unit_price: digitsOnlyMoney(e.target.value),
                                })
                              }
                              placeholder="단가(원)"
                              inputMode="numeric"
                              className={`${cellInputClass} text-right`}
                              title="원 단위 단가"
                            />
                          </div>
                          {moneyHint(computedAmount) ? (
                            <p
                              className={`text-[11px] tabular-nums ${
                                computedAmount >= QUOTE_LINE_AMOUNT_WARN
                                  ? "text-amber-700"
                                  : "text-slate-500"
                              }`}
                            >
                              금액 {moneyHint(computedAmount)}
                              {qty > 0 ? " · 수량×단가" : ""}
                            </p>
                          ) : null}
                          {renderLxDiscountControls(row, true)}
                          <div>
                            <p className="mb-1 text-[11px] font-medium text-slate-600">
                              LX 할인 대상 자재금액
                            </p>
                            {renderLxBaseAmountCell(row)}
                          </div>
                          {mobileErr ? (
                            <p className="text-xs text-red-600">{mobileErr}</p>
                          ) : null}
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                aria-label="항목 위로"
                                disabled={idxInGroup === 0}
                                onClick={() => moveItemInTrade(row.key, "up")}
                                className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                aria-label="항목 아래로"
                                disabled={idxInGroup === rows.length - 1}
                                onClick={() =>
                                  moveItemInTrade(row.key, "down")
                                }
                                className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                              >
                                ↓
                              </button>
                            </div>
                            <button
                              type="button"
                              aria-label="항목 삭제"
                              onClick={() => removeRow(row.key)}
                              className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </details>
                    );
                  })
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {isSimple ? (
        <button
          type="button"
          onClick={() => addRowForTrade("미분류")}
          className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-gold-100"
        >
          + 항목 추가
        </button>
      ) : (
        <button
          type="button"
          onClick={() => addRowForTrade("미분류")}
          className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-gold-100"
        >
          + 미분류 행 추가
        </button>
      )}

      {lxImportOpen ? (
        <LxWindowExcelImportModal
          open={lxImportOpen}
          onClose={() => setLxImportOpen(false)}
          createRow={createRow}
          onApply={({ rows: imported, promotionDiscount, promotionMemo }) => {
            onItemsChange((prev) => {
              // 빈 placeholder 창호 행이 있으면 뒤에 붙이고, 공종은 창호공사 유지
              const withoutEmptyWindowPlaceholders = prev.filter((row) => {
                if (row.trade_name !== LX_WINDOW_TRADE_NAME) return true;
                if (!row.isPlaceholder) return true;
                const empty =
                  !row.item_name.trim() &&
                  !row.description.trim() &&
                  toNumber(row.amount) <= 0;
                return !empty;
              });
              return [...withoutEmptyWindowPlaceholders, ...imported];
            });
            if (
              promotionDiscount > 0 &&
              typeof onApplyPromotionDiscount === "function"
            ) {
              onApplyPromotionDiscount(promotionDiscount, promotionMemo);
            }
            // 창호공사 공종이 tradeOrder에 없으면 추가
            if (!tradeOrder.includes(LX_WINDOW_TRADE_NAME)) {
              onTradeOrderChange([...tradeOrder, LX_WINDOW_TRADE_NAME]);
            }
          }}
        />
      ) : null}
    </div>
  );
}

export function initialTradeOrderFromItems(
  items: QuoteLineRow[],
  quoteMode: QuoteMode,
): string[] {
  const fromItems = extractTradeOrder(items, quoteMode);
  if (quoteMode !== "detailed") return fromItems;

  // 상세견적: 대표공종을 기본 순서로 앞에 두고, 기존·커스텀 공종을 뒤에 유지
  const seen = new Set<string>();
  const order: string[] = [];
  for (const trade of TRADE_SUGGESTIONS) {
    if (seen.has(trade)) continue;
    seen.add(trade);
    order.push(trade);
  }
  for (const trade of fromItems) {
    if (seen.has(trade)) continue;
    seen.add(trade);
    order.push(trade);
  }
  return order;
}
