"use client";

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
  QUOTE_COST_TYPES,
  QUOTE_DOCUMENT_TITLES,
  QUOTE_MODE_LABELS,
  TRADE_SUGGESTIONS,
  canCostTypeHaveLx,
  computeQuoteAmounts,
  quoteDocumentTitle,
  type QuoteCostType,
  type QuoteMode,
} from "@/lib/crm/quote-constants";
import type { Employee, ErpQuote, ErpQuoteType } from "@/types/database";

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
};

type TradeItemRow = {
  key: string;
  trade_name: string;
  item_name: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  amount: string;
  cost_type: QuoteCostType;
  is_lx_material: boolean;
  lx_discount_base_amount: string;
};

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
    source?.cost_type &&
    (QUOTE_COST_TYPES as readonly string[]).includes(source.cost_type)
      ? source.cost_type
      : "기타"
  ) as QuoteCostType;
  const isLx =
    canCostTypeHaveLx(costType) && Boolean(source?.is_lx_material);
  return {
    key: rowKey(),
    trade_name: source?.trade_name ?? "",
    item_name: source?.item_name ?? "",
    description: source?.description ?? "",
    quantity: source?.quantity ?? "",
    unit: source?.unit ?? "",
    unit_price: source?.unit_price ?? "0",
    amount: source?.amount ?? "0",
    cost_type: costType,
    is_lx_material: isLx,
    lx_discount_base_amount: source?.lx_discount_base_amount ?? "0",
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
  // 기존 데이터: 공종(수량/단가)이 있으면 상세로 추정
  if (quote?.quote_items?.some((i) => i.quantity != null || (i.unit_price ?? 0) > 0)) {
    return "detailed";
  }
  return "simple";
}

export default function QuoteWizardForm({
  mode,
  employees,
  customers,
  initialCustomerId,
  initialQuote,
}: QuoteWizardFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createQuoteAction : updateQuoteAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [step, setStep] = useState(1);
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
  const [quoteNumber, setQuoteNumber] = useState(
    initialQuote?.quote_number ?? "",
  );
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
    const mapped = (initialQuote?.quote_items ?? []).map((item) =>
      toRow({
        trade_name: item.trade_name,
        item_name: item.item_name || item.trade_name || "",
        description: item.description ?? "",
        quantity: item.quantity != null ? String(item.quantity) : "",
        unit: item.unit ?? "",
        unit_price: String(item.unit_price ?? 0),
        amount: String(item.amount),
        cost_type: (item.cost_type as QuoteCostType) || "기타",
        is_lx_material: Boolean(item.is_lx_material),
        lx_discount_base_amount: String(item.lx_discount_base_amount ?? 0),
      }),
    );
    if (mapped.length === 0 && resolveInitialMode(initialQuote) === "simple") {
      return [toRow({ cost_type: "자재" })];
    }
    return mapped;
  });
  const [customTrade, setCustomTrade] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const isInterior = quoteType === "인테리어";
  const isSimple = quoteMode === "simple";
  const hasItems = items.length > 0;

  const amounts = useMemo(() => {
    const parsedItems = items.map((row) => ({
      amount: toNumber(row.amount),
      cost_type: row.cost_type,
      is_lx_material: canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
      lx_discount_base_amount: toNumber(row.lx_discount_base_amount),
    }));
    return computeQuoteAmounts({
      items: isSimple || hasItems ? parsedItems : [],
      fallbackTotal: toNumber(totalAmount),
      discountAmount: toNumber(discountAmount),
      lxDiscountRate: toNumber(lxDiscountRate),
    });
  }, [items, isSimple, hasItems, totalAmount, discountAmount, lxDiscountRate]);

  const total = amounts.total_amount;
  const discount = amounts.discount_amount;
  const lxDiscount = amounts.lx_discount_amount;
  const finalAmount = amounts.final_amount;

  useEffect(() => {
    if (state.success && mode === "edit" && state.quoteId) {
      router.push(`/quotes/${state.quoteId}`);
    }
  }, [state, mode, router]);

  useEffect(() => {
    if (mode !== "create") return;
    if (!customerId) {
      setAssignedEmployeeId("");
      return;
    }
    const next =
      customers.find((c) => c.id === customerId)?.assigned_employee_id ?? "";
    setAssignedEmployeeId(next);
  }, [mode, customerId, customers]);

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

  function updateRow(key: string, patch: Partial<TradeItemRow>) {
    setItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.cost_type !== undefined && !canCostTypeHaveLx(next.cost_type)) {
          next.is_lx_material = false;
          next.lx_discount_base_amount = "0";
        }
        if (patch.is_lx_material === false) {
          next.lx_discount_base_amount = "0";
        }
        if (
          quoteMode === "detailed" &&
          (patch.quantity !== undefined || patch.unit_price !== undefined)
        ) {
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

  function addTradeRow(tradeName: string) {
    const name = tradeName.trim();
    if (!name) return;
    setItems((prev) => [
      ...prev,
      toRow({ trade_name: name, item_name: name }),
    ]);
  }

  function addSimpleRow() {
    setItems((prev) => [...prev, toRow({ cost_type: "자재" })]);
  }

  function removeRow(key: string) {
    setItems((prev) => prev.filter((row) => row.key !== key));
  }

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
        const valid = items.filter(
          (row) => (row.item_name || row.trade_name).trim() && toNumber(row.amount) >= 0,
        );
        if (valid.length === 0) {
          setStepError("간편견적은 항목을 1개 이상 입력해 주세요.");
          return;
        }
        if (items.some((row) => !(row.item_name || row.trade_name).trim())) {
          setStepError("항목명을 입력해 주세요.");
          return;
        }
      } else if (isInterior && items.length === 0) {
        setStepError("공종 내역을 1개 이상 추가해 주세요.");
        return;
      }
      for (const row of items) {
        if (
          row.cost_type === "시공+자재" &&
          row.is_lx_material &&
          toNumber(row.lx_discount_base_amount) > toNumber(row.amount)
        ) {
          setStepError(
            "LX 할인 대상 자재금액은 항목금액을 초과할 수 없습니다.",
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

  const itemsJson = JSON.stringify(
    items.map((row) => ({
      trade_name: row.trade_name || row.item_name,
      item_name: row.item_name || row.trade_name || null,
      description: row.description || null,
      quantity:
        quoteMode === "detailed" && row.quantity
          ? toNumber(row.quantity)
          : null,
      unit: quoteMode === "detailed" ? row.unit || null : null,
      unit_price:
        quoteMode === "detailed" ? toNumber(row.unit_price) : 0,
      amount: toNumber(row.amount),
      cost_type: row.cost_type,
      is_lx_material: canCostTypeHaveLx(row.cost_type) && row.is_lx_material,
      lx_discount_base_amount:
        row.cost_type === "시공+자재" && row.is_lx_material
          ? toNumber(row.lx_discount_base_amount)
          : 0,
    })),
  );

  return (
    <form action={formAction} className="space-y-5">
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
      {mode === "edit" && initialQuote && (
        <input type="hidden" name="quote_id" value={initialQuote.id} />
      )}

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

      <div className="dashboard-card p-5">
        {step === 1 && (
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
                  onClick={() => setCustomerId("")}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
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
                            onClick={() => setCustomerId(c.id)}
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

        {step === 2 && (
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

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              3. 기본정보
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

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              4. 금액/공종
            </h2>

            <div className="flex flex-wrap gap-2">
              {(["simple", "detailed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setQuoteMode(m);
                    if (m === "simple" && items.length === 0) {
                      setItems([toRow({ cost_type: "자재" })]);
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

            <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              {isSimple
                ? "간편견적: 항목명·구분·금액만 입력합니다. 항목 합계가 총견적금액이 됩니다."
                : "공종 내역을 추가하면 공종 합계가 총견적금액으로 적용됩니다."}
              {isInterior && !isSimple
                ? " 인테리어 상세견적은 공종을 1개 이상 입력해야 합니다."
                : ""}
            </p>

            <h3 className="text-sm font-semibold text-gray-900">
              {QUOTE_DOCUMENT_TITLES[quoteMode]}
            </h3>

            {isSimple ? (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
                        <th className="px-3 py-2 font-medium">항목명</th>
                        <th className="px-3 py-2 font-medium">구분</th>
                        <th className="px-3 py-2 font-medium text-right">금액</th>
                        <th className="px-3 py-2 font-medium text-center">
                          LX 자재
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          LX 할인 대상 자재금액
                        </th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr key={row.key} className="border-b border-gray-100">
                          <td className="px-3 py-2">
                            <input
                              value={row.item_name}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  item_name: e.target.value,
                                  trade_name: e.target.value,
                                })
                              }
                              placeholder="항목명"
                              className={`${cellInputClass} text-gray-900`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={row.cost_type}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  cost_type: e.target.value as QuoteCostType,
                                })
                              }
                              className={`${cellInputClass} text-gray-900`}
                            >
                              {QUOTE_COST_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              value={row.amount}
                              onChange={(e) =>
                                updateRow(row.key, { amount: e.target.value })
                              }
                              inputMode="numeric"
                              className={`${cellInputClass} text-right font-medium text-gray-900`}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.is_lx_material}
                              disabled={!canCostTypeHaveLx(row.cost_type)}
                              onChange={(e) =>
                                updateRow(row.key, {
                                  is_lx_material: e.target.checked,
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500 disabled:opacity-40"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.cost_type === "시공+자재" &&
                            row.is_lx_material ? (
                              <input
                                value={row.lx_discount_base_amount}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    lx_discount_base_amount: e.target.value,
                                  })
                                }
                                inputMode="numeric"
                                placeholder="자재금액"
                                className={`${cellInputClass} text-right font-medium text-gray-900`}
                              />
                            ) : (
                              <span className="text-xs text-gray-700">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeRow(row.key)}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={addSimpleRow}
                  className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-gold-100"
                >
                  + 항목 추가
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    공종 빠른 추가
                    {!isInterior && (
                      <span className="ml-1 font-normal text-gray-400">
                        (선택)
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TRADE_SUGGESTIONS.map((trade) => (
                      <button
                        key={trade}
                        type="button"
                        onClick={() => addTradeRow(trade)}
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
                      placeholder="공종명 직접 입력"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addTradeRow(customTrade);
                        setCustomTrade("");
                      }}
                      className="shrink-0 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      추가
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
                        <th className="px-3 py-2 font-medium">공종</th>
                        <th className="px-3 py-2 font-medium">품목</th>
                        <th className="px-3 py-2 font-medium">구분</th>
                        <th className="px-3 py-2 font-medium">수량</th>
                        <th className="px-3 py-2 font-medium">단위</th>
                        <th className="px-3 py-2 font-medium text-right">단가</th>
                        <th className="px-3 py-2 font-medium text-right">금액</th>
                        <th className="px-3 py-2 font-medium text-center">
                          LX 자재
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          LX 할인 대상 자재금액
                        </th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-3 py-8 text-center text-sm text-gray-700"
                          >
                            {isInterior
                              ? "공종을 추가해 주세요."
                              : "공종이 없으면 아래 총견적금액을 사용합니다."}
                          </td>
                        </tr>
                      ) : (
                        items.map((row) => (
                          <tr key={row.key} className="border-b border-gray-100">
                            <td className="px-3 py-2">
                              <input
                                value={row.trade_name}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    trade_name: e.target.value,
                                  })
                                }
                                className={`${cellInputClass} text-gray-900`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.item_name}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    item_name: e.target.value,
                                  })
                                }
                                placeholder="선택"
                                className={`${cellInputClass} text-gray-900`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.cost_type}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    cost_type: e.target
                                      .value as QuoteCostType,
                                  })
                                }
                                className={`${cellInputClass} text-gray-900`}
                              >
                                {QUOTE_COST_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.quantity}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    quantity: e.target.value,
                                  })
                                }
                                inputMode="decimal"
                                className={`${cellInputClass} w-20 text-gray-900`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.unit}
                                onChange={(e) =>
                                  updateRow(row.key, { unit: e.target.value })
                                }
                                placeholder="㎡, 개"
                                className={`${cellInputClass} w-16 text-gray-900`}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                value={row.unit_price}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    unit_price: e.target.value,
                                  })
                                }
                                inputMode="numeric"
                                className={`${cellInputClass} text-right text-gray-900`}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                value={row.amount}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    amount: e.target.value,
                                  })
                                }
                                inputMode="numeric"
                                className={`${cellInputClass} text-right font-medium text-gray-900`}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={row.is_lx_material}
                                disabled={!canCostTypeHaveLx(row.cost_type)}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    is_lx_material: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500 disabled:opacity-40"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.cost_type === "시공+자재" &&
                              row.is_lx_material ? (
                                <input
                                  value={row.lx_discount_base_amount}
                                  onChange={(e) =>
                                    updateRow(row.key, {
                                      lx_discount_base_amount: e.target.value,
                                    })
                                  }
                                  inputMode="numeric"
                                  placeholder="자재금액"
                                  className={`${cellInputClass} text-right font-medium text-gray-900`}
                                />
                              ) : (
                                <span className="text-xs text-gray-700">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(row.key)}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

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
              <Field label="일반 할인금액(원)">
                <input
                  inputMode="numeric"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="LX 자재 할인율(%)">
                <input
                  inputMode="decimal"
                  value={lxDiscountRate}
                  onChange={(e) => setLxDiscountRate(e.target.value)}
                  placeholder="0~100"
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  LX 자재 합계 {formatMoney(amounts.lx_material_sum)} · 할인{" "}
                  {formatMoney(lxDiscount)}
                </p>
              </Field>
              <div className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
                <p className="text-xs text-navy-700">최종금액</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">
                  {formatMoney(finalAmount)}
                </p>
                <p className="mt-1 text-[11px] text-navy-700/70">
                  총액 − 일반할인 − LX할인
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={step === 5 ? "space-y-4" : "hidden"}>
          <h2 className="text-base font-semibold text-gray-900">5. 파일</h2>
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

        {step === 6 && (
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
              <SummaryItem label="일반 할인" value={formatMoney(discount)} />
              <SummaryItem
                label="LX 자재 할인"
                value={`${lxDiscountRate}% · ${formatMoney(lxDiscount)}`}
              />
              <SummaryItem
                label="최종금액"
                value={formatMoney(finalAmount)}
                emphasize
              />
              <SummaryItem
                label="LX 자재 포함"
                value={amounts.is_lx_material ? "예" : "아니오"}
              />
              <SummaryItem
                label="항목 수"
                value={`${items.length}건`}
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
          </div>
        )}
      </div>

      {stepError && <p className="text-sm text-red-600">{stepError}</p>}

      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/quotes"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            취소
          </Link>
        </div>
        <div className="flex gap-2">
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
              disabled={pending}
              className="rounded-lg bg-navy-800 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {pending
                ? "저장 중..."
                : mode === "create"
                  ? "견적 등록"
                  : "견적 수정 저장"}
            </button>
          )}
        </div>
      </div>
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

const cellInputClass =
  "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
