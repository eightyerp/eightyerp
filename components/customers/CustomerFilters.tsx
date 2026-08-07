"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  CUSTOMER_STATUSES,
  INTEREST_ITEMS,
  formatEmployeeLabel,
} from "@/lib/crm/constants";
import {
  buildCustomerSearchHref,
  CUSTOMER_SEARCH_DEBOUNCE_MS,
} from "@/lib/crm/customer-list-query";
import type { EmployeeOption, LeadSourceOption } from "@/types/database";

type CustomerFiltersProps = {
  employees: EmployeeOption[];
  leadSources: LeadSourceOption[];
  /** Bundle E: 관리자만 담당자 필터 표시 */
  canFilterByAssignee?: boolean;
};

export default function CustomerFilters({
  employees,
  leadSources,
  canFilterByAssignee = true,
}: CustomerFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const queryFromUrl = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(queryFromUrl);
  const lastSubmittedQuery = useRef(queryFromUrl.trim());
  const searchSequence = useRef(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery === lastSubmittedQuery.current) return;

    const sequence = ++searchSequence.current;
    const timer = window.setTimeout(() => {
      if (sequence !== searchSequence.current) return;

      lastSubmittedQuery.current = normalizedQuery;

      startTransition(() => {
        router.replace(
          buildCustomerSearchHref(searchParams.toString(), normalizedQuery),
          { scroll: false },
        );
      });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, router, searchParams]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    const fields = [
      "q",
      "employeeId",
      "leadSourceId",
      "status",
      "interestItem",
      "dateFrom",
      "dateTo",
      "contact",
    ] as const;

    for (const field of fields) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) params.set(field, value);
    }

    lastSubmittedQuery.current = String(formData.get("q") ?? "").trim();
    searchSequence.current += 1;

    // preserve contact from URL if form doesn't include it but dashboard linked here
    const contactFromUrl = searchParams.get("contact");
    if (!params.get("contact") && contactFromUrl) {
      // only keep if user didn't clear via empty select — contact is in form
    }

    startTransition(() => {
      router.push(`/customers?${params.toString()}`);
    });
  }

  function handleReset() {
    setQuery("");
    lastSubmittedQuery.current = "";
    searchSequence.current += 1;
    startTransition(() => {
      router.push("/customers");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="dashboard-card grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <div className="md:col-span-2 xl:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          검색
        </label>
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="고객명 · 연락처 · 주소 · 현장명"
          aria-busy={pending}
          className={inputClass}
        />
      </div>

      {canFilterByAssignee && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            담당자
          </label>
          <select
            name="employeeId"
            defaultValue={searchParams.get("employeeId") ?? ""}
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
        <label className="mb-1 block text-xs font-medium text-slate-600">
          상담상태
        </label>
        <select
          name="status"
          defaultValue={searchParams.get("status") ?? ""}
          className={inputClass}
        >
          <option value="">전체</option>
          {CUSTOMER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          유입경로
        </label>
        <select
          name="leadSourceId"
          defaultValue={searchParams.get("leadSourceId") ?? ""}
          className={inputClass}
        >
          <option value="">전체</option>
          {leadSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          관심공종
        </label>
        <select
          name="interestItem"
          defaultValue={searchParams.get("interestItem") ?? ""}
          className={inputClass}
        >
          <option value="">전체</option>
          {INTEREST_ITEMS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          등록일 시작
        </label>
        <input
          type="date"
          name="dateFrom"
          defaultValue={searchParams.get("dateFrom") ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          등록일 종료
        </label>
        <input
          type="date"
          name="dateTo"
          defaultValue={searchParams.get("dateTo") ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          연락일정
        </label>
        <select
          name="contact"
          defaultValue={searchParams.get("contact") ?? ""}
          className={inputClass}
        >
          <option value="">전체</option>
          <option value="today">오늘 연락</option>
          <option value="overdue">기한 경과</option>
          <option value="soon">3일 이내</option>
          <option value="this_week">이번 주</option>
        </select>
      </div>

      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-75"
        >
          {pending ? "조회 중..." : "조회"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-slate-100"
        >
          초기화
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
