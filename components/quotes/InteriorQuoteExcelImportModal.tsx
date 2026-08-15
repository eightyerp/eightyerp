"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInteriorQuoteImportAction } from "@/app/actions/interior-quote-import";
import InteriorQuoteErrorReviewPanel from "./InteriorQuoteErrorReviewPanel";
import {
  INTERIOR_EXCEL_MAX_BYTES,
  buildInteriorQuoteItemsPayload,
  getInteriorImportBlockingReason,
  isInteriorReferenceItem,
  parseInteriorQuoteWorkbook,
  recalculateInteriorCostItem,
  type InteriorExcelItem,
  type InteriorExcelParseResult,
} from "@/lib/crm/interior-quote-excel";
import {
  applyInteriorResolution,
  diagnoseInteriorWorkbook,
  isUnresolvedDiagnostic,
  type InteriorResolutionDraft,
  type InteriorResolutionRecord,
} from "@/lib/crm/interior-quote-diagnostics";
import {
  recognizeQuoteWorkbook,
  type TemplateRecognition,
} from "@/lib/excel-engine";
import { formatEmployeeOptionLabel } from "@/lib/crm/constants";
import type { InteriorImportCustomerOption } from "@/lib/crm/interior-quote-import";
import type { Employee } from "@/types/database";

type Props = {
  open: boolean;
  onClose: () => void;
  customers: InteriorImportCustomerOption[];
  employees: Employee[];
  lockEmployeeId?: string | null;
  defaultEmployeeId?: string | null;
};
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-100 disabled:opacity-75";
const money = (value: number) =>
  `${Math.round(value).toLocaleString("ko-KR")}원`;

export default function InteriorQuoteExcelImportModal({
  open,
  onClose,
  customers,
  employees,
  lockEmployeeId = null,
  defaultEmployeeId = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [employeeId, setEmployeeId] = useState(
    lockEmployeeId ?? defaultEmployeeId ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<InteriorExcelParseResult | null>(null);
  const [recognition, setRecognition] = useState<TemplateRecognition | null>(
    null,
  );
  const [items, setItems] = useState<InteriorExcelItem[]>([]);
  const [vatMode, setVatMode] = useState<"inclusive" | "exclusive">(
    "exclusive",
  );
  const [discount, setDiscount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "normal" | "reference" | "error">("all");
  const [repairItemId, setRepairItemId] = useState<string | null>(null);
  const [rowResolutions, setRowResolutions] = useState<Record<string, InteriorResolutionRecord>>({});
  const [aggregateConfirmations, setAggregateConfirmations] = useState<Record<string, boolean>>({});
  const selectedCustomer =
    customers.find((customer) => customer.id === customerId) ?? null;
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers.slice(0, 30);
    return customers
      .filter((customer) =>
        [
          customer.name,
          customer.phone,
          customer.address,
          ...customer.sites.flatMap((site) => [site.name, site.address]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 50);
  }, [customers, query]);
  const itemSum = items.reduce((sum, item) => sum + Math.round(item.amount), 0);
  const discounted = Math.max(0, itemSum - discount);
  const supply =
    vatMode === "inclusive" ? Math.round(discounted / 1.1) : discounted;
  const vat =
    vatMode === "inclusive" ? discounted - supply : Math.round(supply * 0.1);
  const total = supply + vat;
  const excelDifference =
    parsed?.totals.totalAmount == null ? 0 : total - parsed.totals.totalAmount;
  const diagnostics = useMemo(
    () => (parsed ? diagnoseInteriorWorkbook(items, parsed, total) : []),
    [items, parsed, total],
  );
  const unresolvedDiagnostics = diagnostics.filter((issue) =>
    isUnresolvedDiagnostic(issue, rowResolutions, aggregateConfirmations),
  );
  const rowDiagnostics = diagnostics.filter((issue) => issue.scope === "row");
  const aggregateDiagnostics = diagnostics.filter((issue) => issue.scope !== "row");
  const visibleItems = items.filter((item) => {
    const issues = rowDiagnostics.filter((issue) => issue.itemId === item.id);
    const unresolved = issues.some((issue) =>
      isUnresolvedDiagnostic(issue, rowResolutions, aggregateConfirmations),
    );
    if (statusFilter === "reference") return isInteriorReferenceItem(item);
    if (statusFilter === "error") return unresolved;
    if (statusFilter === "normal") return !isInteriorReferenceItem(item) && !unresolved;
    return true;
  });
  const referenceItemCount = items.filter(isInteriorReferenceItem).length;
  const saveBlockReason = getInteriorImportBlockingReason({
    customerId,
    employeeId,
    fileReady: Boolean(file && parsed),
    items,
    excelDifference,
    unresolvedDiagnosticCount: unresolvedDiagnostics.length,
    totalMismatchConfirmed: aggregateDiagnostics
      .filter((issue) => issue.code === "quote_total_mismatch")
      .every((issue) => aggregateConfirmations[issue.id]),
  });
  const customerMismatch = Boolean(
    parsed &&
    selectedCustomer &&
    [
      parsed.customerHints.name &&
        !selectedCustomer.name.includes(parsed.customerHints.name),
      parsed.customerHints.phone &&
        selectedCustomer.phone.replace(/\D/g, "") !==
          parsed.customerHints.phone.replace(/\D/g, ""),
      parsed.customerHints.address &&
        !(selectedCustomer.address ?? "").includes(
          parsed.customerHints.address,
        ),
    ].some(Boolean),
  );

  if (!open) return null;

  async function analyze(nextFile: File) {
    setError(null);
    setDuplicateWarnings([]);
    setParsed(null);
    setRecognition(null);
    setItems([]);
    setStatusFilter("all");
    setRepairItemId(null);
    setRowResolutions({});
    setAggregateConfirmations({});
    if (!/\.(xlsx|xls)$/i.test(nextFile.name))
      return setError("xlsx 또는 xls 파일만 선택할 수 있습니다.");
    if (nextFile.size > INTERIOR_EXCEL_MAX_BYTES)
      return setError("Excel 파일은 15MB 이하여야 합니다.");
    try {
      const buffer = await nextFile.arrayBuffer();
      const result = parseInteriorQuoteWorkbook(buffer);
      requestIdRef.current = crypto.randomUUID();
      setFile(nextFile);
      setRecognition(recognizeQuoteWorkbook(buffer));
      setParsed(result);
      setItems(result.items);
      setVatMode(result.totals.vatMode);
      setDiscount(result.totals.discountAmount);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Excel 분석에 실패했습니다.",
      );
    }
  }

  function updateItem(id: string, patch: Partial<InteriorExcelItem>) {
    setRowResolutions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setAggregateConfirmations({});
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...patch, errors: [] } : item,
      ),
    );
  }

  function updateCostItem(
    id: string,
    patch: Partial<
      Pick<
        InteriorExcelItem,
        "quantity" | "materialUnitPrice" | "laborUnitPrice"
      >
    >,
  ) {
    setRowResolutions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setAggregateConfirmations({});
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return recalculateInteriorCostItem(item, patch);
      }),
    );
  }

  function applyResolution(item: InteriorExcelItem, draft: InteriorResolutionDraft) {
    const resolved = applyInteriorResolution(item, draft);
    setItems((current) => {
      const next: InteriorExcelItem[] = [];
      for (const candidate of current) {
        next.push(candidate.id === item.id ? resolved.item : candidate);
        if (candidate.id === item.id && resolved.adjustment) next.push(resolved.adjustment);
      }
      return next;
    });
    setRowResolutions((current) => ({ ...current, [item.id]: resolved.record }));
    setAggregateConfirmations({});
    setRepairItemId(null);
  }

  function openNextError() {
    const currentIndex = unresolvedDiagnostics.findIndex((issue) => issue.itemId === repairItemId);
    const rowIssues = unresolvedDiagnostics.filter((issue) => issue.itemId);
    if (!rowIssues.length) return;
    const next = rowIssues[(currentIndex + 1 + rowIssues.length) % rowIssues.length];
    setRepairItemId(next.itemId ?? null);
    setStatusFilter("error");
    window.setTimeout(() => document.getElementById(`interior-item-${next.itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  function moveTrade(trade: string, direction: -1 | 1) {
    const trades = [...new Set(items.map((item) => item.tradeName))];
    const from = trades.indexOf(trade);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= trades.length) return;
    [trades[from], trades[to]] = [trades[to], trades[from]];
    setItems(
      [...items].sort(
        (a, b) => trades.indexOf(a.tradeName) - trades.indexOf(b.tradeName),
      ),
    );
  }

  function submit(confirmDuplicate = false) {
    if (saveBlockReason) return setError(saveBlockReason);
    if (!file || !parsed || !selectedCustomer) return;
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("confirm_duplicate", String(confirmDuplicate));
      form.set(
        "header_json",
        JSON.stringify({
          request_id: requestId,
          customer_id: selectedCustomer.id,
          assigned_employee_id: employeeId || null,
          quote_type: "인테리어",
          quote_mode: "detailed",
          title: `${selectedCustomer.name} 인테리어 견적`,
          status: "작성중",
          total_amount: itemSum,
          discount_amount: discount,
          lx_discount_rate: 0,
          lx_discount_amount: 0,
          final_amount: discounted,
          vat_mode: vatMode,
          vat_rate: 10,
          supply_amount: supply,
          vat_amount: vat,
          customer_total_amount: total,
          issued_at: new Date().toISOString().slice(0, 10),
          is_lx_material: false,
          is_contract_quote: false,
        }),
      );
      form.set(
        "items_json",
        JSON.stringify(buildInteriorQuoteItemsPayload(items)),
      );
      const result = await saveInteriorQuoteImportAction(form);
      if (result.needsDuplicateConfirmation) {
        setDuplicateWarnings(result.duplicateWarnings ?? []);
        return;
      }
      if (!result.success || !result.quoteId) {
        setError(result.error ?? "저장에 실패했습니다.");
        return;
      }
      requestIdRef.current = null;
      router.push(`/quotes/${result.quoteId}`);
      router.refresh();
    });
  }

  const grouped = [...new Set(visibleItems.map((item) => item.tradeName))];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="인테리어 견적 Excel 업로드"
    >
      <div className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">인테리어 견적 엑셀 업로드</h2>
            <p className="mt-1 text-sm text-slate-600">
              Excel 고객정보는 비교 경고에만 사용하며 기존 고객정보를 변경하지
              않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            닫기
          </button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <section>
            <label className="text-sm font-semibold">1. 기존 고객 검색</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="고객명, 연락처, 주소, 현장명"
              className={`${inputClass} mt-1`}
            />
            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
              {matches.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    setCustomerId(customer.id);
                    setEmployeeId(
                      lockEmployeeId ??
                        customer.assigned_employee_id ??
                        defaultEmployeeId ??
                        "",
                    );
                  }}
                  className={`block w-full border-b p-2 text-left text-sm hover:bg-slate-100 ${customer.id === customerId ? "bg-amber-100 ring-2 ring-inset ring-amber-400" : ""}`}
                >
                  <b>{customer.name}</b>
                  <span className="block text-xs text-slate-600">
                    {customer.phone} · {customer.address ?? "주소 없음"}
                    {customer.sites[0] ? ` · ${customer.sites[0].name}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <label className="text-sm font-semibold">2. 담당 직원</label>
            <select
              value={employeeId}
              disabled={Boolean(lockEmployeeId)}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">담당자 선택</option>
              {employees
                .filter((employee) => employee.is_active)
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {formatEmployeeOptionLabel(employee)}
                  </option>
                ))}
            </select>
            {selectedCustomer ? (
              <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">
                <b>{selectedCustomer.name}</b>
                <p className="text-slate-600">
                  {selectedCustomer.phone}
                  <br />
                  {selectedCustomer.address ?? "주소 없음"}
                </p>
              </div>
            ) : null}
          </section>
          <section>
            <label className="text-sm font-semibold">3. Excel 파일</label>
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (next) void analyze(next);
              }}
              className={`${inputClass} mt-1`}
            />
            <p className="mt-2 text-xs text-slate-600">
              xlsx/xls · 최대 15MB · 매크로 및 외부링크 차단
            </p>
            {recognition ? (
              <p
                className={`mt-2 rounded p-2 text-sm font-medium ${recognition.confidence < 70 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}
              >
                {recognition.label} · 신뢰도 {recognition.confidence}%
                {recognition.confidence < 70 ? " · 양식을 확인해 주세요" : ""}
              </p>
            ) : null}
            {parsed ? (
              <p className="mt-2 text-sm text-slate-600">
                {parsed.sheetName} · {items.length}개 항목 분석 완료
              </p>
            ) : null}
          </section>
        </div>
        {customerMismatch ? (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm font-medium text-amber-900">
            Excel 고객정보와 선택 고객이 다릅니다. 저장은 선택한 ERP 고객으로만
            연결됩니다.
          </p>
        ) : null}
        {parsed?.warnings.map((warning) => (
          <p
            key={warning}
            className="mt-2 rounded-lg bg-amber-100 p-2 text-sm text-amber-900"
          >
            {warning}
          </p>
        ))}
        {parsed ? (
          <section className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "전체", items.length],
                  ["normal", "정상", items.filter((item) => !isInteriorReferenceItem(item) && !unresolvedDiagnostics.some((issue) => issue.itemId === item.id)).length],
                  ["reference", "참고항목", referenceItemCount],
                  ["error", "오류", unresolvedDiagnostics.length],
                ] as const).map(([value, label, count]) => (
                  <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${statusFilter === value ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
                    {label} {count}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={!unresolvedDiagnostics.some((issue) => issue.itemId)} onClick={openNextError} className="rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 disabled:opacity-60">다음 오류</button>
                <button type="button" disabled={!unresolvedDiagnostics.some((issue) => issue.itemId)} onClick={openNextError} className="rounded-lg bg-amber-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">오류 일괄검토</button>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">각 오류는 개별 확인 후에만 반영됩니다. 일괄 자동수정은 제공하지 않습니다.</p>
            {aggregateDiagnostics.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {aggregateDiagnostics.map((issue) => (
                  <div key={issue.id} className={`rounded-lg border p-3 text-sm ${aggregateConfirmations[issue.id] ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                    <b>{issue.tradeName ?? "전체 견적"}</b>
                    <p>{issue.message}</p>
                    <p className="mt-1 text-xs text-slate-600">Excel {money(issue.excelAmount ?? 0)} · ERP {money(issue.erpAmount)} · 차이 {money(issue.difference)}</p>
                    <button type="button" onClick={() => setAggregateConfirmations((current) => ({ ...current, [issue.id]: true }))} className="mt-2 rounded border border-slate-400 bg-white px-2 py-1 text-xs font-bold">
                      {aggregateConfirmations[issue.id] ? "계산값 유지 확인됨" : "현재 계산값 유지 확인"}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {parsed ? (
          <div className="mt-5 space-y-4">
            {grouped.map((trade, tradeIndex) => (
              <section
                key={trade}
                className="rounded-xl border border-slate-200"
              >
                <div className="flex items-center justify-between bg-slate-100 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <input
                      value={trade}
                      onChange={(e) =>
                        setItems((current) =>
                          current.map((item) =>
                            item.tradeName === trade
                              ? { ...item, tradeName: e.target.value }
                              : item,
                          ),
                        )
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold"
                    />
                    <span className="text-sm font-semibold text-slate-600">
                      소계{" "}
                      {money(
                        items
                          .filter((item) => item.tradeName === trade)
                          .reduce((sum, item) => sum + item.amount, 0),
                      )}
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={tradeIndex === 0}
                      onClick={() => moveTrade(trade, -1)}
                      className="px-2 disabled:opacity-75"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={tradeIndex === grouped.length - 1}
                      onClick={() => moveTrade(trade, 1)}
                      className="px-2 disabled:opacity-75"
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1050px] w-full text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        {[
                          "품목",
                          "설명",
                          "수량",
                          "단위",
                          "자재단가",
                          "인건비단가",
                          "합산단가",
                          "금액",
                          "비고",
                          "",
                        ].map((label) => (
                          <th key={label} className="p-2 text-left">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems
                        .filter((item) => item.tradeName === trade)
                        .map((item) => {
                          const issues = rowDiagnostics.filter((issue) => issue.itemId === item.id);
                          const unresolved = issues.some((issue) => isUnresolvedDiagnostic(issue, rowResolutions, aggregateConfirmations));
                          return (
                          <tr
                            id={`interior-item-${item.id}`}
                            key={item.id}
                            className={`border-t hover:bg-slate-100 ${unresolved ? "bg-red-50" : isInteriorReferenceItem(item) ? "bg-sky-50" : ""}`}
                          >
                            <td className="p-1">
                              <input
                                value={item.itemName}
                                onChange={(e) =>
                                  updateItem(item.id, {
                                    itemName: e.target.value,
                                  })
                                }
                                className={inputClass}
                              />
                              {item.errors.length ? (
                                <p className="text-xs text-red-700">
                                  {item.errors.join(" · ")}
                                </p>
                              ) : null}
                              {isInteriorReferenceItem(item) ? (
                                <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                                  참고항목 · 금액 미반영
                                </span>
                              ) : null}
                              {rowResolutions[item.id] ? (
                                <span className="ml-1 mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">검토 완료</span>
                              ) : null}
                            </td>
                            <td className="p-1">
                              <input
                                value={item.specification}
                                onChange={(e) =>
                                  updateItem(item.id, {
                                    specification: e.target.value,
                                  })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateCostItem(item.id, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                value={item.unit}
                                onChange={(e) =>
                                  updateItem(item.id, { unit: e.target.value })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={item.materialUnitPrice}
                                onChange={(e) =>
                                  updateCostItem(item.id, {
                                    materialUnitPrice: Number(e.target.value),
                                  })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={item.laborUnitPrice}
                                onChange={(e) =>
                                  updateCostItem(item.id, {
                                    laborUnitPrice: Number(e.target.value),
                                  })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={item.unitPrice}
                                readOnly
                                aria-label="합산단가"
                                className={inputClass}
                              />
                            </td>
                            <td className="p-2 text-right font-semibold">
                              {money(item.amount)}
                            </td>
                            <td className="p-1">
                              <input
                                value={item.remark}
                                onChange={(e) =>
                                  updateItem(item.id, {
                                    remark: e.target.value,
                                  })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td>
                              {issues.some((issue) => issue.severity === "error") ? (
                                <button type="button" onClick={() => setRepairItemId(item.id)} className="mr-2 whitespace-nowrap rounded border border-amber-500 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">오류수정</button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  setItems((current) =>
                                    current.filter((row) => row.id !== item.id),
                                  )
                                }
                                className="text-red-700"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {repairItemId && items.some((item) => item.id === repairItemId && item.tradeName === trade) ? (() => {
                  const repairItem = items.find((item) => item.id === repairItemId)!;
                  return (
                    <div className="p-3">
                      <InteriorQuoteErrorReviewPanel
                        key={repairItem.id}
                        item={repairItem}
                        issues={rowDiagnostics.filter((issue) => issue.itemId === repairItem.id)}
                        tradeSubtotal={items.filter((item) => item.tradeName === trade).reduce((sum, item) => sum + item.amount, 0)}
                        quoteTotal={itemSum}
                        onApply={applyResolution}
                        onClose={() => setRepairItemId(null)}
                      />
                    </div>
                  );
                })() : null}
              </section>
            ))}
            <button
              type="button"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    sourceRow: 0,
                    tradeName: grouped.at(-1) ?? "기타공사",
                    itemName: "",
                    specification: "",
                    quantity: 1,
                    unit: "식",
                    unitPrice: 0,
                    amount: 0,
                    materialUnitPrice: 0,
                    materialAmount: 0,
                    laborUnitPrice: 0,
                    laborAmount: 0,
                    remark: "",
                    errors: ["품목 누락"],
                    excelOriginal: {
                      quantity: null,
                      materialUnitPrice: null,
                      materialAmount: null,
                      laborUnitPrice: null,
                      laborAmount: null,
                      amount: null,
                      invalidFields: [],
                    },
                  },
                ])
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              행 추가
            </button>
          </div>
        ) : null}
        {parsed ? (
          <div className="mt-5 grid gap-3 rounded-xl bg-slate-100 p-4 sm:grid-cols-5">
            <label className="text-sm">
              VAT
              <select
                value={vatMode}
                onChange={(e) =>
                  setVatMode(e.target.value as "inclusive" | "exclusive")
                }
                className={`${inputClass} mt-1`}
              >
                <option value="exclusive">별도</option>
                <option value="inclusive">포함</option>
              </select>
            </label>
            <label className="text-sm">
              할인/조정
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) =>
                  setDiscount(Math.max(0, Number(e.target.value)))
                }
                className={`${inputClass} mt-1`}
              />
            </label>
            <Summary label="공급가" value={money(supply)} />
            <Summary label="부가세" value={money(vat)} />
            <Summary label="ERP 총액" value={money(total)} />
            <p className="sm:col-span-5 text-sm text-slate-600">
              참고항목 {referenceItemCount.toLocaleString("ko-KR")}개는 품목과 설명을 저장하되 견적 합계에서 제외됩니다.
            </p>
            <p
              className={`sm:col-span-5 text-sm font-medium ${excelDifference ? "text-red-700" : "text-emerald-800"}`}
            >
              Excel 총액 {money(parsed.totals.totalAmount ?? 0)} · 차이{" "}
              {money(excelDifference)}
            </p>
          </div>
        ) : null}
        {duplicateWarnings.length ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
            <b>중복 가능성 확인</b>
            {duplicateWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(true)}
              className="mt-2 rounded bg-amber-900 px-3 py-2 font-medium text-white disabled:opacity-75"
            >
              확인 후 저장
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <div className="text-right">
            <button
              type="button"
              disabled={pending || Boolean(saveBlockReason)}
              onClick={() => submit(false)}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-500 disabled:opacity-100"
            >
              {pending ? "저장 중…" : "정식 견적으로 저장"}
            </button>
            {saveBlockReason ? (
              <p className="mt-2 text-sm font-medium text-amber-800">
                {saveBlockReason}
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium text-emerald-700">
                저장할 준비가 완료되었습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs text-slate-600">{label}</p>
      <b>{value}</b>
    </div>
  );
}