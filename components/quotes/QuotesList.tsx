"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ERP_QUOTE_STATUSES,
  ERP_QUOTE_STATUS_BADGE,
  ERP_QUOTE_TYPES,
  resolveQuoteVatDisplayAmounts,
} from "@/lib/crm/quote-constants";
import { formatEmployeeOptionLabel } from "@/lib/crm/constants";
import { calcQuoteSummary, isQuoteExpired } from "@/lib/crm/quote-mgmt-client";
import { QUOTE_SEARCH_DEBOUNCE_MS } from "@/lib/crm/quote-list-query";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { consumeQuoteListFlash } from "@/lib/crm/quote-list-flash";
import type { InteriorImportCustomerOption } from "@/lib/crm/interior-quote-import";
import type { Employee, ErpQuote } from "@/types/database";

const InteriorQuoteExcelImportModal = dynamic(
  () => import("@/components/quotes/InteriorQuoteExcelImportModal"),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      >
        <div className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-xl">
          Excel 가져오기를 준비 중입니다…
        </div>
      </div>
    ),
  },
);

type QuotesListProps = {
  quotes: ErpQuote[];
  employees: Employee[];
  newHref?: string;
  hideCustomerColumn?: boolean;
  emptyMessage?: string;
  lockEmployeeId?: string | null;
  importCustomers?: InteriorImportCustomerOption[];
  initialFilters?: Record<string, string | undefined>;
  page?: number;
  total?: number;
  totalPages?: number;
};

type Filters = {
  q: string;
  quoteType: string;
  status: string;
  employeeId: string;
  lxOnly: boolean;
  contractOnly: boolean;
  createdFrom: string;
  createdTo: string;
};

type SortKey =
  | "recent"
  | "amount_desc"
  | "amount_asc"
  | "customer"
  | "valid_until";

const EMPTY_FILTERS: Filters = {
  q: "",
  quoteType: "",
  status: "",
  employeeId: "",
  lxOnly: false,
  contractOnly: false,
  createdFrom: "",
  createdTo: "",
};

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function QuotesList({
  quotes,
  employees,
  newHref = "/quotes/new",
  hideCustomerColumn = false,
  emptyMessage = "등록된 견적이 없습니다.",
  lockEmployeeId = null,
  importCustomers = [],
  initialFilters,
  page = 1,
  total = quotes.length,
  totalPages = 1,
}: QuotesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useState<Filters>({
    q: initialFilters?.q ?? "",
    quoteType: initialFilters?.quoteType ?? "",
    status: initialFilters?.status ?? "",
    employeeId: lockEmployeeId ?? initialFilters?.employeeId ?? "",
    lxOnly: initialFilters?.lxOnly === "true",
    contractOnly: initialFilters?.contractOnly === "true",
    createdFrom: initialFilters?.createdFrom ?? "",
    createdTo: initialFilters?.createdTo ?? "",
  });
  const [sort, setSort] = useState<SortKey>("recent");
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [highlightQuoteId, setHighlightQuoteId] = useState<string | null>(null);
  const [interiorImportOpen, setInteriorImportOpen] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  const lastSubmittedQuery = useRef(filters.q.trim());
  const searchSequence = useRef(0);

  function navigateWithFilters(next: Filters) {
    const params = new URLSearchParams(searchParams.toString());
    const values: Record<string, string> = {
      q: next.q.trim(),
      quoteType: next.quoteType,
      status: next.status,
      employeeId: lockEmployeeId ? "" : next.employeeId,
      lxOnly: next.lxOnly ? "true" : "",
      contractOnly: next.contractOnly ? "true" : "",
      createdFrom: next.createdFrom,
      createdTo: next.createdTo,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `/quotes?${query}` : "/quotes", { scroll: false });
    });
  }

  useEffect(() => {
    const normalizedQuery = filters.q.trim();
    if (normalizedQuery === lastSubmittedQuery.current) return;
    const sequence = ++searchSequence.current;
    const timer = window.setTimeout(() => {
      if (sequence !== searchSequence.current) return;
      lastSubmittedQuery.current = normalizedQuery;
      const params = new URLSearchParams(searchParams.toString());
      if (normalizedQuery) params.set("q", normalizedQuery);
      else params.delete("q");
      params.delete("page");
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `/quotes?${query}` : "/quotes", { scroll: false });
      });
    }, QUOTE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.q, router, searchParams]);

  useEffect(() => {
    const flash = consumeQuoteListFlash();
    if (!flash) return;

    router.refresh();

    const applyFlash = window.setTimeout(() => {
      setSaveToast("견적이 저장되었습니다");
      setHighlightQuoteId(flash.quoteId);
      document
        .getElementById(`quote-row-${flash.quoteId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightQuoteId(null);
    }, 4500);
    const toastTimer = window.setTimeout(() => setSaveToast(null), 4000);

    return () => {
      window.clearTimeout(applyFlash);
      window.clearTimeout(toastTimer);
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, [router]);

  function setField<K extends keyof Filters>(key: K, value: Filters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (key !== "q") navigateWithFilters(next);
  }

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    let list = quotes.filter((quote) => {
      if (q) {
        const haystack = [
          quote.customers?.name,
          quote.customers?.phone,
          quote.customers?.address,
          quote.title,
          quote.quote_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.quoteType && quote.quote_type !== filters.quoteType) {
        return false;
      }
      if (filters.status && quote.status !== filters.status) return false;
      const empFilter = lockEmployeeId || filters.employeeId;
      if (empFilter && quote.assigned_employee_id !== empFilter) return false;
      if (filters.lxOnly && !quote.is_lx_material) return false;
      if (filters.contractOnly && !quote.is_contract_quote) return false;
      if (filters.createdFrom) {
        if (quote.created_at < `${filters.createdFrom}T00:00:00`) return false;
      }
      if (filters.createdTo) {
        if (quote.created_at > `${filters.createdTo}T23:59:59`) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "amount_desc":
          return (b.final_amount || 0) - (a.final_amount || 0);
        case "amount_asc":
          return (a.final_amount || 0) - (b.final_amount || 0);
        case "customer":
          return (a.customers?.name || "").localeCompare(
            b.customers?.name || "",
            "ko",
          );
        case "valid_until": {
          const av = a.valid_until || "9999-99-99";
          const bv = b.valid_until || "9999-99-99";
          return av.localeCompare(bv);
        }
        case "recent":
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
    return list;
  }, [quotes, filters, sort, lockEmployeeId]);

  const summary = useMemo(() => calcQuoteSummary(filtered), [filtered]);

  const hasActiveFilters = useMemo(
    () =>
      JSON.stringify({ ...filters, employeeId: lockEmployeeId ? "" : filters.employeeId }) !==
      JSON.stringify(EMPTY_FILTERS),
    [filters, lockEmployeeId],
  );

  return (
    <div className="space-y-4">
      {saveToast ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {saveToast}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="전체 견적" value={`${summary.totalCount}건`} />
        <SummaryCard label="작성중" value={`${summary.drafting}건`} />
        <SummaryCard label="발송완료" value={`${summary.sent}건`} />
        <SummaryCard label="계약전환" value={`${summary.contracted}건`} />
        <SummaryCard
          label="이번달 견적금액"
          value={formatMoney(summary.monthAmount)}
        />
        <SummaryCard
          label="이번달 계약견적"
          value={formatMoney(summary.monthContractAmount)}
          highlight
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          총 {total}건
          {hasActiveFilters && ` (현재 페이지 ${filtered.length}건)`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={inputClass}
          >
            <option value="recent">최근 작성순</option>
            <option value="amount_desc">높은 금액순</option>
            <option value="amount_asc">낮은 금액순</option>
            <option value="customer">고객명순</option>
            <option value="valid_until">유효기간순</option>
          </select>
          <button
            type="button"
            onClick={() => setInteriorImportOpen(true)}
            className="rounded-lg border border-amber-400 bg-amber-100 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-200"
          >
            인테리어 엑셀 업로드
          </button>
          <Link
            href={newHref}
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-700"
          >
            새 견적 등록
          </Link>
        </div>
      </div>

      <div className="dashboard-card grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-2">
          <label className={filterLabelClass}>검색</label>
          <input
            value={filters.q}
            onChange={(e) => setField("q", e.target.value)}
            placeholder="고객명 · 연락처 · 공사주소 · 견적명 · 견적번호"
            className={inputClass}
          />
        </div>
        <div>
          <label className={filterLabelClass}>견적유형</label>
          <select
            value={filters.quoteType}
            onChange={(e) => setField("quoteType", e.target.value)}
            className={inputClass}
          >
            <option value="">전체</option>
            {ERP_QUOTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={filterLabelClass}>상태</label>
          <select
            value={filters.status}
            onChange={(e) => setField("status", e.target.value)}
            className={inputClass}
          >
            <option value="">전체</option>
            {ERP_QUOTE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        {!lockEmployeeId && (
          <div>
            <label className={filterLabelClass}>담당자</label>
            <select
              value={filters.employeeId}
              onChange={(e) => setField("employeeId", e.target.value)}
              className={inputClass}
            >
              <option value="">전체</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {formatEmployeeOptionLabel(employee)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={filterLabelClass}>작성일 시작</label>
          <input
            type="date"
            value={filters.createdFrom}
            onChange={(e) => setField("createdFrom", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={filterLabelClass}>작성일 종료</label>
          <input
            type="date"
            value={filters.createdTo}
            onChange={(e) => setField("createdTo", e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-1.5 text-sm text-slate-900">
            <input
              type="checkbox"
              checked={filters.lxOnly}
              onChange={(e) => setField("lxOnly", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            LX만
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-900">
            <input
              type="checkbox"
              checked={filters.contractOnly}
              onChange={(e) => setField("contractOnly", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            계약견적만
          </label>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              const next = {
                ...EMPTY_FILTERS,
                employeeId: lockEmployeeId ?? "",
              };
              searchSequence.current += 1;
              lastSubmittedQuery.current = "";
              setFilters(next);
              navigateWithFilters(next);
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100"
          >
            필터 초기화
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="dashboard-card px-5 py-12 text-center text-sm text-slate-600">
          {quotes.length === 0
            ? emptyMessage
            : "검색 조건에 맞는 견적이 없습니다."}
        </div>
      ) : (
        <div className="dashboard-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2220px] table-fixed text-left text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-medium text-slate-600">
                  <th className="w-[108px] whitespace-nowrap px-3 py-3 break-keep">
                    작성일
                  </th>
                  {!hideCustomerColumn && (
                    <th className="w-[168px] whitespace-nowrap px-3 py-3 break-keep">
                      고객명
                    </th>
                  )}
                  <th className="w-[128px] whitespace-nowrap px-3 py-3 break-keep">
                    연락처
                  </th>
                  <th className="w-[200px] whitespace-nowrap px-3 py-3 break-keep">
                    공사주소
                  </th>
                  <th className="w-[96px] whitespace-nowrap px-3 py-3 break-keep">
                    견적유형
                  </th>
                  <th className="w-[220px] whitespace-nowrap px-3 py-3 break-keep">
                    견적명
                  </th>
                  <th className="w-[72px] whitespace-nowrap px-3 py-3 break-keep">
                    버전
                  </th>
                  <th className="min-w-[180px] w-[180px] whitespace-nowrap px-4 py-3 text-right break-keep">
                    총금액
                  </th>
                  <th className="min-w-[180px] w-[180px] whitespace-nowrap px-4 py-3 text-right break-keep">
                    할인
                  </th>
                  <th className="min-w-[200px] w-[200px] whitespace-nowrap px-4 py-3 pr-5 text-right break-keep">
                    고객 최종금액
                  </th>
                  <th className="min-w-[100px] w-[112px] whitespace-nowrap px-4 py-3 pl-5 break-keep">
                    상태
                  </th>
                  <th className="w-[128px] whitespace-nowrap px-3 py-3 break-keep">
                    담당자
                  </th>
                  <th className="w-[108px] whitespace-nowrap px-3 py-3 break-keep">
                    발송일
                  </th>
                  <th className="w-[120px] whitespace-nowrap px-3 py-3 break-keep">
                    유효기간
                  </th>
                  <th className="w-[64px] whitespace-nowrap px-3 py-3 break-keep">
                    LX
                  </th>
                  <th className="w-[96px] whitespace-nowrap px-3 py-3 break-keep">
                    계약견적
                  </th>
                  <th className="w-[120px] whitespace-nowrap px-3 py-3 break-keep">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filtered.map((quote) => {
                  const customerTotalAmount = resolveQuoteVatDisplayAmounts({
                    discountedAmount: quote.final_amount,
                    quoteType: quote.quote_type,
                    vatMode: quote.vat_mode,
                    vatRate: quote.vat_rate,
                    supplyAmount: quote.supply_amount,
                    vatAmount: quote.vat_amount,
                    customerTotalAmount: quote.customer_total_amount,
                  }).customer_total_amount;
                  const expired = isQuoteExpired(quote);
                  const isContract = Boolean(quote.is_contract_quote);
                  const customerName = quote.customers?.name ?? "-";
                  const address = quote.customers?.address ?? "-";
                  const title = quote.title || "-";
                  const assignee = quote.employees
                    ? formatEmployeeOptionLabel(quote.employees)
                    : "-";

                  return (
                    <tr
                      id={`quote-row-${quote.id}`}
                      key={quote.id}
                      className={`border-b border-slate-100 transition-colors ${
                        highlightQuoteId === quote.id
                          ? "bg-amber-50 ring-2 ring-inset ring-amber-300"
                          : isContract
                            ? "border-l-4 border-l-emerald-500 bg-emerald-50/50 hover:bg-emerald-50/80"
                            : expired
                              ? "bg-red-50/40 hover:bg-red-50/60"
                              : "hover:bg-slate-100/80"
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-slate-600 break-keep">
                        {formatDate(quote.created_at)}
                      </td>
                      {!hideCustomerColumn && (
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap break-keep">
                            <Link
                              href={`/quotes/${quote.id}`}
                              prefetch={false}
                              title={customerName}
                              className="truncate text-[15px] font-semibold text-navy-900 hover:underline"
                            >
                              {customerName}
                            </Link>
                            {isContract ? (
                              <span className="inline-flex shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-semibold text-emerald-800 ring-1 ring-emerald-300">
                                계약 고객
                              </span>
                            ) : null}
                          </div>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-900 break-keep">
                        {quote.customers?.phone ?? "-"}
                      </td>
                      <td className="max-w-0 truncate px-3 py-2.5 text-sm text-slate-900">
                        <span title={address} className="block truncate">
                          {address}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-sm font-medium text-slate-900 break-keep">
                        {quote.quote_type}
                      </td>
                      <td className="max-w-0 px-3 py-2.5">
                        <Link
                          href={`/quotes/${quote.id}`}
                          prefetch={false}
                          title={title}
                          className="block truncate text-[15px] font-semibold text-navy-900 hover:underline"
                        >
                          {title}
                        </Link>
                        {quote.quote_number ? (
                          <p
                            className="truncate text-[13px] text-slate-600"
                            title={quote.quote_number}
                          >
                            {quote.quote_number}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-900 break-keep">
                        v{quote.version_number}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-navy-900 break-keep">
                        {formatMoney(quote.total_amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm tabular-nums text-slate-600 break-keep">
                        {(quote.discount_amount || 0) +
                        (quote.lx_discount_amount || 0)
                          ? `-${formatMoney(
                              (quote.discount_amount || 0) +
                                (quote.lx_discount_amount || 0),
                            )}`
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 pr-5 text-right text-[15px] font-bold tabular-nums text-navy-900 break-keep">
                        {formatMoney(customerTotalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 pl-5 break-keep">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold break-keep ${
                            ERP_QUOTE_STATUS_BADGE[quote.status] ??
                            "bg-slate-100 text-slate-900"
                          }`}
                        >
                          {quote.status}
                        </span>
                      </td>
                      <td
                        className="truncate whitespace-nowrap px-3 py-2.5 text-sm text-slate-900 break-keep"
                        title={assignee}
                      >
                        {assignee}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-slate-600 break-keep">
                        {formatDate(quote.sent_at)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 text-[13px] break-keep ${
                          expired
                            ? "font-semibold text-red-700"
                            : "text-slate-600"
                        }`}
                      >
                        {formatDate(quote.valid_until)}
                        {expired ? " · 만료" : ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 break-keep">
                        {quote.is_lx_material ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-900 ring-1 ring-amber-300">
                            LX
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 break-keep">
                        {isContract ? (
                          <span className="inline-flex rounded-full bg-emerald-700 px-2 py-0.5 text-[13px] font-semibold text-white">
                            계약견적
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 break-keep">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/quotes/${quote.id}/edit`}
                            prefetch={false}
                            aria-label={`${title} 견적 수정`}
                            className="inline-flex rounded-md bg-navy-800 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-navy-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            수정
                          </Link>
                          <Link
                            href={`/quotes/${quote.id}`}
                            prefetch={false}
                            aria-label={`${title} 견적 상세`}
                            className="inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-900 hover:bg-slate-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            상세
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {totalPages > 1 ? (
        <QuotePagination
          page={page}
          totalPages={totalPages}
          searchParams={searchParams}
        />
      ) : null}
      {interiorImportOpen ? (
        <InteriorQuoteExcelImportModal
          open
          onClose={() => setInteriorImportOpen(false)}
          customers={importCustomers}
          employees={employees}
          lockEmployeeId={lockEmployeeId}
        />
      ) : null}
    </div>
  );
}

function QuotePagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: ReadonlyURLSearchParams;
}) {
  function href(targetPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (targetPage > 1) params.set("page", String(targetPage));
    else params.delete("page");
    const query = params.toString();
    return query ? `/quotes?${query}` : "/quotes";
  }

  return (
    <nav
      aria-label="견적 목록 페이지"
      className="flex items-center justify-center gap-2"
    >
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={page <= 1 ? disabledPageClass : pageClass}
      >
        이전
      </Link>
      <span className="text-sm text-slate-600">
        {page} / {totalPages}
      </span>
      <Link
        href={href(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={page >= totalPages ? disabledPageClass : pageClass}
      >
        다음
      </Link>
    </nav>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${highlight ? "border-gold-300 bg-gold-50" : "border-gray-200 bg-white"}`}
    >
      <p className="text-[13px] text-slate-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-navy-900">{value}</p>
    </div>
  );
}

const filterLabelClass =
  "mb-1 block text-sm font-medium text-slate-600";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

const pageClass =
  "rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100";
const disabledPageClass =
  "pointer-events-none rounded-lg border border-gray-100 px-3 py-1.5 text-sm font-medium text-slate-400";
