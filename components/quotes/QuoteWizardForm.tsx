"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createQuoteAction,
  updateQuoteAction,
  type QuoteActionResult,
} from "@/app/actions/quote-mgmt";
import { formatEmployeeLabel } from "@/lib/crm/constants";
import {
  ERP_QUOTE_STATUSES,
  ERP_QUOTE_TYPES,
  QUOTE_DOCUMENT_TITLES,
  QUOTE_MODE_LABELS,
  DEFAULT_QUOTE_VAT_MODE,
  DEFAULT_QUOTE_VAT_RATE,
  canCostTypeHaveLx,
  computeQuoteAmounts,
  formatLxDiscountSummaryLabel,
  normalizeQuoteCostType,
  isActiveQuoteVatMode,
  normalizeQuoteVatMode,
  normalizeQuoteVatRate,
  resolveQuoteVatDisplayAmounts,
  quoteDocumentTitle,
  type QuoteCostType,
  type QuoteMode,
  type QuoteVatMode,
} from "@/lib/crm/quote-constants";
import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import type { QuoteDocumentModel } from "@/lib/crm/quote-document";
import {
  flattenItemsByTradeOrder,
} from "@/lib/crm/quote-trade-groups";
import QuoteTradeItemsPanel, {
  initialTradeOrderFromItems,
  type QuoteLineRow,
} from "@/components/quotes/QuoteTradeItemsPanel";
import type { Employee, ErpQuote, ErpQuoteType } from "@/types/database";

type CompanyVatSettingsProp = {
  quote_vat_input_mode: QuoteVatMode;
  quote_vat_rate: number;
};

const QuotePreviewModal = dynamic(
  () => import("@/components/quotes/QuotePreviewModal"),
  { ssr: false },
);

type WizardCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  assigned_employee_id: string | null;
};

type QuoteWizardFormProps = {
  mode: "create" | "edit";
  employees: Employee[];
  customers: WizardCustomer[];
  initialCustomerId?: string | null;
  initialQuote?: ErpQuote | null;
  /** 페이지 로더에서 1회 조회한 회사 표지 브랜드 */
  brand?: QuoteBrandProfile | null;
  /** 신규 작성 시 회사 VAT 기본값 (페이지 1회 조회) */
  companyVatSettings?: CompanyVatSettingsProp | null;
};

type TradeItemRow = QuoteLineRow;

const STEPS = [
  { key: 1, label: "고객선택" },
  { key: 2, label: "견적유형" },
  { key: 3, label: "기본정보" },
  { key: 4, label: "금액/공종" },
  { key: 5, label: "파일" },
  { key: 6, label: "확인·저장" },
] as const;

const initialState: QuoteActionResult = { success: false };

function rowKey(): string {
  return `row-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function toRow(source?: Partial<TradeItemRow>): TradeItemRow {
  const costType = (
    source?.cost_type
      ? normalizeQuoteCostType(source.cost_type)
      : "기타"
  ) as QuoteCostType;
  const isLx =
    canCostTypeHaveLx(costType) && Boolean(source?.is_lx_material);
  const dbId =
    typeof source?.id === "string" && source.id.trim() ? source.id.trim() : null;
  return {
    key: source?.key ?? dbId ?? rowKey(),
    id: dbId,
    trade_name: source?.trade_name ?? "",
    item_name: source?.item_name ?? "",
    description: source?.description ?? "",
    remark: source?.remark ?? "",
    quantity: source?.quantity ?? "",
    unit: source?.unit ?? "",
    unit_price: source?.unit_price ?? "0",
    amount: source?.amount ?? "0",
    cost_type: costType,
    is_lx_material: isLx,
    lx_discount_base_amount: source?.lx_discount_base_amount ?? "",
    lx_discount_type: source?.lx_discount_type ?? "",
    lx_discount_value: source?.lx_discount_value ?? "0",
    isPlaceholder: source?.isPlaceholder,
  };
}

function toNumber(value: string): number {
  const num = Number(String(value).replace(/,/g, "").trim() || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
}

function resolveInitialMode(quote?: ErpQuote | null): QuoteMode {
  if (quote?.quote_mode === "detailed") return "detailed";
  if (quote?.quote_mode === "simple") return "simple";
  // quote_mode 미적용/누락 시에만 보조 추정 (저장값 임의 변경 금지)
  if (
    quote?.quote_items?.some(
      (i) =>
        (i.quantity != null && Number(i.quantity) !== 0) ||
        (i.unit_price ?? 0) > 0 ||
        Boolean(i.description?.trim()),
    )
  ) {
    return "detailed";
  }
  return "simple";
}

function mapQuoteItemsToRows(
  quote: ErpQuote | null | undefined,
  mode: QuoteMode,
): TradeItemRow[] {
  return (quote?.quote_items ?? []).map((item) => {
    const itemName = item.item_name ?? "";
    const tradeName = item.trade_name ?? "";
    // 간편 레거시: trade===item 이면 표시용 공종만 비움(데이터 삭제가 아님)
    const legacySynced =
      mode === "simple" && Boolean(tradeName) && tradeName === itemName;
    const typeRaw = String(item.lx_discount_type ?? "").trim();
    const lxType =
      typeRaw === "none" || typeRaw === "rate" || typeRaw === "fixed"
        ? typeRaw
        : ("" as const);
    const costType = normalizeQuoteCostType(item.cost_type);
    const baseRaw = item.lx_discount_base_amount;
    // 시공+자재: 0/미저장은 빈 입력으로 복원(전체금액을 자재로 추정하지 않음)
    const baseAmount =
      costType === "시공+자재" &&
      (baseRaw == null || Number(baseRaw) === 0)
        ? ""
        : String(baseRaw ?? 0);
    return toRow({
      key: item.id,
      id: item.id,
      trade_name: legacySynced ? "" : tradeName,
      item_name: itemName || (legacySynced ? tradeName : ""),
      description: item.description ?? "",
      remark: item.remark ?? "",
      quantity: item.quantity != null ? String(item.quantity) : "",
      unit: item.unit ?? "",
      unit_price: String(item.unit_price ?? 0),
      amount: String(item.amount ?? 0),
      cost_type: costType,
      is_lx_material: Boolean(item.is_lx_material),
      lx_discount_base_amount: baseAmount,
      lx_discount_type: lxType,
      lx_discount_value: String(item.lx_discount_value ?? 0),
    });
  });
}

export default function QuoteWizardForm({
  mode,
  employees,
  customers,
  initialCustomerId,
  initialQuote,
  brand = null,
  companyVatSettings = null,
}: QuoteWizardFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createQuoteAction : updateQuoteAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [step, setStep] = useState(mode === "edit" ? 4 : 1);
  const [stepError, setStepError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(
    initialQuote?.customer_id ?? initialCustomerId ?? "",
  );
  const [customerQuery, setCustomerQuery] = useState("");

  const [quoteType, setQuoteType] = useState<ErpQuoteType | "">(
    (initialQuote?.quote_type as ErpQuoteType) ?? "",
  );
  const [quoteMode, setQuoteMode] = useState<QuoteMode>(() =>
    resolveInitialMode(initialQuote),
  );

  const [title, setTitle] = useState(initialQuote?.title ?? "");
  const [quoteNumber] = useState(initialQuote?.quote_number ?? "");
  const [status, setStatus] = useState(initialQuote?.status ?? "작성중");
  const [validUntil, setValidUntil] = useState(
    initialQuote?.valid_until ?? "",
  );
  const [issuedAt, setIssuedAt] = useState(
    initialQuote?.issued_at ?? new Date().toISOString().slice(0, 10),
  );
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(() => {
    if (mode === "edit" || initialQuote) {
      return initialQuote?.assigned_employee_id ?? "";
    }
    const cid = initialCustomerId ?? "";
    if (!cid) return "";
    return (
      customers.find((c) => c.id === cid)?.assigned_employee_id ?? ""
    );
  });
  const [memo, setMemo] = useState(initialQuote?.memo ?? "");
  const [customerMessage, setCustomerMessage] = useState(
    initialQuote?.customer_message ?? "",
  );

  /** 신규 생성 idempotency — 마운트 시 1회 생성, 재제출에도 동일 유지 */
  const [createRequestId] = useState(() => crypto.randomUUID());

  const [totalAmount, setTotalAmount] = useState(
    String(initialQuote?.total_amount ?? 0),
  );
  const [discountAmount, setDiscountAmount] = useState(
    String(initialQuote?.discount_amount ?? 0),
  );
  const [lxDiscountRate, setLxDiscountRate] = useState(
    String(initialQuote?.lx_discount_rate ?? 0),
  );

  const [items, setItems] = useState<TradeItemRow[]>(() => {
    const initialMode = resolveInitialMode(initialQuote);
    const mapped = mapQuoteItemsToRows(initialQuote, initialMode);
    // 신규 생성 + 간편 + 항목 없음일 때만 기본 빈 행 1개
    if (
      mode === "create" &&
      mapped.length === 0 &&
      initialMode === "simple"
    ) {
      return [toRow({ cost_type: "자재" })];
    }
    return mapped;
  });
  const [tradeOrder, setTradeOrder] = useState<string[]>(() => {
    const initialMode = resolveInitialMode(initialQuote);
    const mapped = mapQuoteItemsToRows(initialQuote, initialMode);
    return initialTradeOrderFromItems(mapped, initialMode);
  });
  /** 화면에서 삭제한 기존 DB 항목 ID (저장 시 soft-delete) */
  const [removedExistingItemIds, setRemovedExistingItemIds] = useState<
    string[]
  >([]);
  /** 편집 시작 시 활성 item ID (변경되지 않음, 저장 사전 가드용) */
  const [originalExistingItemIds] = useState<string[]>(() =>
    mapQuoteItemsToRows(
      initialQuote,
      resolveInitialMode(initialQuote),
    )
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id)),
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);

  const isInterior = quoteType === "인테리어";
  const isSimple = quoteMode === "simple";
  const isEdit = mode === "edit";
  const savableItems = useMemo(
    () =>
      flattenItemsByTradeOrder(items, tradeOrder, quoteMode).filter(
        (row) =>
          !row.isPlaceholder &&
          Boolean((row.item_name || row.trade_name).trim() || toNumber(row.amount) > 0),
      ),
    [items, tradeOrder, quoteMode],
  );
  const hasItems = savableItems.length > 0;

  const amounts = useMemo(() => {
    const parsedItems = savableItems.map((row) => {
      const qty = row.quantity !== "" ? toNumber(row.quantity) : 0;
      const amount =
        qty > 0
          ? Math.round(qty * toNumber(row.unit_price))
          : toNumber(row.amount);
      return {
        trade_name: row.trade_name,
        item_name: row.item_name,
        amount,
        cost_type: row.cost_type,
        is_lx_material: canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
        lx_discount_base_amount: toNumber(row.lx_discount_base_amount),
        lx_discount_type: row.lx_discount_type || null,
        lx_discount_value:
          row.lx_discount_type === "" ? null : toNumber(row.lx_discount_value),
      };
    });
    return computeQuoteAmounts({
      items: isSimple || hasItems ? parsedItems : [],
      fallbackTotal: toNumber(totalAmount),
      discountAmount: toNumber(discountAmount),
      lxDiscountRate: toNumber(lxDiscountRate),
    });
  }, [savableItems, isSimple, hasItems, totalAmount, discountAmount, lxDiscountRate]);

  const total = amounts.total_amount;
  const discount = amounts.discount_amount;
  const lxDiscount = amounts.lx_discount_amount;
  const finalAmount = amounts.final_amount;

  const wizardVatMode: QuoteVatMode | null =
    mode === "edit"
      ? normalizeQuoteVatMode(initialQuote?.vat_mode)
      : (companyVatSettings?.quote_vat_input_mode ??
        normalizeQuoteVatMode(initialQuote?.vat_mode) ??
        DEFAULT_QUOTE_VAT_MODE);
  const wizardVatRate =
    mode === "edit" && isActiveQuoteVatMode(initialQuote?.vat_mode)
      ? normalizeQuoteVatRate(initialQuote?.vat_rate)
      : normalizeQuoteVatRate(
          companyVatSettings?.quote_vat_rate ??
            initialQuote?.vat_rate ??
            DEFAULT_QUOTE_VAT_RATE,
        );

  const vatAmounts = useMemo(
    () =>
      resolveQuoteVatDisplayAmounts({
        discountedAmount: finalAmount,
        vatMode: wizardVatMode,
        vatRate: wizardVatRate,
      }),
    [finalAmount, wizardVatMode, wizardVatRate],
  );

  const lxDiscountLabel = useMemo(
    () =>
      formatLxDiscountSummaryLabel({
        items: savableItems.map((row) => ({
          is_lx_material:
            canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
          cost_type: row.cost_type,
          lx_discount_type: row.lx_discount_type || null,
          lx_discount_value:
            row.lx_discount_type === ""
              ? null
              : toNumber(row.lx_discount_value),
        })),
        quoteLevelRate: toNumber(lxDiscountRate),
        lxDiscountAmount: lxDiscount,
      }),
    [savableItems, lxDiscountRate, lxDiscount],
  );

  useEffect(() => {
    if (state.success && mode === "edit" && state.quoteId) {
      router.push(`/quotes/${state.quoteId}`);
    }
  }, [state, mode, router]);

  /** 생성 모드: 확인(6) 단계에서만 DB 제출 허용 */
  const canSubmitCreate = mode !== "create" || step === 6;

  /** 신규 작성: 고객 선택/해제 시 담당자를 고객 담당자로 맞춘다 (수동 변경 가능) */
  function applyCustomerSelection(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    if (mode !== "create") return;
    if (!nextCustomerId) {
      setAssignedEmployeeId("");
      return;
    }
    setAssignedEmployeeId(
      customers.find((c) => c.id === nextCustomerId)?.assigned_employee_id ??
        "",
    );
  }

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 30);
    return customers
      .filter((c) =>
        [c.name, c.phone, c.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 30);
  }, [customers, customerQuery]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const assignedEmployee = employees.find((e) => e.id === assignedEmployeeId);

  function goNext() {
    if (step === 1 && !customerId) {
      setStepError("고객을 선택해 주세요.");
      return;
    }
    if (step === 2 && !quoteType) {
      setStepError("견적유형을 선택해 주세요.");
      return;
    }
    if (step === 3 && !title.trim()) {
      setStepError("견적명을 입력해 주세요.");
      return;
    }
    if (step === 4) {
      if (isSimple) {
        if (savableItems.length === 0) {
          setStepError("간편견적은 항목을 1개 이상 입력해 주세요.");
          return;
        }
      } else if (isInterior && savableItems.length === 0) {
        setStepError("공종 내역을 1개 이상 추가해 주세요.");
        return;
      }
      for (const row of savableItems) {
        if (!(row.cost_type === "시공+자재" && row.is_lx_material)) continue;
        const qty = row.quantity !== "" ? toNumber(row.quantity) : 0;
        const amount =
          qty > 0
            ? Math.round(qty * toNumber(row.unit_price))
            : toNumber(row.amount);
        const base = toNumber(row.lx_discount_base_amount);
        const raw = row.lx_discount_base_amount.trim();
        if (raw === "" || base <= 0) {
          setStepError(
            "자재+시공 항목의 LX 할인 대상 자재금액을 입력해주세요.",
          );
          return;
        }
        if (base > amount) {
          setStepError(
            "LX 자재금액은 항목 총금액 이하로 입력해주세요.",
          );
          return;
        }
      }
      const rate = toNumber(lxDiscountRate);
      if (rate < 0 || rate > 100) {
        setStepError("LX 자재 할인율은 0~100 사이여야 합니다.");
        return;
      }
    }
    setStepError(null);
    setStep((s) => Math.min(6, s + 1));
  }

  function goPrev() {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function validateLxBaseBeforeSave(): string | null {
    for (const row of savableItems) {
      if (!(row.cost_type === "시공+자재" && row.is_lx_material)) continue;
      const qty = row.quantity !== "" ? toNumber(row.quantity) : 0;
      const amount =
        qty > 0
          ? Math.round(qty * toNumber(row.unit_price))
          : toNumber(row.amount);
      const base = toNumber(row.lx_discount_base_amount);
      const raw = row.lx_discount_base_amount.trim();
      if (raw === "" || base <= 0) {
        return "자재+시공 항목의 LX 할인 대상 자재금액을 입력해주세요.";
      }
      if (base > amount) {
        return "LX 자재금액은 항목 총금액 이하로 입력해주세요.";
      }
    }
    return null;
  }

  const itemsJson = JSON.stringify(
    savableItems.map((row) => {
      const qty = row.quantity !== "" ? toNumber(row.quantity) : 0;
      const unitPrice = toNumber(row.unit_price);
      const amount =
        qty > 0 ? Math.round(qty * unitPrice) : toNumber(row.amount);
      return {
        id: row.id || null,
        client_key: row.key,
        trade_name: row.trade_name || "미분류",
        item_name: row.item_name || row.trade_name || null,
        description: row.description || null,
        remark: (() => {
          const text = String(row.remark ?? "").trim();
          if (!text) return null;
          return text.length > 500 ? text.slice(0, 500) : text;
        })(),
        quantity: row.quantity !== "" ? qty : null,
        unit: row.unit || null,
        unit_price: unitPrice,
        amount,
        cost_type: row.cost_type,
        is_lx_material: canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
        lx_discount_base_amount:
          row.cost_type === "시공+자재" && row.is_lx_material
            ? toNumber(row.lx_discount_base_amount)
            : 0,
        lx_discount_type: row.lx_discount_type || null,
        lx_discount_value:
          row.lx_discount_type === "" ? null : toNumber(row.lx_discount_value),
      };
    }),
  );

  const removedItemIdsJson = JSON.stringify(removedExistingItemIds);
  const originalItemIdsJson = JSON.stringify(originalExistingItemIds);

  const previewModel: QuoteDocumentModel = useMemo(
    () => ({
      customerName: selectedCustomer?.name ?? "",
      title,
      quoteType: quoteType || null,
      quoteMode,
      quoteNumber: mode === "create" ? null : quoteNumber || null,
      isDraft: mode === "create",
      versionNumber: initialQuote?.version_number ?? 1,
      status,
      validUntil: validUntil || null,
      issuedAt: issuedAt || null,
      customerMessage: customerMessage || null,
      discountAmount: discount,
      lxDiscountRate: toNumber(lxDiscountRate),
      vatMode: wizardVatMode,
      vatRate: wizardVatRate,
      brand,
      showCover: includeCover,
      assigneeName: assignedEmployee?.name ?? null,
      assigneeTitle: assignedEmployee?.title ?? null,
      items: savableItems.map((row, index) => {
        const qty = row.quantity !== "" ? toNumber(row.quantity) : 0;
        const amount =
          qty > 0
            ? Math.round(qty * toNumber(row.unit_price))
            : toNumber(row.amount);
        return {
          trade_name: row.trade_name || "미분류",
          item_name: row.item_name || null,
          description: row.description || null,
          remark: (() => {
            const text = String(row.remark ?? "").trim();
            if (!text) return null;
            return text.length > 500 ? text.slice(0, 500) : text;
          })(),
          quantity: row.quantity !== "" ? qty : null,
          unit: row.unit || null,
          unit_price: toNumber(row.unit_price),
          amount,
          cost_type: row.cost_type,
          is_lx_material:
            canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
          lx_discount_base_amount:
            row.cost_type === "시공+자재" && row.is_lx_material
              ? toNumber(row.lx_discount_base_amount)
              : 0,
          lx_discount_type: row.lx_discount_type || null,
          lx_discount_value:
            row.lx_discount_type === ""
              ? null
              : toNumber(row.lx_discount_value),
          sort_order: index,
        };
      }),
    }),
    [
      selectedCustomer?.name,
      title,
      quoteType,
      quoteMode,
      mode,
      quoteNumber,
      initialQuote?.version_number,
      status,
      validUntil,
      issuedAt,
      customerMessage,
      discount,
      lxDiscountRate,
      wizardVatMode,
      wizardVatRate,
      savableItems,
      brand,
      includeCover,
      assignedEmployee?.name,
      assignedEmployee?.title,
    ],
  );

  return (
    <form
      action={canSubmitCreate ? formAction : undefined}
      className="space-y-5"
      onSubmit={(e) => {
        if (!canSubmitCreate) {
          e.preventDefault();
          return;
        }
        if (pending) {
          e.preventDefault();
          return;
        }
        const err = validateLxBaseBeforeSave();
        if (err) {
          e.preventDefault();
          setStepError(err);
        }
      }}
    >
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="quote_type" value={quoteType} />
      <input type="hidden" name="quote_mode" value={quoteMode} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="quote_number" value={quoteNumber} />
      <input type="hidden" name="status" value={status} />
      <input
        type="hidden"
        name="assigned_employee_id"
        value={assignedEmployeeId}
      />
      <input type="hidden" name="issued_at" value={issuedAt} />
      <input type="hidden" name="valid_until" value={validUntil} />
      <input type="hidden" name="memo" value={memo} />
      <input type="hidden" name="customer_message" value={customerMessage} />
      <input type="hidden" name="total_amount" value={String(total)} />
      <input type="hidden" name="discount_amount" value={String(discount)} />
      <input type="hidden" name="lx_discount_rate" value={lxDiscountRate} />
      <input type="hidden" name="final_amount" value={String(finalAmount)} />
      <input type="hidden" name="items_json" value={itemsJson} />
      {mode === "create" ? (
        <input
          type="hidden"
          name="request_id"
          value={createRequestId}
        />
      ) : null}
      <input
        type="hidden"
        name="removed_item_ids_json"
        value={removedItemIdsJson}
      />
      <input
        type="hidden"
        name="original_item_ids_json"
        value={originalItemIdsJson}
      />
      {mode === "edit" && initialQuote && (
        <input type="hidden" name="quote_id" value={initialQuote.id} />
      )}

      {mode === "edit" && initialQuote ? (
        <div className="dashboard-card space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-900">견적 내용 수정</h2>
              <p className="mt-1 text-sm text-slate-600 break-keep">
                {selectedCustomer?.name ?? "-"}
                {title ? ` · ${title}` : ""}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
              <div>
                <dt className="text-slate-400">견적번호</dt>
                <dd className="font-medium text-slate-800">
                  {quoteNumber || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">형식</dt>
                <dd className="font-medium text-slate-800">
                  {quoteDocumentTitle(quoteMode)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">유형</dt>
                <dd className="font-medium text-slate-800">{quoteType || "-"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">상태</dt>
                <dd className="font-medium text-slate-800">{status}</dd>
              </div>
            </dl>
          </div>
          <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            저장된 견적 형식({QUOTE_MODE_LABELS[quoteMode]})으로 수정합니다. 형식
            변경은 별도 기능이며 이 화면에서는 데이터를 초기화하지 않습니다.
          </p>
        </div>
      ) : (
        <div className="dashboard-card flex flex-wrap items-center gap-1 p-3">
          {STEPS.map((s, idx) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setStepError(null);
                setStep(s.key);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                step === s.key
                  ? "bg-navy-800 text-white"
                  : step > s.key
                    ? "text-navy-800 hover:bg-navy-800/5"
                    : "text-gray-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  step === s.key
                    ? "bg-gold-500 text-navy-900"
                    : step > s.key
                      ? "bg-navy-800/10 text-navy-800"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {s.key}
              </span>
              {s.label}
              {idx < STEPS.length - 1 && (
                <span className="mx-1 hidden text-gray-300 sm:inline">›</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="dashboard-card p-5">
        {(mode === "create" ? step === 1 : false) && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              1. 고객선택
            </h2>
            {selectedCustomer ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-navy-900">
                    {selectedCustomer.name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {selectedCustomer.phone}
                    {selectedCustomer.address
                      ? ` · ${selectedCustomer.address}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => applyCustomerSelection("")}
                  disabled={mode === "edit"}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <input
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="고객명 · 연락처 · 공사주소로 검색"
                  className={inputClass}
                />
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
                  {filteredCustomers.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">
                      일치하는 고객이 없습니다.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {filteredCustomers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => applyCustomerSelection(c.id)}
                            className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-gray-50"
                          >
                            <span className="text-sm font-medium text-gray-900">
                              {c.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {c.phone}
                              {c.address ? ` · ${c.address}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {mode === "create" && step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              2. 견적유형
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ERP_QUOTE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setQuoteType(type)}
                  className={`rounded-xl border-2 px-4 py-6 text-center text-sm font-semibold transition ${
                    quoteType === type
                      ? "border-navy-800 bg-navy-800/5 text-navy-900"
                      : "border-gray-200 text-gray-600 hover:border-gold-400"
                  }`}
                >
                  {type}
                  <p className="mt-1 text-xs font-normal text-gray-400">
                    {type === "창호"
                      ? "총금액 입력 · 공종 선택 · LX 할인"
                      : type === "인테리어"
                        ? "공종 필수(상세) · LX 할인"
                        : "총금액 입력 · 공종 선택"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {(isEdit || step === 3) && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "기본정보" : "3. 기본정보"}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="견적명" required className="md:col-span-2">
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 당산2차 204동 702호 창호 견적"
                  className={inputClass}
                />
              </Field>
              <Field label="견적번호">
                {mode === "create" ? (
                  <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    저장 시 YYYYMMDD-순번으로 자동 생성
                  </p>
                ) : (
                  <input
                    value={quoteNumber || "-"}
                    readOnly
                    className={`${inputClass} bg-gray-50 text-gray-600`}
                  />
                )}
              </Field>
              <Field label="상태">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  {ERP_QUOTE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="담당자">
                <select
                  value={assignedEmployeeId}
                  onChange={(e) => setAssignedEmployeeId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">미배정</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {formatEmployeeLabel(employee.name, employee.title)}
                    </option>
                  ))}
                </select>
                {mode === "create" && (
                  <p className="mt-1 text-xs text-gray-500">
                    고객 담당자가 자동 선택됩니다. 필요한 경우 변경할 수 있습니다.
                  </p>
                )}
              </Field>
              <Field label="발행일">
                <input
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="유효기간">
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="내부 메모 (고객 비공개)" className="md:col-span-2">
                <textarea
                  rows={3}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="내부 참고용 메모"
                  className={`${inputClass} resize-y`}
                />
              </Field>
              <Field label="고객용 안내 문구 (발송 시, 선택)" className="md:col-span-2">
                <textarea
                  rows={4}
                  value={customerMessage}
                  onChange={(e) => setCustomerMessage(e.target.value)}
                  placeholder={
                    "안녕하세요. 에잇티입니다.\n요청하신 견적서를 보내드립니다."
                  }
                  className={`${inputClass} resize-y`}
                />
              </Field>
            </div>
          </div>
        )}

        {(isEdit || step === 4) && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "금액/공종" : "4. 금액/공종"}
            </h2>

                        {isEdit ? (
              <p className="text-sm font-semibold text-gray-900">
                {QUOTE_DOCUMENT_TITLES[quoteMode]}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(["simple", "detailed"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setQuoteMode(m);
                      if (m === "simple" && items.length === 0) {
                        setItems([toRow({ cost_type: "자재" })]);
                        setTradeOrder(["미분류"]);
                      }
                    }}
                    className={`rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition ${
                      quoteMode === m
                        ? "border-navy-800 bg-navy-800 text-white"
                        : "border-gray-200 text-gray-600 hover:border-gold-400"
                    }`}
                  >
                    {QUOTE_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            )}

            {!isEdit && (
              <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                {isSimple
                  ? "간편견적: 공종·항목내역·금액을 한 표에서 빠르게 입력합니다."
                  : "상세견적: 한 표에서 공종·품목·규격·수량·단가를 입력합니다."}
                {isInterior && !isSimple
                  ? " 인테리어 상세견적은 공종을 1개 이상 입력해야 합니다."
                  : ""}
              </p>
            )}

            <QuoteTradeItemsPanel
              quoteMode={quoteMode}
              items={items}
              tradeOrder={tradeOrder}
              onTradeOrderChange={setTradeOrder}
              onItemsChange={(updater) => setItems(updater)}
              onRemoveExistingItem={(itemId) => {
                setRemovedExistingItemIds((prev) =>
                  prev.includes(itemId) ? prev : [...prev, itemId],
                );
              }}
              createRow={(partial) => toRow({ ...partial, id: null })}
              isInterior={isInterior}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="rounded-lg border border-navy-800/20 bg-white px-4 py-2 text-sm font-medium text-navy-800 hover:bg-navy-800/5"
              >
                미리보기
              </button>
            </div>

<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="총견적금액(원)">
                {isSimple || hasItems ? (
                  <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatMoney(total)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {isSimple ? "항목 합계" : "공종 합계"}
                    </p>
                  </div>
                ) : (
                  <input
                    inputMode="numeric"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className={inputClass}
                  />
                )}
              </Field>
              <Field label="특별할인금액(원)">
                <input
                  inputMode="numeric"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="LX 자재 할인율(%) · 견적단위(기존)">
                <input
                  inputMode="decimal"
                  value={lxDiscountRate}
                  onChange={(e) => setLxDiscountRate(e.target.value)}
                  placeholder="0~100"
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  항목 할인이 비어 있는 LX 항목에 적용 · 합계{" "}
                  {formatMoney(amounts.lx_material_sum)} · 할인{" "}
                  {formatMoney(lxDiscount)}
                </p>
              </Field>
              <div className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
                <p className="text-xs text-navy-700">고객 최종금액</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">
                  {formatMoney(vatAmounts.customer_total_amount)}
                </p>
                <p className="mt-1 text-[11px] text-navy-700/70">
                  공급가 {formatMoney(vatAmounts.supply_amount)}
                  {vatAmounts.vat_mode != null
                    ? ` · 부가세 ${formatMoney(vatAmounts.vat_amount)}`
                    : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-navy-700/60">
                  총액 − 특별할인 − LX할인
                  {vatAmounts.vat_mode === "exclusive" ? " + 부가세" : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={isEdit || step === 5 ? "space-y-4" : "hidden"}>
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "첨부파일" : "5. 파일"}
          </h2>
          <p className="text-sm text-gray-500">
            견적서 PDF/Excel 파일을 첨부해 주세요. (pdf, xls, xlsx · 최대
            30MB)
          </p>
          <input
            type="file"
            name="files"
            multiple
            accept=".pdf,.xls,.xlsx"
            onChange={(e) =>
              setNewFiles(e.target.files ? Array.from(e.target.files) : [])
            }
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
          />
          {newFiles.length > 0 && (
            <ul className="space-y-1 text-sm text-gray-600">
              {newFiles.map((f) => (
                <li key={f.name}>
                  · {f.name} ({(f.size / 1024).toFixed(0)}KB)
                </li>
              ))}
            </ul>
          )}

          {initialQuote?.quote_files && initialQuote.quote_files.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                기존 첨부파일
              </p>
              <ul className="space-y-1 text-sm text-gray-600">
                {initialQuote.quote_files.map((f) => (
                  <li key={f.id}>
                    · {f.file_name}
                    {f.is_primary ? " (대표)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {mode === "create" && step === 6 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              6. 확인·저장
            </h2>
            <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-4 text-sm md:grid-cols-2">
              <SummaryItem label="고객" value={selectedCustomer?.name ?? "-"} />
              <SummaryItem label="견적유형" value={quoteType || "-"} />
              <SummaryItem
                label="작성방식"
                value={quoteDocumentTitle(quoteMode)}
              />
              <SummaryItem label="견적명" value={title || "-"} />
              <SummaryItem
                label="견적번호"
                value={
                  mode === "create"
                    ? "저장 시 자동 생성"
                    : quoteNumber || "-"
                }
              />
              <SummaryItem label="상태" value={status} />
              <SummaryItem
                label="담당자"
                value={
                  assignedEmployee
                    ? formatEmployeeLabel(
                        assignedEmployee.name,
                        assignedEmployee.title,
                      )
                    : "미배정"
                }
              />
              <SummaryItem label="발행일" value={issuedAt || "-"} />
              <SummaryItem label="유효기간" value={validUntil || "-"} />
              <SummaryItem label="총금액" value={formatMoney(total)} />
              <SummaryItem label="특별할인" value={formatMoney(discount)} />
              <SummaryItem label="LX 자재 할인" value={lxDiscountLabel} />
              <SummaryItem
                label="공급가액"
                value={formatMoney(vatAmounts.supply_amount)}
              />
              <SummaryItem
                label="부가세"
                value={
                  vatAmounts.vat_mode != null
                    ? formatMoney(vatAmounts.vat_amount)
                    : "-"
                }
              />
              <SummaryItem
                label="고객 최종금액"
                value={formatMoney(vatAmounts.customer_total_amount)}
                emphasize
              />
              <SummaryItem
                label="LX 자재 포함"
                value={amounts.is_lx_material ? "예" : "아니오"}
              />
              <SummaryItem
                label="항목 수"
                value={`${savableItems.length}건`}
              />
              <SummaryItem
                label="첨부파일"
                value={`신규 ${newFiles.length}건${
                  initialQuote?.quote_files?.length
                    ? ` · 기존 ${initialQuote.quote_files.length}건`
                    : ""
                }`}
              />
            </dl>

            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
            {state.message && (
              <p className="text-sm text-green-700">{state.message}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="rounded-lg border border-navy-800/20 bg-white px-4 py-2 text-sm font-medium text-navy-800 hover:bg-navy-800/5"
              >
                견적서 미리보기
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={includeCover}
                  onChange={(e) => setIncludeCover(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                표지 포함
              </label>
            </div>
          </div>
        )}
      </div>

      {stepError && <p className="text-sm text-red-600">{stepError}</p>}
      {state.error && isEdit && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.message && isEdit && (
        <p className="text-sm text-green-700">{state.message}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={
              isEdit && initialQuote
                ? `/quotes/${initialQuote.id}`
                : "/quotes"
            }
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            취소
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEdit ? (
            <>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="rounded-lg border border-navy-800/20 bg-white px-4 py-2 text-sm font-medium text-navy-800 hover:bg-navy-800/5"
              >
                미리보기
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-navy-800 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
              >
                {pending ? "저장 중..." : "변경사항 저장"}
              </button>
            </>
          ) : (
            <>
              {step > 1 && (
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  이전
                </button>
              )}
              {step < 6 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-lg bg-navy-800 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700"
                >
                  다음
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={pending || !canSubmitCreate}
                  className="rounded-lg bg-navy-800 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
                >
                  {pending ? "저장 중..." : "최종 저장"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {previewOpen ? (
        <QuotePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          model={previewModel}
          includeCover={includeCover}
          onIncludeCoverChange={setIncludeCover}
        />
      ) : null}
    </form>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd
        className={
          emphasize
            ? "mt-0.5 text-base font-bold text-navy-900"
            : "mt-0.5 font-medium text-gray-800"
        }
      >
        {value}
      </dd>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
