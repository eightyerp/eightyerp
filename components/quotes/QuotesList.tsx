"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ERP_QUOTE_STATUSES,
  ERP_QUOTE_STATUS_BADGE,
  ERP_QUOTE_TYPES,
} from "@/lib/crm/quote-constants";
import { formatEmployeeLabel } from "@/lib/crm/constants";
import { calcQuoteSummary, isQuoteExpired } from "@/lib/crm/quote-mgmt-client";
import type { Employee, ErpQuote } from "@/types/database";

type QuotesListProps = {
  quotes: ErpQuote[];
  employees: Employee[];
  newHref?: string;
  hideCustomerColumn?: boolean;
  emptyMessage?: string;
  lockEmployeeId?: string | null;
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
}: QuotesListProps) {
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    employeeId: lockEmployeeId ?? "",
  });
  const [sort, setSort] = useState<SortKey>("recent");

  function setField<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
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
        <p className="text-sm text-gray-500">
          총 {filtered.length}건
          {hasActiveFilters && ` (전체 ${quotes.length}건 중)`}
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
          <label className="mb-1 block text-xs font-medium text-gray-500">
            검색
          </label>
          <input
            value={filters.q}
            onChange={(e) => setField("q", e.target.value)}
            placeholder="고객명 · 연락처 · 공사주소 · 견적명 · 견적번호"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            견적유형
          </label>
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
          <label className="mb-1 block text-xs font-medium text-gray-500">
            상태
          </label>
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
            <label className="mb-1 block text-xs font-medium text-gray-500">
              담당자
            </label>
            <select
              value={filters.employeeId}
              onChange={(e) => setField("employeeId", e.target.value)}
              className={inputClass}
            >
              <option value="">전체</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {formatEmployeeLabel(employee.name, employee.title)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            작성일 시작
          </label>
          <input
            type="date"
            value={filters.createdFrom}
            onChange={(e) => setField("createdFrom", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            작성일 종료
          </label>
          <input
            type="date"
            value={filters.createdTo}
            onChange={(e) => setField("createdTo", e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.lxOnly}
              onChange={(e) => setField("lxOnly", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            LX만
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
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
            onClick={() =>
              setFilters({
                ...EMPTY_FILTERS,
                employeeId: lockEmployeeId ?? "",
              })
            }
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            필터 초기화
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="dashboard-card px-5 py-12 text-center text-sm text-gray-500">
          {quotes.length === 0
            ? emptyMessage
            : "검색 조건에 맞는 견적이 없습니다."}
        </div>
      ) : (
        <div className="dashboard-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">작성일</th>
                  {!hideCustomerColumn && (
                    <th className="px-4 py-3 font-medium">고객명</th>
                  )}
                  <th className="px-4 py-3 font-medium">연락처</th>
                  <th className="px-4 py-3 font-medium">공사주소</th>
                  <th className="px-4 py-3 font-medium">견적유형</th>
                  <th className="px-4 py-3 font-medium">견적명</th>
                  <th className="px-4 py-3 font-medium">버전</th>
                  <th className="px-4 py-3 font-medium text-right">총금액</th>
                  <th className="px-4 py-3 font-medium text-right">할인</th>
                  <th className="px-4 py-3 font-medium text-right">최종금액</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">담당자</th>
                  <th className="px-4 py-3 font-medium">발송일</th>
                  <th className="px-4 py-3 font-medium">유효기간</th>
                  <th className="px-4 py-3 font-medium">LX</th>
                  <th className="px-4 py-3 font-medium">계약견적</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((quote) => {
                  const expired = isQuoteExpired(quote);
                  return (
                    <tr
                      key={quote.id}
                      className={`border-b border-gray-50 hover:bg-gray-50/80 ${expired ? "bg-red-50/40" : ""}`}
                    >
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(quote.created_at)}
                      </td>
                      {!hideCustomerColumn && (
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="hover:text-navy-800 hover:underline"
                          >
                            {quote.customers?.name ?? "-"}
                          </Link>
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600">
                        {quote.customers?.phone ?? "-"}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-gray-600">
                        {quote.customers?.address ?? "-"}
                      </td>
                      <td className="px-4 py-3">{quote.quote_type}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="font-medium hover:underline"
                        >
                          {quote.title}
                        </Link>
                        {quote.quote_number && (
                          <p className="text-xs text-gray-400">
                            {quote.quote_number}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">v{quote.version_number}</td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(quote.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {quote.discount_amount
                          ? `-${formatMoney(quote.discount_amount)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatMoney(quote.final_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            ERP_QUOTE_STATUS_BADGE[quote.status] ??
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {quote.employees
                          ? formatEmployeeLabel(
                              quote.employees.name,
                              quote.employees.title,
                            )
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(quote.sent_at)}
                      </td>
                      <td
                        className={`px-4 py-3 ${expired ? "font-semibold text-red-600" : "text-gray-500"}`}
                      >
                        {formatDate(quote.valid_until)}
                        {expired ? " · 만료" : ""}
                      </td>
                      <td className="px-4 py-3">
                        {quote.is_lx_material ? (
                          <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-xs font-semibold text-navy-800">
                            LX
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {quote.is_contract_quote ? (
                          <span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs font-semibold text-gold-400">
                            계약견적
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-navy-900">{value}</p>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
