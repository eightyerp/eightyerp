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
  INTERIOR_TRADE_SUGGESTIONS,
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
  return {
    key: rowKey(),
    trade_name: source?.trade_name ?? "",
    item_name: source?.item_name ?? "",
    description: source?.description ?? "",
    quantity: source?.quantity ?? "",
    unit: source?.unit ?? "",
    unit_price: source?.unit_price ?? "0",
    amount: source?.amount ?? "0",
  };
}

function toNumber(value: string): number {
  const num = Number(String(value).replace(/,/g, "").trim() || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
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
  const [isLxMaterial, setIsLxMaterial] = useState(
    Boolean(initialQuote?.is_lx_material),
  );

  const [totalAmount, setTotalAmount] = useState(
    String(initialQuote?.total_amount ?? 0),
  );
  const [discountAmount, setDiscountAmount] = useState(
    String(initialQuote?.discount_amount ?? 0),
  );
  const [finalAmountOverride, setFinalAmountOverride] = useState<
    string | null
  >(null);

  const [items, setItems] = useState<TradeItemRow[]>(() =>
    (initialQuote?.quote_items ?? []).map((item) =>
      toRow({
        trade_name: item.trade_name,
        item_name: item.item_name ?? "",
        description: item.description ?? "",
        quantity: item.quantity != null ? String(item.quantity) : "",
        unit: item.unit ?? "",
        unit_price: String(item.unit_price),
        amount: String(item.amount),
      }),
    ),
  );
  const [customTrade, setCustomTrade] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const isInterior = quoteType === "인테리어";

  const itemsTotal = useMemo(
    () => items.reduce((sum, row) => sum + toNumber(row.amount), 0),
    [items],
  );

  const total = isInterior ? itemsTotal : toNumber(totalAmount);
  const discount = toNumber(discountAmount);
  const computedFinal = Math.max(0, total - discount);
  const finalAmount =
    finalAmountOverride != null ? toNumber(finalAmountOverride) : computedFinal;

  useEffect(() => {
    if (state.success && mode === "edit" && state.quoteId) {
      router.push(`/quotes/${state.quoteId}`);
    }
  }, [state, mode, router]);

  // 신규 등록: 선택한 고객의 담당자를 견적 담당자로 자동 반영 (수정 화면은 기존값 유지)
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

  function addTradeRow(tradeName: string) {
    const name = tradeName.trim();
    if (!name) return;
    setItems((prev) => [...prev, toRow({ trade_name: name })]);
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
    if (step === 4 && isInterior && items.length === 0) {
      setStepError("공종 내역을 1개 이상 추가해 주세요.");
      return;
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
      trade_name: row.trade_name,
      item_name: row.item_name || null,
      description: row.description || null,
      quantity: row.quantity ? toNumber(row.quantity) : null,
      unit: row.unit || null,
      unit_price: toNumber(row.unit_price),
      amount: toNumber(row.amount),
    })),
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="quote_type" value={quoteType} />
      <input type="hidden" name="total_amount" value={String(total)} />
      <input type="hidden" name="discount_amount" value={String(discount)} />
      <input type="hidden" name="final_amount" value={String(finalAmount)} />
      <input type="hidden" name="items_json" value={itemsJson} />
      <input
        type="hidden"
        name="is_lx_material"
        value={isLxMaterial ? "on" : ""}
      />
      {mode === "edit" && initialQuote && (
        <input type="hidden" name="quote_id" value={initialQuote.id} />
      )}

      {/* Step indicator */}
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
                  onClick={() => {
                    setQuoteType(type);
                    if (type !== "창호") setIsLxMaterial(false);
                  }}
                  className={`rounded-xl border-2 px-4 py-6 text-center text-sm font-semibold transition ${
                    quoteType === type
                      ? "border-navy-800 bg-navy-800/5 text-navy-900"
                      : "border-gray-200 text-gray-600 hover:border-gold-400"
                  }`}
                >
                  {type}
                  <p className="mt-1 text-xs font-normal text-gray-400">
                    {type === "창호"
                      ? "총금액/할인/최종금액 입력, LX자재 여부"
                      : type === "인테리어"
                        ? "공종별 금액 입력 · 자동 합계"
                        : "기타 견적 (자유 입력)"}
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
                  name="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 당산2차 204동 702호 창호 견적"
                  className={inputClass}
                />
              </Field>
              <Field label="견적번호">
                <input
                  name="quote_number"
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  placeholder="사내 관리번호 (선택)"
                  className={inputClass}
                />
              </Field>
              <Field label="상태">
                <select
                  name="status"
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
                  name="assigned_employee_id"
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
                  name="issued_at"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="유효기간">
                <input
                  type="date"
                  name="valid_until"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="내부 메모 (고객 비공개)" className="md:col-span-2">
                <textarea
                  name="memo"
                  rows={3}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="내부 참고용 메모"
                  className={`${inputClass} resize-y`}
                />
              </Field>
              <Field label="고객용 안내 문구 (발송 시, 선택)" className="md:col-span-2">
                <textarea
                  name="customer_message"
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

            {!isInterior ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="총견적금액(원)">
                    <input
                      inputMode="numeric"
                      value={totalAmount}
                      onChange={(e) => {
                        setTotalAmount(e.target.value);
                        setFinalAmountOverride(null);
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="할인금액(원)">
                    <input
                      inputMode="numeric"
                      value={discountAmount}
                      onChange={(e) => {
                        setDiscountAmount(e.target.value);
                        setFinalAmountOverride(null);
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="최종금액(원)">
                    <input
                      inputMode="numeric"
                      value={
                        finalAmountOverride != null
                          ? finalAmountOverride
                          : String(computedFinal)
                      }
                      onChange={(e) => setFinalAmountOverride(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                {quoteType === "창호" && (
                  <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={isLxMaterial}
                      onChange={(e) => setIsLxMaterial(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                    />
                    LX하우시스 자재 사용
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    공종 빠른 추가
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INTERIOR_TRADE_SUGGESTIONS.map((trade) => (
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

                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                        <th className="px-3 py-2 font-medium">공종</th>
                        <th className="px-3 py-2 font-medium">품목</th>
                        <th className="px-3 py-2 font-medium">수량</th>
                        <th className="px-3 py-2 font-medium">단위</th>
                        <th className="px-3 py-2 font-medium text-right">
                          단가
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          금액
                        </th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-8 text-center text-sm text-gray-400"
                          >
                            공종을 추가해 주세요.
                          </td>
                        </tr>
                      ) : (
                        items.map((row) => (
                          <tr key={row.key} className="border-b border-gray-50">
                            <td className="px-3 py-2">
                              <input
                                value={row.trade_name}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    trade_name: e.target.value,
                                  })
                                }
                                className={cellInputClass}
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
                                className={cellInputClass}
                              />
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
                                className={`${cellInputClass} w-20`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.unit}
                                onChange={(e) =>
                                  updateRow(row.key, { unit: e.target.value })
                                }
                                placeholder="㎡, 개"
                                className={`${cellInputClass} w-16`}
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
                                className={`${cellInputClass} text-right`}
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
                                className={`${cellInputClass} text-right font-medium`}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(row.key)}
                                className="text-xs text-red-500 hover:text-red-700"
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

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
                    <p className="text-xs text-gray-500">공종 합계</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatMoney(itemsTotal)}
                    </p>
                  </div>
                  <Field label="할인금액(원)">
                    <input
                      inputMode="numeric"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <div className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
                    <p className="text-xs text-navy-700">최종금액</p>
                    <p className="mt-1 text-lg font-semibold text-navy-900">
                      {formatMoney(computedFinal)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
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
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              6. 확인·저장
            </h2>
            <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-4 text-sm md:grid-cols-2">
              <SummaryItem label="고객" value={selectedCustomer?.name ?? "-"} />
              <SummaryItem label="견적유형" value={quoteType || "-"} />
              <SummaryItem label="견적명" value={title || "-"} />
              <SummaryItem label="견적번호" value={quoteNumber || "-"} />
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
              <SummaryItem label="할인금액" value={formatMoney(discount)} />
              <SummaryItem
                label="최종금액"
                value={formatMoney(finalAmount)}
                emphasize
              />
              <SummaryItem
                label="LX자재"
                value={isLxMaterial ? "예" : "아니오"}
              />
              {isInterior && (
                <SummaryItem
                  label="공종 항목 수"
                  value={`${items.length}건`}
                />
              )}
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
